import { NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { syncDaemonDeviceRules, getRouterDeviceRulesStatus } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function POST() {
  await ensureSqlitePragmas();

  try {
    const devices = await prisma.deviceRule.findMany();
    const whitelist = devices.filter((d) => d.type === 'WHITELIST').map((d) => d.macAddress);
    const blacklist = devices.filter((d) => d.type === 'BLACKLIST').map((d) => d.macAddress);

    const synced = await syncDaemonDeviceRules(whitelist, blacklist);
    const routerStatus = await getRouterDeviceRulesStatus();

    return NextResponse.json({
      success: synced,
      message: `Synchronized ${whitelist.length} VIP whitelist and ${blacklist.length} blacklist rules to OpenWrt router!`,
      routerStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to sync device rules' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const routerStatus = await getRouterDeviceRulesStatus();
    return NextResponse.json({ routerStatus });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch router device status' },
      { status: 500 }
    );
  }
}
