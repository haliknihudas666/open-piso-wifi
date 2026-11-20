import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

export const ADMIN_SESSION_COOKIE_NAME = 'piso_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 43200; // 12 hours

const ADMIN_SESSION_SECRET_KEY = 'admin_session_secret';

declare global {
  var globalAdminSessionSecret: string | undefined;
}

/**
 * Resolves the HMAC signing key for admin session cookies.
 * Uses DAEMON_API_SECRET if set; otherwise loads or generates a persisted 32-byte hex secret in DB.
 */
async function getSessionSigningKey(secretOverride?: string): Promise<string> {
  if (secretOverride && secretOverride.trim().length > 0) {
    return secretOverride.trim();
  }

  const envSecret = process.env.DAEMON_API_SECRET?.trim();
  if (envSecret) {
    return envSecret;
  }

  if (global.globalAdminSessionSecret) {
    return global.globalAdminSessionSecret;
  }

  try {
    const existing = await prisma.setting.findUnique({
      where: { key: ADMIN_SESSION_SECRET_KEY },
    });
    if (existing?.value && existing.value.trim().length >= 32) {
      global.globalAdminSessionSecret = existing.value.trim();
      return global.globalAdminSessionSecret;
    }

    const generated = crypto.randomBytes(32).toString('hex');
    const saved = await prisma.setting.upsert({
      where: { key: ADMIN_SESSION_SECRET_KEY },
      update: {},
      create: { key: ADMIN_SESSION_SECRET_KEY, value: generated },
    });
    global.globalAdminSessionSecret = saved.value;
    return saved.value;
  } catch {
    const ephemeral = crypto.randomBytes(32).toString('hex');
    global.globalAdminSessionSecret = ephemeral;
    return ephemeral;
  }
}

/**
 * Hashes an Admin PIN using scrypt with a random 16-byte salt.
 * Format: scrypt:<saltHex>:<hashHex>
 */
export function hashPin(pin: string): string {
  const cleanPin = pin.trim();
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(cleanPin, saltHex, 64);
  return `scrypt:${saltHex}:${derived.toString('hex')}`;
}

/**
 * Verifies a candidate PIN against a stored value ('scrypt:<saltHex>:<hashHex>' or legacy plaintext)
 * using constant-time comparison.
 */
export function verifyPin(pin: string, stored: string): boolean {
  if (typeof pin !== 'string' || typeof stored !== 'string') return false;
  const cleanPin = pin.trim();
  const cleanStored = stored.trim();
  if (!cleanPin || !cleanStored) return false;

  if (cleanStored.startsWith('scrypt:')) {
    const parts = cleanStored.split(':');
    if (parts.length !== 3) return false;
    const [, saltHex, hashHex] = parts;
    if (!saltHex || !hashHex || hashHex.length % 2 !== 0) return false;

    try {
      const storedHash = Buffer.from(hashHex, 'hex');
      if (storedHash.length === 0) return false;
      const derived = crypto.scryptSync(cleanPin, saltHex, storedHash.length);
      if (derived.length !== storedHash.length) return false;
      return crypto.timingSafeEqual(derived, storedHash);
    } catch {
      return false;
    }
  }

  // Legacy plaintext comparison via fixed-length SHA-256 digests + timingSafeEqual
  const pinDigest = crypto.createHash('sha256').update(cleanPin, 'utf8').digest();
  const storedDigest = crypto.createHash('sha256').update(cleanStored, 'utf8').digest();
  return crypto.timingSafeEqual(pinDigest, storedDigest);
}

