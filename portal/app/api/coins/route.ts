import { NextRequest, NextResponse } from 'next/server';
import { getDaemonCoins, clearDaemonCoins, simulateDaemonCoins, enableDaemonCoinSlot, disableDaemonCoinSlot } from '@/lib/daemon';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { calculateDurationFromAmount, DEFAULT_RATE_TIERS, DEFAULT_PROMO_TIERS, isPromoActive, RateTier } from '@/lib/rates';
import { cleanIpv4 } from '@/lib/arp';
import { getActiveLock, isClientLockHolder, acquireCoinLock, refreshCoinLockOnPulse, releaseCoinLock } from '@/lib/coin-lock';

export const dynamic = 'force-dynamic';

// In-memory sliding window rate limiter for coin slot enable requests
// Prevents spam-clicking from locking up the physical coin acceptor
const slotRequestHistory = new Map<string, number[]>();
const slotLockouts = new Map<string, number>(); // IP -> lockout until timestamp

const MAX_ENABLE_REQUESTS = 3;
const WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface CachedRateSettings {
  minutesPerPeso: number;
  ratesConfig: RateTier[];
  promoRatesConfig: RateTier[];
  promoRatesEnabled: boolean;
  promoStartHour: number;
  promoEndHour: number;
  showCoinSimulator: boolean;
  timeoutSeconds: number;
}

let cachedSettings: CachedRateSettings | null = null;
let settingsCacheExpiry = 0;

/**
 * Proxy, simulator, and rate calculator for coin pulses.
 * Polled by frontend every 200ms when active for realtime coin counting.
 */
