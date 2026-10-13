import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { rebootOpenWrtRouter, flushRouterSessions } from '@/lib/daemon';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'reboot_router': {
        const result = await rebootOpenWrtRouter();
        return NextResponse.json(result);
      }

      case 'reboot_rpi': {
        if (process.platform === 'linux') {
          // Trigger safe system reboot after 2 seconds
          exec('sleep 2 && sudo reboot');
          return NextResponse.json({ success: true, message: 'Raspberry Pi is rebooting now...' });
        }
        return NextResponse.json({ success: true, message: 'Reboot simulated in development mode' });
      }

      case 'restart_services': {
        if (process.platform === 'linux') {
          exec('sleep 1 && sudo systemctl restart pisowifi-daemon.service pisowifi-portal.service');
          return NextResponse.json({ success: true, message: 'Restarting daemon and portal services...' });
        }
        return NextResponse.json({ success: true, message: 'Service restart simulated in development mode' });
      }

      case 'flush_sessions': {
        // 1. Flush OpenWrt firewall MAC table
        await flushRouterSessions();

        // 2. Mark all active sessions in DB as inactive
        await prisma.session.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });

        return NextResponse.json({ success: true, message: 'All active sessions and firewall authorizations flushed' });
      }

      default:
        return NextResponse.json({ error: `Invalid power action: "${action}"` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Power action failed' }, { status: 500 });
  }
}
