import { NextRequest, NextResponse } from 'next/server';
import { isClientAuthenticated } from '@/lib/auth-check';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { cleanIpv4 } from '@/lib/arp';
import { setDaemonWhitelist, authorizeClientMac, deauthorizeClientMac, getRouterDhcpLeases } from '@/lib/daemon';
import { isPromoActive, DEFAULT_PROMO_TIERS, DEFAULT_RATE_TIERS, RateTier } from '@/lib/rates';
import { getLoyaltyStatus, normalizeSessionCode } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureSqlitePragmas();

  const rawIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const ip = cleanIpv4(rawIp);
  const sessionToken =
    request.cookies.get('piso_session_token')?.value ||
    request.headers.get('x-session-token') ||
    request.nextUrl.searchParams.get('token') ||
    null;

  const authStatus = await isClientAuthenticated(ip, sessionToken);

  // Fetch settings for portal branding and rates
  let portalTitle = 'OpenPisoWiFi';
  let bannerMessage = 'Fast & Affordable High-Speed Wi-Fi';
  let announcement = '⚡ High-Speed Fiber Internet • Low Ping for Online Gaming & Browsing!';
  let portalTheme = 'emerald';
  let allowPauseTime = true;
  let freeTrialEnabled = true;
  let freeTrialMinutes = 5;
  let showCoinSimulator = false;
  let ratesConfig: RateTier[] = DEFAULT_RATE_TIERS;
  let minutesPerPeso = 10;

  try {
    const settings = await prisma.setting.findMany();
    const map = new Map(settings.map((s) => [s.key, s.value]));

    if (map.has('portal_title')) portalTitle = map.get('portal_title')!;
    if (map.has('banner_message')) bannerMessage = map.get('banner_message')!;
    if (map.has('announcement')) announcement = map.get('announcement')!;
    if (map.has('portal_theme')) portalTheme = map.get('portal_theme')!;
    if (map.has('allow_pause_time')) allowPauseTime = map.get('allow_pause_time') === 'true';
    if (map.has('free_trial_enabled')) freeTrialEnabled = map.get('free_trial_enabled') === 'true';
    if (map.has('free_trial_minutes')) freeTrialMinutes = parseInt(map.get('free_trial_minutes')!, 10) || 5;
    if (map.has('minutes_per_peso') && !isNaN(parseInt(map.get('minutes_per_peso')!, 10))) {
      minutesPerPeso = parseInt(map.get('minutes_per_peso')!, 10);
    }
    if (map.has('show_coin_simulator')) showCoinSimulator = map.get('show_coin_simulator') === 'true';
    if (map.has('rates_config')) {
      try {
        ratesConfig = JSON.parse(map.get('rates_config')!);
      } catch {}
    }

    let promoRatesConfig = DEFAULT_PROMO_TIERS;
    let promoRatesEnabled = false;
    let promoStartHour = 22;
    let promoEndHour = 6;

    if (map.has('promo_rates_enabled')) promoRatesEnabled = map.get('promo_rates_enabled') === 'true';
    if (map.has('promo_start_hour') && !isNaN(parseInt(map.get('promo_start_hour')!, 10))) {
      promoStartHour = parseInt(map.get('promo_start_hour')!, 10);
    }
    if (map.has('promo_end_hour') && !isNaN(parseInt(map.get('promo_end_hour')!, 10))) {
      promoEndHour = parseInt(map.get('promo_end_hour')!, 10);
    }
    if (map.has('promo_rates_config')) {
      try {
        promoRatesConfig = JSON.parse(map.get('promo_rates_config')!);
      } catch {}
    }

    if (promoRatesEnabled && isPromoActive(promoStartHour, promoEndHour)) {
      ratesConfig = promoRatesConfig;
    }
  } catch (err) {
    console.error('Failed to load portal settings:', err);
  }

  // Check if MAC is eligible for daily free trial
  let eligibleForFreeTrial = false;
  if (freeTrialEnabled && authStatus.macAddress && !authStatus.isAuthenticated && !authStatus.isPaused) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentClaim = await prisma.freeTrialClaim.findFirst({
      where: {
        macAddress: authStatus.macAddress,
        claimedAt: { gt: twentyFourHoursAgo },
      },
    });
    eligibleForFreeTrial = !recentClaim;
  }

  // Proactively self-heal VIP devices on OpenWrt firewall
  if (authStatus.isVip && authStatus.macAddress) {
    setDaemonWhitelist(authStatus.macAddress, 'add', ip).catch(() => {});
  }

  // Proactively self-heal active authenticated sessions on OpenWrt firewall
  if (authStatus.isAuthenticated && authStatus.macAddress && authStatus.remainingSeconds > 0) {
    authorizeClientMac(authStatus.macAddress, Math.ceil(authStatus.remainingSeconds / 60), ip).catch(() => {});
  }

  // Persistent Session Code (Kowdigo) Resolution:
  // Every client device maintains a persistent session code across sessions & reboots for streak tracking.
  let transferCode =
    authStatus.session?.transferCode ||
    request.cookies.get('piso_session_code')?.value ||
    request.headers.get('x-session-code');

  if (!transferCode && authStatus.macAddress) {
    // 1. Check if this device previously had a session code recorded in Session history
    const prevSession = await prisma.session.findFirst({
      where: {
        macAddress: authStatus.macAddress,
        transferCode: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: { transferCode: true },
    }).catch(() => null);

    if (prevSession?.transferCode) {
      transferCode = prevSession.transferCode;
    } else {
      // 2. Check if this device has a Loyalty record
      const prevLoyalty = await prisma.loyaltyStreak.findFirst({
        where: { macAddress: authStatus.macAddress },
        orderBy: { updatedAt: 'desc' },
        select: { sessionCode: true },
      }).catch(() => null);

      if (prevLoyalty?.sessionCode) {
        transferCode = prevLoyalty.sessionCode;
      }
    }
  }

  // 3. If device still has no session code, generate a unique brand-new one
  if (!transferCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'PW-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    transferCode = code;
  } else {
    transferCode = normalizeSessionCode(transferCode);
  }

  if (authStatus.session && !authStatus.session.transferCode) {
    prisma.session.update({
      where: { id: authStatus.session.id },
      data: { transferCode },
    }).catch(() => {});
  }

  // Fetch Loyalty & Daily Streak Status keyed by this persistent session code
  const loyaltyStatus = await getLoyaltyStatus(transferCode, authStatus.macAddress);

  // Band-Switch / Device Transfer Candidate Detection:
  // When a user switches between 2.4GHz & 5GHz SSIDs on modern mobile devices (iOS/Android),
  // their MAC address changes due to per-SSID MAC randomization.
  // We detect if this client had an active session under their previous MAC/SSID so they can transfer with 1-tap.
  let candidateTransfer: {
    transferCode: string;
    deviceName: string;
    remainingSeconds: number;
    remainingMinutes: number;
  } | null = null;

  if (!authStatus.isAuthenticated && authStatus.macAddress) {
    const now = new Date();
    try {
      const leases = await getRouterDhcpLeases().catch(() => []);
      const currentLease = leases.find((l) => l.mac.toLowerCase() === authStatus.macAddress!.toLowerCase());
      const currentHostname = currentLease?.hostname && currentLease.hostname !== '*' && currentLease.hostname !== 'unknown'
        ? currentLease.hostname
        : null;

      // 1. Try matching active session by DHCP hostname if available (e.g. "Hudas-iPhone" or "Galaxy-A54")
      if (currentHostname) {
        const matchingSession = await prisma.session.findFirst({
          where: {
            isActive: true,
            macAddress: { not: authStatus.macAddress },
            OR: [
              { isPaused: true, pausedRemainingSeconds: { gt: 0 } },
              { endTime: { gt: now } },
            ],
            deviceName: { contains: currentHostname },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (matchingSession && matchingSession.transferCode) {
          const remSecs = matchingSession.isPaused
            ? matchingSession.pausedRemainingSeconds
            : Math.max(0, Math.floor((matchingSession.endTime.getTime() - now.getTime()) / 1000));

          if (remSecs > 0) {
            candidateTransfer = {
              transferCode: matchingSession.transferCode,
              deviceName: matchingSession.deviceName || currentHostname,
              remainingSeconds: remSecs,
              remainingMinutes: Math.ceil(remSecs / 60),
            };
          }
        }
      }

      // 2. Fallback: Check if there is an active session assigned to this exact IP or recently updated in the last 15 minutes
      if (!candidateTransfer) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const matchingByIp = await prisma.session.findFirst({
          where: {
            isActive: true,
            macAddress: { not: authStatus.macAddress },
            ipAddress: ip,
            OR: [
              { isPaused: true, pausedRemainingSeconds: { gt: 0 } },
              { endTime: { gt: now } },
            ],
            updatedAt: { gt: fifteenMinutesAgo },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (matchingByIp && matchingByIp.transferCode) {
          const remSecs = matchingByIp.isPaused
            ? matchingByIp.pausedRemainingSeconds
            : Math.max(0, Math.floor((matchingByIp.endTime.getTime() - now.getTime()) / 1000));

          if (remSecs > 0) {
            candidateTransfer = {
              transferCode: matchingByIp.transferCode,
              deviceName: matchingByIp.deviceName || 'Your Device',
              remainingSeconds: remSecs,
              remainingMinutes: Math.ceil(remSecs / 60),
            };
          }
        }
      }
    } catch {}
  }

  const response = NextResponse.json({
    ip,
    macAddress: authStatus.macAddress,
    isAuthenticated: authStatus.isAuthenticated,
    remainingSeconds: authStatus.remainingSeconds,
    sessionToken: authStatus.sessionToken || null,
    transferCode: transferCode || null,
    sessionCode: transferCode || null,
    loyalty: loyaltyStatus,
    candidateTransfer,
    isVip: authStatus.isVip || false,
    isBlacklisted: authStatus.isBlacklisted || false,
    blacklistNotes: authStatus.blacklistNotes,
    deviceName: authStatus.deviceName,
    isPaused: authStatus.isPaused || false,
    session: authStatus.session,
    portalTitle,
    bannerMessage,
    announcement,
    portalTheme,
    allowPauseTime,
    freeTrialEnabled,
    freeTrialMinutes,
    eligibleForFreeTrial,
    showCoinSimulator,
    ratesConfig,
    minutesPerPeso,
    portalIp: process.env.PORTAL_IP || '192.168.1.240',
    portalPort: process.env.PORTAL_PORT || '3000',
  });

  if (transferCode) {
    response.cookies.set('piso_session_code', transferCode, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 365 days persistent device identity
      sameSite: 'lax',
      httpOnly: false,
    });
  }

  if (authStatus.sessionToken) {
    response.cookies.set('piso_session_token', authStatus.sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
      httpOnly: false, // Accessible by portal JavaScript as well for localStorage synchronization
    });
  }

  return response;
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const rawIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const ip = cleanIpv4(rawIp);
    const authStatus = await isClientAuthenticated(ip);

    if (body.action === 'sync_vip') {
      if (authStatus.isVip && authStatus.macAddress) {
        const result = await setDaemonWhitelist(authStatus.macAddress, 'add', ip);
        return NextResponse.json({
          success: true,
          isVip: true,
          macAddress: authStatus.macAddress,
          ip,
          message: 'VIP Whitelist status successfully re-asserted on OpenWrt router.',
          routerResult: result,
        });
      }
      return NextResponse.json({ error: 'Device is not registered as a VIP Whitelist device.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, authStatus });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Session action failed' }, { status: 500 });
  }
}