export async function GET(request: NextRequest) {
  await ensureSqlitePragmas();

  const rawIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const clientIp = cleanIpv4(rawIp);
  const sessionToken =
    request.cookies.get('piso_session_token')?.value ||
    request.headers.get('x-session-token');

  const slotId = request.nextUrl.searchParams.get('slotId') || undefined;
  const { pulses, daemonOnline, coinSlotEnabled, isWanOnline } = await getDaemonCoins(slotId);

  // Fetch current rate settings from in-memory cache (5s TTL) or database
  let sData = cachedSettings;
  const now = Date.now();

  if (!sData || now > settingsCacheExpiry) {
    let minutesPerPeso = 10;
    let ratesConfig: RateTier[] = DEFAULT_RATE_TIERS;
    let promoRatesConfig: RateTier[] = DEFAULT_PROMO_TIERS;
    let promoRatesEnabled = false;
    let promoStartHour = 22; // 10 PM
    let promoEndHour = 6;    // 6 AM
    let showCoinSimulator = false;
    let timeoutSeconds = 60;

    try {
      const settings = await prisma.setting.findMany({
        where: {
          key: {
            in: [
              'minutes_per_peso',
              'rates_config',
              'promo_rates_enabled',
              'promo_start_hour',
              'promo_end_hour',
              'promo_rates_config',
              'show_coin_simulator',
              'coin_slot_timeout_seconds',
            ],
          },
        },
      });

      for (const s of settings) {
        if (s.key === 'minutes_per_peso' && !isNaN(parseInt(s.value, 10))) {
          minutesPerPeso = parseInt(s.value, 10);
        }
        if (s.key === 'show_coin_simulator') {
          showCoinSimulator = s.value === 'true';
        }
        if (s.key === 'coin_slot_timeout_seconds' && !isNaN(parseInt(s.value, 10))) {
          timeoutSeconds = parseInt(s.value, 10);
        }
        if (s.key === 'rates_config') {
          try {
            ratesConfig = JSON.parse(s.value);
          } catch {}
        }
        if (s.key === 'promo_rates_enabled') {
          promoRatesEnabled = s.value === 'true';
        }
        if (s.key === 'promo_start_hour' && !isNaN(parseInt(s.value, 10))) {
          promoStartHour = parseInt(s.value, 10);
        }
        if (s.key === 'promo_end_hour' && !isNaN(parseInt(s.value, 10))) {
          promoEndHour = parseInt(s.value, 10);
        }
        if (s.key === 'promo_rates_config') {
          try {
            promoRatesConfig = JSON.parse(s.value);
          } catch {}
        }
      }

      sData = {
        minutesPerPeso,
        ratesConfig,
        promoRatesConfig,
        promoRatesEnabled,
        promoStartHour,
        promoEndHour,
        showCoinSimulator,
        timeoutSeconds,
      };
      cachedSettings = sData;
      settingsCacheExpiry = now + 5000; // Cache for 5 seconds
    } catch (error) {
      console.error('Error reading rate settings:', error);
      sData = {
        minutesPerPeso,
        ratesConfig,
        promoRatesConfig,
        promoRatesEnabled,
        promoStartHour,
        promoEndHour,
        showCoinSimulator,
        timeoutSeconds,
      };
    }
  }

  const {
    minutesPerPeso,
    ratesConfig,
    promoRatesConfig,
    promoRatesEnabled,
    promoStartHour,
    promoEndHour,
    showCoinSimulator,
    timeoutSeconds,
  } = sData;

  // Check if promotional / happy hour rate is currently active
  const promoActive = promoRatesEnabled && isPromoActive(promoStartHour, promoEndHour);
  const activeTiers = promoActive ? promoRatesConfig : ratesConfig;

  // Inspect exclusive coinslot session lock
  const activeLock = getActiveLock();
  let isHolder = false;
  let isBusy = false;
  let busyRemainingSeconds = 0;

  if (activeLock) {
    isHolder = isClientLockHolder(clientIp, null, sessionToken);
    isBusy = !isHolder;
    busyRemainingSeconds = Math.max(0, Math.ceil((activeLock.expiresAt - Date.now()) / 1000));

    // If this client holds the lock, refresh heartbeat on new pulses
    if (isHolder && pulses > activeLock.lastPulses) {
      refreshCoinLockOnPulse(pulses, timeoutSeconds);
    }
  } else if (pulses > 0) {
    // Physical coins were dropped on hardware without an active session lock
    // Automatically bind lock to first active caller so they can claim their coins
    acquireCoinLock(clientIp, null, sessionToken, timeoutSeconds);
    isHolder = true;
    isBusy = false;
  }

  // Non-holders see 0 pulses and slot disabled so they cannot see or steal another customer's coins!
  const visiblePulses = isBusy ? 0 : pulses;
  const visibleSlotEnabled = isBusy ? false : (coinSlotEnabled ?? false);
  const lockRemainingSeconds = activeLock
    ? Math.max(0, Math.ceil((activeLock.expiresAt - Date.now()) / 1000))
    : timeoutSeconds;

  // Calculate estimated time based on visible pulses
  const estimatedMinutes = calculateDurationFromAmount(visiblePulses, activeTiers, minutesPerPeso);

  return NextResponse.json({
    pulses: visiblePulses,
    pesos: visiblePulses, // 1 pulse = 1 peso
    estimatedMinutes,
    minutesPerPeso,
    ratesConfig: activeTiers,
    standardRatesConfig: ratesConfig,
    promoRatesConfig,
    isPromoActive: promoActive,
    promoStartHour,
    promoEndHour,
    showCoinSimulator,
    daemonOnline,
    coinSlotEnabled: visibleSlotEnabled,
    isWanOnline: isWanOnline !== false,
    timeoutSeconds,
    isBusy,
    busyRemainingSeconds,
    isHolder,
    lockRemainingSeconds,
  });
}

