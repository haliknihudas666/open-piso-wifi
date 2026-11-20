import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { daemonHeaders } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const DAEMON_URL = process.env.DAEMON_URL || 'http://127.0.0.1:4000';
  try {
    const res = await fetch(`${DAEMON_URL}/api/telegram/test`, {
      method: 'POST',
      headers: daemonHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Hardware daemon unreachable. Ensure daemon is running on port 4000.' },
      { status: 503 }
    );
  }
}
