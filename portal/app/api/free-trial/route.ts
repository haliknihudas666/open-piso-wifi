import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { getMacFromIp, cleanIpv4 } from '@/lib/arp';
import { authorizeClientMac, getRouterDhcpLeases } from '@/lib/daemon';
import { getFriendlyDeviceName } from '@/lib/device-helper';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  const rawIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const ip = cleanIpv4(rawIp);

  const macAddress = await getMacFromIp(ip);
  if (!macAddress) {
    return NextResponse.json({ error: 'Could not resolve device MAC address' }, { status: 400 });
  }

  try {
    // 1. Check settings
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['free_trial_enabled', 'free_trial_minutes'] } },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));

    const enabled = map.get('free_trial_enabled') !== 'false';
    const trialMinutes = parseInt(map.get('free_trial_minutes') || '5', 10);

    if (!enabled) {
      return NextResponse.json({ error: 'Free trial access is currently disabled.' }, { status: 403 });
    }

    // 2. Check 24-hour cooldown
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingClaim = await prisma.freeTrialClaim.findFirst({
      where: {
        macAddress,
        claimedAt: { gt: twentyFourHoursAgo },
      },
    });

    if (existingClaim) {
      const nextAvailableTime = new Date(existingClaim.claimedAt.getTime() + 24 * 60 * 60 * 1000);
      return NextResponse.json(
        {
          error: `You already claimed your free trial today. Next trial available at ${nextAvailableTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        },
        { status: 429 }
      );
    }

    // 3. Record Claim
    await prisma.freeTrialClaim.create({
      data: {
        macAddress,
        ipAddress: ip,
      },
    });

    // 4. Create Session
    const userAgent = request.headers.get('user-agent');
    let dhcpHostname: string | undefined;

    try {
      const leases = await getRouterDhcpLeases();
      const match = leases.find((l) => l.mac.toLowerCase() === macAddress.toLowerCase());
      if (match?.hostname) dhcpHostname = match.hostname;
    } catch {}

    const deviceName = getFriendlyDeviceName(userAgent, dhcpHostname);

    const now = new Date();
    const endTime = new Date(now.getTime() + trialMinutes * 60 * 1000);
    const sessionToken = crypto.randomUUID();
    
    // Generate unique transfer code for free trial
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let transferCode = 'PW-';
    for (let i = 0; i < 6; i++) {
      transferCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const session = await prisma.session.create({
      data: {
        sessionToken,
        transferCode,
        macAddress,
        ipAddress: ip,
        deviceName,
        startTime: now,
        endTime,
        durationMinutes: trialMinutes,
        amountPaid: 0,
        type: 'FREE_TRIAL',
        isActive: true,
      },
    });

    // 5. Authorize on OpenWrt
    await authorizeClientMac(macAddress, trialMinutes, ip);

    const response = NextResponse.json({
      success: true,
      sessionToken,
      durationMinutes: trialMinutes,
      remainingMinutes: trialMinutes,
      durationAddedMinutes: trialMinutes,
      remainingSeconds: trialMinutes * 60,
      session,
      message: `🎉 Enjoy your ${trialMinutes} minutes of free Wi-Fi!`,
    });

    response.cookies.set('piso_session_token', sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to claim free trial' }, { status: 500 });
  }
}
