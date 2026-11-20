import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionCookie,
  hashPin,
  isAdminRequest,
  isHttpsRequest,
  verifyPin,
} from '@/lib/admin-auth';
import { getTrustedClientIp } from '@/lib/client-ip';
import {
  ADMIN_LOGIN_POLICY,
  checkRateLimit,
  clearRateLimit,
  recordRateLimitFailure,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureSqlitePragmas();
  const authenticated = await isAdminRequest(request);
  return NextResponse.json({ authenticated });
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const clientIp = getTrustedClientIp(request);
    const rateCheck = checkRateLimit('admin_login', clientIp, ADMIN_LOGIN_POLICY);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Try again in ${rateCheck.retryAfterSeconds}s.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!pin) {
      return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
    }

    const pinSetting = await prisma.setting.findUnique({
      where: { key: 'admin_pin' },
    });
    const storedPin = pinSetting?.value || process.env.ADMIN_PIN || '1234';

    if (!verifyPin(pin, storedPin)) {
      const failResult = recordRateLimitFailure('admin_login', clientIp, ADMIN_LOGIN_POLICY);
      if (failResult.locked) {
        return NextResponse.json(
          { error: 'Incorrect Admin PIN. Account temporarily locked due to repeated failures.', retryAfterSeconds: failResult.retryAfterSeconds },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: 'Incorrect Admin PIN' }, { status: 401 });
    }

    clearRateLimit('admin_login', clientIp);

    // Auto-upgrade legacy plaintext PIN (or missing DB row) to scrypt hash
    if (!pinSetting || !pinSetting.value.startsWith('scrypt:')) {
      await prisma.setting.upsert({
        where: { key: 'admin_pin' },
        update: { value: hashPin(pin) },
        create: { key: 'admin_pin', value: hashPin(pin) },
      });
    }

    const cookieToken = await createAdminSessionCookie();
    const response = NextResponse.json({ success: true, message: 'Authentication successful' });

    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, cookieToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      secure: isHttpsRequest(request),
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    secure: isHttpsRequest(request),
  });
  return response;
}
