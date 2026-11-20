import { NextRequest, NextResponse } from 'next/server';
import { getDaemonHardwareDebug } from '@/lib/daemon';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/hardware/coin-debug
 * Proxies the daemon's hardware debug endpoint.
 * Returns: event log, current GPIO state, denomination detection stats.
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const data = await getDaemonHardwareDebug();
  return NextResponse.json(data);
}
