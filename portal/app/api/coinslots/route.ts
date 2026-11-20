import { NextRequest, NextResponse } from 'next/server';
import { getDaemonCoinslots } from '@/lib/daemon';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const slots = await getDaemonCoinslots();
  return NextResponse.json({ slots });
}
