import { NextRequest, NextResponse } from 'next/server';
import { isClientAuthenticated } from '@/lib/auth-check';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { getTrustedClientIp } from '@/lib/client-ip';
import { setDaemonWhitelist, authorizeClientMac } from '@/lib/daemon';
import { isPromoActive, DEFAULT_PROMO_TIERS, DEFAULT_RATE_TIERS, RateTier } from '@/lib/rates';
import { getLoyaltyStatus, normalizeSessionCode } from '@/lib/loyalty';
import { generateSecureTransferCode } from '@/lib/secure-codes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureSqlitePragmas();

  const ip = getTrustedClientIp(request);
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

  // Check if MAC/IP is eligible for daily free trial
  let eligibleForFreeTrial = false;
  if (freeTrialEnabled && authStatus.macAddress && !authStatus.isAuthenticated && !authStatus.isPaused) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentClaim = await prisma.freeTrialClaim.findFirst({
      where: {
        claimedAt: { gt: twentyFourHoursAgo },
        OR: [
          { macAddress: authStatus.macAddress },
          { ipAddress: ip },
        ],
      },
    });
    eligibleForFreeTrial = !recentClaim;
  }

  // Proactively self-heal VIP devices on OpenWrt firewall
  if (authStatus.isVip && authStatus.macAddress) {
    setDaemonWhitelist(authStatus.macAddress, 'add', ip, {
      name: authStatus.deviceName,
      notes: authStatus.notes,
      notify: true,
    }).catch(() => {});
  } else if (authStatus.isAuthenticated && authStatus.macAddress && authStatus.remainingSeconds > 0) {
    authorizeClientMac(authStatus.macAddress, Math.ceil(authStatus.remainingSeconds / 60), ip, {
      isNewSession: false,
      notify: false,
      amount: 0,
    }).catch(() => {});
  }

  // Persistent Session Code (Kowdigo) Resolution
  let transferCode =
    authStatus.session?.transferCode ||
    request.cookies.get('piso_session_code')?.value ||
    request.headers.get('x-session-code');

  if (!transferCode && authStatus.macAddress) {
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

  if (!transferCode) {
    transferCode = generateSecureTransferCode();
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

  // Disabled auto-disclosure of candidateTransfer via DHCP hostname / IP collision to prevent session theft.
  const candidateTransfer = null;

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
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });
  }

  if (authStatus.sessionToken) {
    response.cookies.set('piso_session_token', authStatus.sessionToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });
  }

  return response;
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const ip = getTrustedClientIp(request);
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
