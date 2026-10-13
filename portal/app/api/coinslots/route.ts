import { NextResponse } from 'next/server';
import { getDaemonCoinslots } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function GET() {
  const slots = await getDaemonCoinslots();
  return NextResponse.json({ slots });
}
