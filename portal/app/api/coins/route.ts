import { NextRequest, NextResponse } from 'next/server';
import {
  getDaemonCoins,
  clearDaemonCoins,
  simulateDaemonCoins,
  enableDaemonCoinSlot,
  disableDaemonCoinSlot,
} from '@/lib/daemon';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import {
  calculateDurationFromAmount,
  DEFAULT_RATE_TIERS,
  DEFAULT_PROMO_TIERS,
  isPromoActive,
  RateTier,
} from '@/lib/rates';
import { getTrustedClientIp } from '@/lib/client-ip';
import { isAdminRequest } from '@/lib/admin-auth';
import {
  getActiveLock,
  isClientLockHolder,
  acquireCoinLock,
  refreshCoinLockOnPulse,
  releaseCoinLock,
} from '@/lib/coin-lock';

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

  const clientIp = getTrustedClientIp(request);
  const sessionToken =
    request.cookies.get('piso_session_token')?.value ||
    request.headers.get('x-session-token');

  const slotId = request.nextUrl.searchParams.get('slotId')?.trim() || undefined;
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
    let promoEndHour = 6; // 6 AM
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

  // Inspect exclusive coinslot session lock for this slotId
  const activeLock = getActiveLock(slotId);
  let isHolder = false;
  let isBusy = false;
  let busyRemainingSeconds = 0;

  if (activeLock) {
    isHolder = isClientLockHolder(clientIp, null, sessionToken, slotId);
    isBusy = !isHolder;
    busyRemainingSeconds = Math.max(0, Math.ceil((activeLock.expiresAt - Date.now()) / 1000));

    // If this client holds the lock, refresh heartbeat on new pulses
    if (isHolder && pulses > activeLock.lastPulses) {
      refreshCoinLockOnPulse(pulses, timeoutSeconds, slotId);
    }
  } else if (pulses > 0) {
    // Physical coins were dropped on hardware without an active session lock
    // Automatically bind lock to first active caller so they can claim their coins
    acquireCoinLock(clientIp, null, sessionToken, timeoutSeconds, slotId);
    isHolder = true;
    isBusy = false;
  }

  // Non-holders see 0 pulses and slot disabled so they cannot see or steal another customer's coins
  const visiblePulses = isBusy ? 0 : pulses;
  const visibleSlotEnabled = isBusy ? false : (coinSlotEnabled ?? false);
  const lockRemainingSeconds = activeLock
    ? Math.max(0, Math.ceil((activeLock.expiresAt - Date.now()) / 1000))
    : timeoutSeconds;

  // Calculate estimated time based on visible pulses
  const estimatedMinutes = calculateDurationFromAmount(visiblePulses, activeTiers, minutesPerPeso);

  return NextResponse.json({
    pulses: visiblePulses,
    pesos: visiblePulses,
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
    slotId,
  });
}

/**
 * POST /api/coins
 * - action: 'enable' -> requests coin slot activation (force:true requires admin)
 * - action: 'disable' -> inhibits coin slot (force:true requires admin)
 * - action: 'simulate' -> injects test coin pulses (requires show_coin_simulator==='true', plus admin in prod)
 * - action: 'clear' -> clears pending coins (requires admin)
 */
export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  const body = await request.json().catch(() => ({}));
  const clientIp = getTrustedClientIp(request);
  const sessionToken =
    request.cookies.get('piso_session_token')?.value ||
    request.headers.get('x-session-token');
  const slotId = typeof body.slotId === 'string' && body.slotId.trim() ? body.slotId.trim() : undefined;

  // Enable coin slot (customer pressed Insert Coin, or admin force-unlock)
  if (body.action === 'enable') {
    const force = body.force === true;
    if (force && !(await isAdminRequest(request))) {
      return NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin authentication required for forced slot activation.' },
        { status: 403 }
      );
    }

    if (!force) {
      // 1. Check if client IP is currently locked out for coinslot abuse
      const lockedUntil = slotLockouts.get(clientIp);
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

    if (!force) {
      const lockResult = acquireCoinLock(clientIp, null, sessionToken, timeoutSeconds, slotId);
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
      const history = (slotRequestHistory.get(clientIp) || []).filter((t) => now - t < WINDOW_MS);
      history.push(now);
      slotRequestHistory.set(clientIp, history);

      if (history.length > MAX_ENABLE_REQUESTS) {
        slotLockouts.set(clientIp, now + LOCKOUT_MS);
        slotRequestHistory.delete(clientIp);
        releaseCoinLock(clientIp, null, sessionToken, true, slotId);
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
    }

    const result = await enableDaemonCoinSlot(force, slotId, timeoutSeconds);
    if (!result.success) {
      if (!force) {
        releaseCoinLock(clientIp, null, sessionToken, true, slotId);
      }
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

    return NextResponse.json({
      success: true,
      coinSlotEnabled: result.coinSlotEnabled,
      isWanOnline: true,
      isHolder: !force,
      slotId,
    });
  }

  // Disable coin slot (manual inhibit / cancel)
  if (body.action === 'disable') {
    const force = body.force === true;
    if (force && !(await isAdminRequest(request))) {
      return NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin authentication required for forced slot disable.' },
        { status: 403 }
      );
    }

    if (isClientLockHolder(clientIp, null, sessionToken, slotId) || force) {
      releaseCoinLock(clientIp, null, sessionToken, true, slotId);
      const result = await disableDaemonCoinSlot(slotId);
      return NextResponse.json({
        success: result.success,
        coinSlotEnabled: result.coinSlotEnabled,
        slotId,
      });
    }
    return NextResponse.json({ success: true, coinSlotEnabled: false, slotId });
  }

  // Simulate coin drop (restricted to explicit show_coin_simulator === 'true', plus admin in production)
  if (body.action === 'simulate' || typeof body.amount === 'number') {
    try {
      const simSetting = await prisma.setting.findUnique({
        where: { key: 'show_coin_simulator' },
      });
      if (!simSetting || simSetting.value !== 'true') {
        return NextResponse.json(
          { error: 'Coin simulator is disabled in system settings' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Coin simulator is disabled' },
        { status: 403 }
      );
    }

    if (process.env.NODE_ENV === 'production' && !(await isAdminRequest(request))) {
      return NextResponse.json(
        { error: 'Admin authentication required for coin simulation in production' },
        { status: 403 }
      );
    }

    const amount = Number(body.amount) || 1;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return NextResponse.json({ error: 'Invalid simulation amount' }, { status: 400 });
    }

    const result = await simulateDaemonCoins(amount, slotId);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Coin simulation failed' },
        { status: 403 }
      );
    }

    refreshCoinLockOnPulse(result.pulses, 60, slotId);
    return NextResponse.json({ success: true, pulses: result.pulses, slotId });
  }

  // Clear pending coins (admin only)
  if (body.action === 'clear') {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin authentication required to clear pending coins.' },
        { status: 403 }
      );
    }

    slotRequestHistory.delete(clientIp);
    releaseCoinLock(clientIp, null, sessionToken, true, slotId);
    const success = await clearDaemonCoins(slotId);
    return NextResponse.json({ success, pulses: 0, slotId });
  }

  return NextResponse.json({ error: 'Invalid coin action' }, { status: 400 });
}
