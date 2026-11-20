import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { getMacFromIp, isRandomizedMac } from '@/lib/arp';
import { getTrustedClientIp } from '@/lib/client-ip';
import { authorizeClientMac, getRouterDhcpLeases } from '@/lib/daemon';
import { getFriendlyDeviceName } from '@/lib/device-helper';
import { generateSecureTransferCode } from '@/lib/secure-codes';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

const HOURLY_GLOBAL_TRIAL_CAP = 20;

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  const ip = getTrustedClientIp(request);
  const macAddress = await getMacFromIp(ip);
  if (!macAddress) {
    return NextResponse.json({ error: 'Could not resolve device MAC address' }, { status: 400 });
  }

  try {
    // 1. Check settings
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'free_trial_enabled',
            'free_trial_minutes',
            'shield_block_random_mac_trial',
          ],
        },
      },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));

    const enabled = map.get('free_trial_enabled') !== 'false';
    const trialMinutes = parseInt(map.get('free_trial_minutes') || '5', 10);
    const blockRandomMacTrial = map.get('shield_block_random_mac_trial') !== 'false';

    if (!enabled) {
      return NextResponse.json({ error: 'Free trial access is currently disabled.' }, { status: 403 });
    }

    if (blockRandomMacTrial && isRandomizedMac(macAddress)) {
      return NextResponse.json(
        {
          error: 'RANDOM_MAC_BLOCKED',
          message:
            'Free trial is blocked for randomized / Private Wi-Fi MAC addresses. Turn off Private Wi-Fi Address for this hotspot to claim your daily free trial.',
        },
        { status: 403 }
      );
    }

    // 2. Check global hourly cap (20 claims/hr) to prevent automated MAC-spoof drain
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await prisma.freeTrialClaim.count({
      where: { claimedAt: { gt: oneHourAgo } },
    });
    if (hourlyCount >= HOURLY_GLOBAL_TRIAL_CAP) {
      return NextResponse.json(
        { error: 'Hourly free trial limit reached. Please try again later or insert coins.' },
        { status: 429 }
      );
    }

    // 3. Check 24-hour cooldown per MAC and per IP
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingClaim = await prisma.freeTrialClaim.findFirst({
      where: {
        claimedAt: { gt: twentyFourHoursAgo },
        OR: [
          { macAddress },
          { ipAddress: ip },
        ],
      },
      orderBy: { claimedAt: 'desc' },
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

    // 4. Record Claim
    await prisma.freeTrialClaim.create({
      data: {
        macAddress,
        ipAddress: ip,
      },
    });

    // 5. Create Session
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
    const transferCode = generateSecureTransferCode();

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

    // 6. Authorize on OpenWrt
    await authorizeClientMac(macAddress, trialMinutes, ip, {
      amount: 0,
      type: 'FREE_TRIAL',
      isNewSession: true,
      notify: false,
    });

    const response = NextResponse.json({
      success: true,
      sessionToken,
      transferCode,
      durationMinutes: trialMinutes,
      remainingMinutes: trialMinutes,
      durationAddedMinutes: trialMinutes,
      remainingSeconds: trialMinutes * 60,
      session,
      message: `🎉 Enjoy your ${trialMinutes} minutes of free Wi-Fi!`,
    });

    response.cookies.set('piso_session_token', sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to claim free trial' }, { status: 500 });
  }
}