interface AdminSessionPayload {
  v: 1;
  role: 'admin';
  iat: number;
  exp: number;
  jti: string;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates a signed HMAC-SHA256 admin session cookie value.
 */
export async function createAdminSessionCookie(secretOverride?: string): Promise<string> {
  const key = await getSessionSigningKey(secretOverride);
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    v: 1,
    role: 'admin',
    iat: nowSec,
    exp: nowSec + ADMIN_SESSION_MAX_AGE_SECONDS,
    jti: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigHex = crypto.createHmac('sha256', key).update(payloadB64).digest('hex');
  return `${payloadB64}.${sigHex}`;
}

/**
 * Verifies a signed admin session cookie value (signature + expiry).
 */
export async function verifyAdminSessionCookie(
  val?: string | null,
  secretOverride?: string
): Promise<boolean> {
  if (!val || typeof val !== 'string') return false;
  const parts = val.trim().split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, sigHex] = parts;
  if (!payloadB64 || !sigHex) return false;

  try {
    const key = await getSessionSigningKey(secretOverride);
    const expectedSig = crypto.createHmac('sha256', key).update(payloadB64).digest('hex');
    if (!timingSafeEqualString(sigHex.toLowerCase(), expectedSig.toLowerCase())) {
      return false;
    }

    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as Partial<AdminSessionPayload>;

    if (decoded.v !== 1 || decoded.role !== 'admin') return false;
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec < decoded.exp;
  } catch {
    return false;
  }
}

function extractCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const k = pair.slice(0, eqIdx).trim();
    if (k === name) {
      return decodeURIComponent(pair.slice(eqIdx + 1).trim());
    }
  }
  return undefined;
}

/**
 * Returns true if the incoming request carries a valid signed admin session cookie.
 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const cookieVal =
    req.cookies?.get(ADMIN_SESSION_COOKIE_NAME)?.value ??
    extractCookieFromHeader(req.headers.get('cookie'), ADMIN_SESSION_COOKIE_NAME);
  return verifyAdminSessionCookie(cookieVal);
}

/**
 * Returns null if request is an authenticated admin session, or a 401 NextResponse otherwise.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const ok = await isAdminRequest(req);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized: Admin authentication required' },
      { status: 401 }
    );
  }
  return null;
}

/**
 * Verifies whether a request originates from the trusted local hardware daemon.
 * - When DAEMON_API_SECRET is configured: checks 'x-daemon-secret' with crypto.timingSafeEqual.
 * - When DAEMON_API_SECRET is unset: requires loopback x-real-ip / host or non-production dev mode.
 */
export function isInternalDaemonRequest(req: Pick<NextRequest, 'headers'>): boolean {
  const secret = process.env.DAEMON_API_SECRET?.trim() || '';
  const provided = req.headers.get('x-daemon-secret')?.trim() || '';

  if (secret) {
    return timingSafeEqualString(provided, secret);
  }

  const isLoopback = (value: string): boolean => {
    const clean = value.trim().toLowerCase();
    return clean === '127.0.0.1' || clean === '::1' || clean === '::ffff:127.0.0.1' || clean === 'localhost';
  };

  const xRealIp = req.headers.get('x-real-ip')?.trim() || '';
  if (xRealIp) {
    return isLoopback(xRealIp);
  }

  const xff = req.headers.get('x-forwarded-for')?.trim() || '';
  if (xff) {
    const first = xff.split(',')[0]?.trim() || '';
    return isLoopback(first);
  }

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const host = (req.headers.get('host') || '').split(':')[0].trim().toLowerCase();
  return isLoopback(host);
}

/**
 * Masks sensitive credentials for safe display in admin UI responses.
 */
export function maskSecret(val?: string | null): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Detects whether a submitted string is blank or a masked preview placeholder rather than a new secret.
 */
export function isBlankOrMaskedSecret(val: unknown): boolean {
  if (typeof val !== 'string') return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  if (/^•+$/.test(trimmed) || /^\*+$/.test(trimmed)) return true;
  if (/^.{1,8}\.\.\..{1,8}$/.test(trimmed)) return true;
  if (/^.{1,8}•{3,}.{1,8}$/.test(trimmed)) return true;
  return false;
}

export function isHttpsRequest(req: Pick<NextRequest, 'headers'> & { nextUrl?: URL }): boolean {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') return true;
  if (req.nextUrl?.protocol === 'https:') return true;
  return false;
}
