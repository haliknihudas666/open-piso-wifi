import { NextRequest, NextResponse } from 'next/server';
import { getMacFromIp, cleanIpv4 } from '@/lib/arp';
import { getDaemonCoins, clearDaemonCoins, authorizeClientMac, deauthorizeClientMac, getRouterDhcpLeases } from '@/lib/daemon';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { calculateDurationFromAmount } from '@/lib/rates';
import { getFriendlyDeviceName } from '@/lib/device-helper';
import { getActiveLock, isClientLockHolder, releaseCoinLock } from '@/lib/coin-lock';
import { processLoyaltyCredit, normalizeSessionCode } from '@/lib/loyalty';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

function generateTransferCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PW-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function generateUniqueTransferCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'PW-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await prisma.session.findUnique({ where: { transferCode: code } }).catch(() => null);
    if (!existing) return code;
  }
  return `PW-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function generateUniqueSessionToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = crypto.randomUUID();
    const existing = await prisma.session.findUnique({ where: { sessionToken: token } }).catch(() => null);
    if (!existing) return token;
  }
  return crypto.randomUUID();
}

interface ConnectRequestBody {
  voucherCode?: string;
  mockMac?: string; // For testing in local dev environment
  macHint?: string; // Passed from OpenWrt redirect query parameter
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = (await request.json().catch(() => ({}))) as ConnectRequestBody;
    const rawIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const clientIp = cleanIpv4(rawIp);

    // Step 1: Extract MAC address using kernel ARP table / proc / arp CLI / OpenWrt
    let macAddress = body.mockMac || (await getMacFromIp(clientIp, body.macHint));

    if (!macAddress) {
      return NextResponse.json(
        {
          error: 'Could not determine device MAC address from network ARP table. Please reconnect to the Wi-Fi AP.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    let durationMinutes = 0;
    let amountPaid = 0;
    let paymentType = 'COIN';
    let voucherCode: string | undefined;

    // Step 2: Determine if connecting via Voucher, Session Transfer Code, or Inserted Coins
    if (body.voucherCode && body.voucherCode.trim().length > 0) {
      const cleanCode = body.voucherCode.trim().toUpperCase();

      const voucher = await prisma.voucher.findUnique({
        where: { code: cleanCode },
      });

      if (voucher) {
        if (voucher.isRevoked) {
          return NextResponse.json(
            { error: 'This voucher code has been revoked and cannot be used.' },
            { status: 400 }
          );
        }

        if (voucher.isUsed) {
          return NextResponse.json(
            { error: 'This voucher code has already been redeemed.' },
            { status: 400 }
          );
        }

        durationMinutes = voucher.durationMinutes;
        amountPaid = voucher.amountEquivalent;
        paymentType = 'VOUCHER';
        voucherCode = voucher.code;

        // Mark voucher as used
        await prisma.voucher.update({
          where: { id: voucher.id },
          data: {
            isUsed: true,
            usedAt: now,
            usedByMac: macAddress,
          },
        });
      } else {
        // Check if code matches an active session transfer code or session token
        const cleanTransferCode = cleanCode.startsWith('PW-') ? cleanCode : `PW-${cleanCode}`;
        const activeTransferSession = await prisma.session.findFirst({
          where: {
            isActive: true,
            AND: [
              {
                OR: [
                  { transferCode: cleanCode },
                  { transferCode: cleanTransferCode },
                  { sessionToken: cleanCode },
                ],
              },
              {
                OR: [
                  { isPaused: true, pausedRemainingSeconds: { gt: 0 } },
                  { endTime: { gt: now } },
                ],
              },
            ],
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (activeTransferSession) {
          const oldMac = activeTransferSession.macAddress;
          const remainingSecs = activeTransferSession.isPaused
            ? activeTransferSession.pausedRemainingSeconds
            : Math.max(0, Math.floor((activeTransferSession.endTime.getTime() - now.getTime()) / 1000));

          if (remainingSecs <= 0) {
            return NextResponse.json(
              { error: 'The session associated with this transfer code has already expired.' },
              { status: 400 }
            );
          }

          const remainingMins = Math.max(1, Math.ceil(remainingSecs / 60));
          const newEndTime = new Date(now.getTime() + remainingSecs * 1000);

          // If switching MACs/devices, revoke old MAC on OpenWrt
          if (oldMac.toLowerCase() !== macAddress.toLowerCase()) {
            deauthorizeClientMac(oldMac).catch((err) => {
              console.warn('[SESSION TRANSFER] Notice deauthorizing old MAC:', err);
            });
          }

          // Authorize new MAC on OpenWrt immediately
          const authResult = await authorizeClientMac(macAddress, remainingMins, clientIp);
          if (!authResult.success) {
            console.warn('[SESSION TRANSFER] Hardware daemon authorization warning:', authResult.error);
          }

          const userAgent = request.headers.get('user-agent');
          const deviceName = getFriendlyDeviceName(userAgent);

          // Migrate session in database to the new device
          const updatedSession = await prisma.session.update({
            where: { id: activeTransferSession.id },
            data: {
              macAddress,
              ipAddress: clientIp,
              isPaused: false,
              startTime: now,
              endTime: newEndTime,
              pausedRemainingSeconds: 0,
              deviceName: deviceName || activeTransferSession.deviceName,
            },
          });

          console.log(`[SESSION TRANSFER] Successfully transferred session ${activeTransferSession.id} (${remainingMins}m) from ${oldMac} -> ${macAddress}`);

          const response = NextResponse.json({
            success: true,
            macAddress,
            sessionToken: updatedSession.sessionToken,
            transferCode: updatedSession.transferCode,
            ipAddress: clientIp,
            durationAddedMinutes: 0,
            amountPaid: 0,
            type: 'TRANSFER',
            startTime: now.toISOString(),
            endTime: newEndTime.toISOString(),
            remainingMinutes: remainingMins,
            message: `Session transferred successfully! You have ${remainingMins} minutes of internet access.`,
          });

          if (updatedSession.sessionToken) {
            response.cookies.set('piso_session_token', updatedSession.sessionToken, {
              path: '/',
              maxAge: 30 * 24 * 60 * 60,
              sameSite: 'lax',
              httpOnly: false,
            });
          }

          return response;
        }

        return NextResponse.json(
          { error: 'Invalid voucher or session transfer code. Please check and try again.' },
          { status: 400 }
        );
      }
    } else {
      // Connecting via Inserted Coins
      // Verify exclusive coinslot lock ownership to prevent coin hijacking by other devices
      const activeLock = getActiveLock();
      const existingToken =
        request.cookies.get('piso_session_token')?.value ||
        request.headers.get('x-session-token');

      if (activeLock && !isClientLockHolder(clientIp, macAddress, existingToken)) {
        return NextResponse.json(
          {
            error: 'COIN_SESSION_MISMATCH',
            message: 'Cannot connect: The inserted coins belong to another customer currently using the machine.',
          },
          { status: 403 }
        );
      }

      const { pulses } = await getDaemonCoins();

      if (pulses <= 0) {
        return NextResponse.json(
          {
            error: 'No coins detected. Please insert coins into the slot before connecting.',
            pulses: 0,
          },
          { status: 400 }
        );
      }

      // Fetch conversion rate & tiered rate brackets from settings
      let minutesPerPeso = 10;
      let ratesConfig: any[] = [];
      const settings = await prisma.setting.findMany({
        where: { key: { in: ['minutes_per_peso', 'rates_config'] } },
      });
      for (const s of settings) {
        if (s.key === 'minutes_per_peso' && !isNaN(parseInt(s.value, 10))) {
          minutesPerPeso = parseInt(s.value, 10);
        }
        if (s.key === 'rates_config') {
          try {
            ratesConfig = JSON.parse(s.value);
          } catch {}
        }
      }

      amountPaid = pulses;
      durationMinutes = calculateDurationFromAmount(pulses, ratesConfig, minutesPerPeso);
      paymentType = 'COIN';

      // Reset hardware daemon coin counter and release exclusive session lock
      await clearDaemonCoins();
      releaseCoinLock(clientIp, macAddress, existingToken, true);
    }

    // Step 3: Record Sale in Database
    await prisma.sale.create({
      data: {
        amount: amountPaid,
        source: paymentType,
        macAddress,
        voucherCode,
      },
    });

    // Step 4: Calculate Session Start & End Times and Device Name
    const userAgent = request.headers.get('user-agent');
    let dhcpHostname: string | undefined;

    try {
      const leases = await getRouterDhcpLeases();
      const match = leases.find((l) => l.mac.toLowerCase() === macAddress.toLowerCase());
      if (match?.hostname) dhcpHostname = match.hostname;
    } catch {}

    const deviceName = getFriendlyDeviceName(userAgent, dhcpHostname);

    const existingToken =
      request.cookies.get('piso_session_token')?.value ||
      request.headers.get('x-session-token');

    const existingCodeCookie =
      request.cookies.get('piso_session_code')?.value ||
      request.headers.get('x-session-code');

    // Find if the device already has an ACTIVE or PAUSED session
    // Matches by MAC address or by stored sessionToken (handles MAC randomization / band switching)
    const existingSession = await prisma.session.findFirst({
      where: {
        isActive: true,
        OR: [
          {
            macAddress,
            OR: [{ isPaused: true }, { endTime: { gt: now } }],
          },
          ...(existingToken
            ? [
                {
                  sessionToken: existingToken,
                  OR: [{ isPaused: true }, { endTime: { gt: now } }],
                },
              ]
            : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Resolve the customer's permanent session code (transferCode) for streak tracking
    let transferCode: string | undefined;
    if (existingSession?.transferCode) {
      transferCode = existingSession.transferCode;
    } else if (existingCodeCookie) {
      transferCode = normalizeSessionCode(existingCodeCookie);
    } else if (macAddress) {
      const prevSession = await prisma.session.findFirst({
        where: { macAddress, transferCode: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { transferCode: true },
      }).catch(() => null);

      if (prevSession?.transferCode) {
        transferCode = prevSession.transferCode;
      } else {
        const prevLoyalty = await prisma.loyaltyStreak.findFirst({
          where: { macAddress },
          orderBy: { updatedAt: 'desc' },
          select: { sessionCode: true },
        }).catch(() => null);
        if (prevLoyalty?.sessionCode) {
          transferCode = prevLoyalty.sessionCode;
        }
      }
    }

    if (!transferCode) {
      transferCode = await generateUniqueTransferCode();
    } else {
      transferCode = normalizeSessionCode(transferCode);
    }

    // Step 4b: Process Customer Loyalty & Daily Streak
    const loyaltyCredit = await processLoyaltyCredit({
      sessionCode: transferCode,
      macAddress,
      deviceName,
      amountPaid,
    });

    let bonusMinutesAdded = 0;
    if (loyaltyCredit.isBonusAwarded && loyaltyCredit.bonusMinutes > 0) {
      bonusMinutesAdded = loyaltyCredit.bonusMinutes;
      durationMinutes += bonusMinutesAdded;
      console.log(`[LOYALTY STREAK] Milestone achieved! Session ${transferCode} awarded +${bonusMinutesAdded} bonus minutes for ${loyaltyCredit.rewardName}`);
    }

    let sessionStartTime = now;
    let sessionEndTime: Date;
    let sessionToken: string;

    if (existingSession) {
      // Extend or resume existing active/paused session
      const oldMac = existingSession.macAddress;
      sessionToken = existingSession.sessionToken || (await generateUniqueSessionToken());

      if (existingSession.isPaused) {
        // Device was paused: stack purchased time on top of paused balance and unpause
        const currentPausedSeconds = existingSession.pausedRemainingSeconds || 0;
        const totalRemainingSeconds = currentPausedSeconds + durationMinutes * 60;
        sessionStartTime = now;
        sessionEndTime = new Date(now.getTime() + totalRemainingSeconds * 1000);

        await prisma.session.update({
          where: { id: existingSession.id },
          data: {
            isPaused: false,
            pausedRemainingSeconds: 0,
            startTime: now,
            endTime: sessionEndTime,
            durationMinutes: existingSession.durationMinutes + durationMinutes,
            amountPaid: existingSession.amountPaid + amountPaid,
            sessionToken,
            transferCode,
            ipAddress: clientIp,
            macAddress, // in case MAC changed or device switched bands
            deviceName: deviceName || existingSession.deviceName,
          },
        });
      } else {
        // Device is currently active and unpaused: stack time onto existing endTime
        sessionStartTime = existingSession.startTime;
        sessionEndTime = new Date(existingSession.endTime.getTime() + durationMinutes * 60 * 1000);

        await prisma.session.update({
          where: { id: existingSession.id },
          data: {
            endTime: sessionEndTime,
            durationMinutes: existingSession.durationMinutes + durationMinutes,
            amountPaid: existingSession.amountPaid + amountPaid,
            sessionToken,
            transferCode,
            ipAddress: clientIp,
            macAddress, // in case MAC changed or device switched bands
            deviceName: deviceName || existingSession.deviceName,
          },
        });
      }

      // If MAC rotated or client switched SSIDs, revoke the old MAC rule on OpenWrt
      if (oldMac.toLowerCase() !== macAddress.toLowerCase()) {
        deauthorizeClientMac(oldMac).catch((err) => {
          console.warn('[CONNECT] Notice deauthorizing previous MAC:', err);
        });
      }
    } else {
      // Check if this device or session code previously had a session record that expired
      const previousExpiredSession = await prisma.session.findFirst({
        where: {
          OR: [
            { transferCode },
            { macAddress },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (previousExpiredSession) {
        sessionStartTime = now;
        sessionEndTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
        sessionToken = previousExpiredSession.sessionToken || (await generateUniqueSessionToken());

        await prisma.session.update({
          where: { id: previousExpiredSession.id },
          data: {
            isActive: true,
            isPaused: false,
            pausedRemainingSeconds: 0,
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            durationMinutes,
            amountPaid: previousExpiredSession.amountPaid + amountPaid,
            ipAddress: clientIp,
            macAddress,
            deviceName: deviceName || previousExpiredSession.deviceName,
            sessionToken,
            transferCode,
            type: paymentType,
          },
        });
      } else {
        // Create a brand new session with guaranteed UNIQUE sessionToken & transferCode
        sessionStartTime = now;
        sessionEndTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
        sessionToken = await generateUniqueSessionToken();

        await prisma.session.create({
          data: {
            sessionToken,
            transferCode,
            macAddress,
            ipAddress: clientIp,
            deviceName,
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            durationMinutes,
            amountPaid,
            isActive: true,
            type: paymentType,
          },
        });
      }
    }

    // Step 5: Send Authorization to Hardware Daemon (executes OpenWrt firewall rule)
    const remainingTotalMinutes = Math.ceil((sessionEndTime.getTime() - now.getTime()) / (60 * 1000));
    const authResult = await authorizeClientMac(macAddress, remainingTotalMinutes, clientIp);

    if (!authResult.success) {
      console.warn('Hardware daemon authorization warning:', authResult.error);
    }

    let successMessage = `Successfully connected! You have ${remainingTotalMinutes} minutes of internet access.`;
    if (bonusMinutesAdded > 0) {
      successMessage = `🔥 STREAK MILESTONE UNLOCKED! You hit a ${loyaltyCredit.currentStreak}-day streak and earned ${bonusMinutesAdded} extra free minutes (${loyaltyCredit.rewardName})! Total time: ${remainingTotalMinutes} mins.`;
    }

    const response = NextResponse.json({
      success: true,
      macAddress,
      sessionToken,
      transferCode,
      sessionCode: transferCode,
      ipAddress: clientIp,
      durationAddedMinutes: durationMinutes,
      bonusMinutesAdded,
      loyaltyReward: loyaltyCredit.isBonusAwarded ? {
        bonusMinutes: loyaltyCredit.bonusMinutes,
        rewardName: loyaltyCredit.rewardName,
        currentStreak: loyaltyCredit.currentStreak,
      } : null,
      streak: {
        currentStreak: loyaltyCredit.currentStreak,
        highestStreak: loyaltyCredit.highestStreak,
        isConsecutiveDay: loyaltyCredit.isConsecutiveDay,
        creditedTodayAlready: loyaltyCredit.creditedTodayAlready,
      },
      amountPaid,
      type: paymentType,
      startTime: sessionStartTime.toISOString(),
      endTime: sessionEndTime.toISOString(),
      remainingMinutes: remainingTotalMinutes,
      message: successMessage,
    });

    response.cookies.set('piso_session_code', transferCode, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 365 days
      sameSite: 'lax',
      httpOnly: false,
    });

    response.cookies.set('piso_session_token', sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch (error: any) {
    console.error('Error during /api/connect:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error while initiating connection.' },
      { status: 500 }
    );
  }
}
