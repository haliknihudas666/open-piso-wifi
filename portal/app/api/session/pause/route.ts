import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { getMacFromIp } from '@/lib/arp';
import { getTrustedClientIp } from '@/lib/client-ip';
import { authorizeClientMac, deauthorizeClientMac } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  const ip = getTrustedClientIp(request);
  const macAddress = await getMacFromIp(ip);
  if (!macAddress) {
    return NextResponse.json({ error: 'Could not resolve device MAC address' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'pause') {
      const allowPauseSetting = await prisma.setting.findUnique({
        where: { key: 'allow_pause_time' },
      });
      if (allowPauseSetting?.value === 'false') {
        return NextResponse.json(
          { error: 'Pausing session time is currently disabled by the administrator.' },
          { status: 403 }
        );
      }

      // Find active unpaused session
      const now = new Date();
      const session = await prisma.session.findFirst({
        where: {
          macAddress,
          isActive: true,
          isPaused: false,
          endTime: { gt: now },
        },
        orderBy: { endTime: 'desc' },
      });

      if (!session) {
        return NextResponse.json({ error: 'No active session found to pause.' }, { status: 404 });
      }

      const remainingSeconds = Math.max(0, Math.floor((session.endTime.getTime() - now.getTime()) / 1000));
      if (remainingSeconds <= 10) {
        return NextResponse.json({ error: 'Session has less than 10 seconds remaining and cannot be paused.' }, { status: 400 });
      }

      await prisma.session.update({
        where: { id: session.id },
        data: {
          isPaused: true,
          pausedRemainingSeconds: remainingSeconds,
        },
      });

      await deauthorizeClientMac(macAddress);

      return NextResponse.json({
        success: true,
        isPaused: true,
        pausedRemainingSeconds: remainingSeconds,
        message: 'Time paused successfully. Reconnect and click Resume Time when you return.',
      });
    }

    if (action === 'resume') {
      const pausedSession = await prisma.session.findFirst({
        where: {
          macAddress,
          isActive: true,
          isPaused: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (!pausedSession || pausedSession.pausedRemainingSeconds <= 0) {
        return NextResponse.json({ error: 'No paused session found.' }, { status: 404 });
      }

      const now = new Date();
      const newEndTime = new Date(now.getTime() + pausedSession.pausedRemainingSeconds * 1000);
      const remainingMinutes = Math.max(1, Math.ceil(pausedSession.pausedRemainingSeconds / 60));

      await prisma.session.update({
        where: { id: pausedSession.id },
        data: {
          isPaused: false,
          startTime: now,
          endTime: newEndTime,
          pausedRemainingSeconds: 0,
        },
      });

      await authorizeClientMac(macAddress, remainingMinutes, ip, {
        amount: 0,
        isNewSession: false,
        notify: false,
      });

      return NextResponse.json({
        success: true,
        isAuthenticated: true,
        remainingSeconds: pausedSession.pausedRemainingSeconds,
        message: 'Welcome back! Your time has resumed.',
      });
    }

    return NextResponse.json({ error: 'Invalid action. Must be "pause" or "resume".' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Pause/resume operation failed' }, { status: 500 });
  }
}
