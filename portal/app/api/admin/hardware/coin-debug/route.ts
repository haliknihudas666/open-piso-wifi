import { NextResponse } from 'next/server';
import { getDaemonHardwareDebug } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/hardware/coin-debug
 * Proxies the daemon's hardware debug endpoint.
 * Returns: event log, current GPIO state, denomination detection stats.
 */
export async function GET() {
  const data = await getDaemonHardwareDebug();
  return NextResponse.json(data);
}
