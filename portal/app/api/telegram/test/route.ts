import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const DAEMON_URL = process.env.DAEMON_URL || 'http://127.0.0.1:4000';
  try {
    const res = await fetch(`${DAEMON_URL}/api/telegram/test`, {
      method: 'POST',
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Hardware daemon unreachable. Ensure daemon is running on port 4000.' },
      { status: 503 }
    );
  }
}