/**
 * POST /api/coins
 * - action: 'enable' -> requests coin slot activation with abuse rate limiting & outage checks
 * - action: 'disable' -> manually inhibits coin slot
 * - action: 'simulate' -> injects test coin pulses (e.g. amount: 1, 5, 10, 20)
 * - action: 'clear' or default -> clears pending coins and resets slot abuse counters
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const rawIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const clientIp = cleanIpv4(rawIp);
  const sessionToken =
    request.cookies.get('piso_session_token')?.value ||
    request.headers.get('x-session-token');

  // Enable coin slot (customer pressed Insert Coin)
  if (body.action === 'enable') {
    // 1. Check if client IP is currently locked out for coinslot abuse
    const lockedUntil = slotLockouts.get(rawIp);
    if (lockedUntil && lockedUntil > Date.now()) {
      const remainingSecs = Math.ceil((lockedUntil - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: 'COIN_SLOT_ABUSE_LOCKOUT',
          message: `Too many insert coin requests without inserting coins. Please wait ${remainingSecs}s before trying again.`,
          lockoutSeconds: remainingSecs,
          coinSlotEnabled: false,
        },
        { status: 429 }
      );
    }

    // 2. Check if another customer is currently using the coin slot (Exclusive Lock)
    let timeoutSeconds = 60;
    try {
      const timeoutSetting = await prisma.setting.findUnique({
        where: { key: 'coin_slot_timeout_seconds' },
      });
      if (timeoutSetting && !isNaN(parseInt(timeoutSetting.value, 10))) {
        timeoutSeconds = parseInt(timeoutSetting.value, 10);
      }
    } catch {}

    const lockResult = acquireCoinLock(clientIp, null, sessionToken, timeoutSeconds);
    if (!lockResult.success) {
      return NextResponse.json(
        {
          error: 'COIN_SLOT_BUSY',
          message: 'Coinslot is currently in use by another customer. Please wait for your turn.',
          busyRemainingSeconds: lockResult.remainingSeconds,
          coinSlotEnabled: false,
          isBusy: true,
        },
        { status: 409 }
      );
    }

    // 3. Track sliding window rate limit
    const now = Date.now();
    const history = (slotRequestHistory.get(rawIp) || []).filter((t) => now - t < WINDOW_MS);
    history.push(now);
    slotRequestHistory.set(rawIp, history);

    if (history.length > MAX_ENABLE_REQUESTS) {
      slotLockouts.set(rawIp, now + LOCKOUT_MS);
      slotRequestHistory.delete(rawIp);
      releaseCoinLock(clientIp, null, sessionToken, true);
      return NextResponse.json(
        {
          error: 'COIN_SLOT_ABUSE_LOCKOUT',
          message: 'Too many insert coin requests without inserting coins. Please wait 5 minutes before trying again.',
          lockoutSeconds: Math.ceil(LOCKOUT_MS / 1000),
          coinSlotEnabled: false,
        },
        { status: 429 }
      );
    }

    const force = body.force === true;
    const slotId = typeof body.slotId === 'string' ? body.slotId : undefined;
    const result = await enableDaemonCoinSlot(force, slotId, timeoutSeconds);
    if (!result.success) {
      releaseCoinLock(clientIp, null, sessionToken, true);
      return NextResponse.json(
        {
          error: result.error || 'COIN_SLOT_UNAVAILABLE',
          message: result.message || 'Coin slot is currently unavailable.',
          coinSlotEnabled: false,
          isWanOnline: result.isWanOnline !== false,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, coinSlotEnabled: result.coinSlotEnabled, isWanOnline: true, isHolder: true });
  }

  // Disable coin slot (manual inhibit / cancel)
  if (body.action === 'disable') {
    if (isClientLockHolder(clientIp, null, sessionToken) || body.force) {
      releaseCoinLock(clientIp, null, sessionToken, true);
      const slotId = typeof body.slotId === 'string' ? body.slotId : undefined;
      const result = await disableDaemonCoinSlot(slotId);
      return NextResponse.json({ success: result.success, coinSlotEnabled: result.coinSlotEnabled });
    }
    return NextResponse.json({ success: true, coinSlotEnabled: false });
  }

  if (body.action === 'simulate' || typeof body.amount === 'number') {
    // Check if simulation is disabled
    try {
      const simSetting = await prisma.setting.findUnique({
        where: { key: 'show_coin_simulator' },
      });
      if (simSetting && simSetting.value === 'false') {
        return NextResponse.json(
          { error: 'Coin simulator is disabled in production settings' },
          { status: 403 }
        );
      }
    } catch {}

    const amount = Number(body.amount) || 1;
    const result = await simulateDaemonCoins(amount);
    refreshCoinLockOnPulse(result.pulses);
    return NextResponse.json({ success: true, pulses: result.pulses });
  }

  // Clear pending coins and reset client request counter
  slotRequestHistory.delete(rawIp);
  releaseCoinLock(clientIp, null, sessionToken, true);
  const slotId = typeof body.slotId === 'string' ? body.slotId : undefined;
  const success = await clearDaemonCoins(slotId);
  return NextResponse.json({ success, pulses: 0 });
}
