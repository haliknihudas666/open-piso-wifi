import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  RouterController,
  isPrivateLanIpv4,
  isValidIpv4,
  type RouterMode,
  type RouterConfig,
  type ShieldApplyConfig,
} from './services/router-controller.js';
import { TelegramBotService } from './services/telegram-bot.js';
import { SupabaseSyncService } from './services/supabase-sync.js';
import { SerialCoinBridge } from './services/serial-coin-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DAEMON_ROOT = path.basename(__dirname) === 'dist' ? path.resolve(__dirname, '..') : __dirname;

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

interface AuthorizeRequestBody {
  mac: string;
  durationMinutes: number;
  ip?: string;
  amount?: number;
  slotId?: string;
  type?: string;
  isNewSession?: boolean;
  notify?: boolean;
  deviceName?: string;
  notes?: string;
}

interface DeauthorizeRequestBody {
  mac: string;
  kickStation?: boolean;
}

interface TestConnectionRequestBody {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKeyPath?: string;
  mode?: RouterMode;
}

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const BIND_HOST = process.env.DAEMON_HOST || process.env.BIND_HOST || '0.0.0.0';

function initSatelliteSecret(): string {
  const configured = (process.env.SATELLITE_SECRET || process.env.SLOT_SECRET || '').trim();
  if (configured && configured !== 'change-me-to-a-secure-random-secret') {
    return configured;
  }
  const ephemeral = crypto.randomBytes(24).toString('hex');
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[SECURITY WARNING] SATELLITE_SECRET/SLOT_SECRET is unset or placeholder in production! Generated ephemeral runtime secret (ESP32 satellites must be provisioned with a persistent SATELLITE_SECRET in .env).'
    );
  } else {
    console.warn(
      '[DEV WARNING] SATELLITE_SECRET/SLOT_SECRET is unset; using generated ephemeral runtime secret.'
    );
  }
  return ephemeral;
}

const SATELLITE_SECRET = initSatelliteSecret();
const SATELLITE_REPLAY_WINDOW_MS = 60_000;
const SATELLITE_NONCE_TTL_MS = 120_000;
const MAX_NONCE_CACHE = 10_000;
const satelliteNonceCache = new Map<string, number>();

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isLoopbackAddress(remoteAddr?: string | null): boolean {
  const addr = (remoteAddr || '').trim();
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function getSatelliteSecret(): string {
  const envSecret = (process.env.SATELLITE_SECRET || process.env.SLOT_SECRET || '').trim();
  return envSecret || SATELLITE_SECRET;
}

export interface SatelliteVerifyInput {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  rawBody?: string;
  secret?: string;
  nowMs?: number;
  nonceCache?: Map<string, number>;
}

export function verifySatelliteRequest(input: SatelliteVerifyInput): {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  mode?: 'hmac' | 'legacy_header';
} {
  const querySecret = input.query?.secret;
  if (querySecret !== undefined) {
    return {
      ok: false,
      status: 401,
      error: 'QUERY_SECRET_DISABLED',
      message: 'Query parameter secret authentication is disabled; use HMAC or header auth.',
    };
  }

  const secret = input.secret ?? getSatelliteSecret();
  if (!secret) {
    return {
      ok: false,
      status: 401,
      error: 'UNAUTHORIZED_SATELLITE',
      message: 'Satellite secret not configured.',
    };
  }

  const getHeader = (name: string): string | undefined => {
    const val = input.headers[name] ?? input.headers[name.toLowerCase()];
    if (typeof val === 'string') return val;
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
    return undefined;
  };

  const tsHeader = getHeader('x-slot-timestamp');
  const nonceHeader = getHeader('x-slot-nonce');
  const sigHeader = getHeader('x-slot-signature');

  // If any HMAC header is present, enforce strict HMAC-SHA256 + 60s replay window + nonce cache
  if (tsHeader !== undefined || nonceHeader !== undefined || sigHeader !== undefined) {
    if (!tsHeader || !nonceHeader || !sigHeader) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_HMAC_HEADERS',
        message: 'x-slot-timestamp, x-slot-nonce, and x-slot-signature are all required for HMAC auth.',
      };
    }

    const tsRaw = tsHeader.trim();
    const nonce = nonceHeader.trim();
    const sigNorm = sigHeader.trim().toLowerCase();

    if (!nonce || nonce.length > 128 || !/^[0-9a-f]{64}$/.test(sigNorm)) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_HMAC_FORMAT',
        message: 'Malformed nonce or HMAC signature format.',
      };
    }

    const parsedTs = Number(tsRaw);
    if (!Number.isFinite(parsedTs) || parsedTs <= 0) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_TIMESTAMP',
        message: 'Invalid x-slot-timestamp header.',
      };
    }

    const nowMs = input.nowMs ?? Date.now();
    const tsMs = parsedTs < 1e12 ? parsedTs * 1000 : parsedTs;
    if (Math.abs(nowMs - tsMs) > SATELLITE_REPLAY_WINDOW_MS) {
      return {
        ok: false,
        status: 401,
        error: 'TIMESTAMP_OUT_OF_WINDOW',
        message: 'Satellite request timestamp is outside the 60s replay window.',
      };
    }

    const cache = input.nonceCache ?? satelliteNonceCache;
    for (const [cachedNonce, expiresAt] of cache.entries()) {
      if (expiresAt <= nowMs) {
        cache.delete(cachedNonce);
      }
    }

    if (cache.has(nonce)) {
      return {
        ok: false,
        status: 401,
        error: 'REPLAY_DETECTED',
        message: 'Duplicate satellite nonce rejected.',
      };
    }

    const rawBody = input.rawBody ?? '';
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${tsRaw}:${nonce}:${rawBody}`)
      .digest('hex');

    if (!timingSafeEqualStr(sigNorm, expectedSig)) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_SIGNATURE',
        message: 'Invalid satellite HMAC signature.',
      };
    }

    if (cache.size >= MAX_NONCE_CACHE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(nonce, nowMs + SATELLITE_NONCE_TTL_MS);

    return { ok: true, status: 200, mode: 'hmac' };
  }

  // Backwards-compatible legacy headers (x-slot-secret / Authorization: Bearer)
  const tokenHeader = getHeader('x-slot-secret');
  const authHeader = getHeader('authorization');

  let providedToken: string | undefined;
  if (typeof tokenHeader === 'string' && tokenHeader.trim()) {
    providedToken = tokenHeader.trim();
  } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  }

  if (!providedToken || !timingSafeEqualStr(providedToken, secret)) {
    return {
      ok: false,
      status: 401,
      error: 'UNAUTHORIZED_SATELLITE',
      message: 'Invalid or missing satellite authentication secret',
    };
  }

  return { ok: true, status: 200, mode: 'legacy_header' };
}

/**
 * Middleware enforcing localhost + shared DAEMON_API_SECRET on control routes.
 */
export function requireControlAuth(req: Request, res: Response, next: NextFunction) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    return res.status(403).json({
      error: 'FORBIDDEN_NON_LOCALHOST',
      message: 'Control endpoints are only accessible from localhost loopback.',
    });
  }

  const expectedSecret = process.env.DAEMON_API_SECRET || '';
  if (expectedSecret.length > 0) {
    const provided = typeof req.headers['x-daemon-secret'] === 'string' ? req.headers['x-daemon-secret'] : '';
    if (!provided || !timingSafeEqualStr(provided, expectedSecret)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing x-daemon-secret header.',
      });
    }
  }

  next();
}

/**
 * Middleware to verify that satellite requests (register, heartbeat, pulse)
 * originate from a legitimate ESP32 satellite via HMAC-SHA256 or shared header secret.
 */
export function verifySatelliteAuth(req: Request, res: Response, next: NextFunction) {
  const rawBody = (req as RequestWithRawBody).rawBody ?? (req.body ? JSON.stringify(req.body) : '');
  const result = verifySatelliteRequest({
    headers: req.headers,
    query: req.query as Record<string, unknown>,
    rawBody,
  });

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      message: result.message,
    });
  }
  next();
}

/**
 * Middleware to verify OpenPiso Shield WIDS event submissions (loopback OR shared shield/daemon/satellite secret).
 */
export function verifyShieldAuth(req: Request, res: Response, next: NextFunction) {
  if (isLoopbackAddress(req.socket?.remoteAddress)) {
    return next();
  }

  const expected =
    (process.env.SHIELD_SECRET || '').trim() ||
    (process.env.DAEMON_API_SECRET || '').trim() ||
    getSatelliteSecret();

  const shieldHeader = typeof req.headers['x-shield-secret'] === 'string' ? req.headers['x-shield-secret'].trim() : '';
  const slotHeader = typeof req.headers['x-slot-secret'] === 'string' ? req.headers['x-slot-secret'].trim() : '';
  const authHeader =
    typeof req.headers['authorization'] === 'string' && req.headers['authorization'].startsWith('Bearer ')
      ? req.headers['authorization'].substring(7).trim()
      : '';
  const provided = shieldHeader || slotHeader || authHeader;

  if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
    return res.status(401).json({
      error: 'UNAUTHORIZED_SHIELD',
      message: 'Invalid or missing shield authentication secret.',
    });
  }

  next();
}

const SATELLITE_PUBLIC_PATHS = new Set([
  '/api/coinslots/register',
  '/api/coinslots/heartbeat',
  '/api/coinslots/pulse',
]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const cleanPath = req.path.replace(/\/+$/, '') || '/';
  if (req.method === 'POST' && (SATELLITE_PUBLIC_PATHS.has(cleanPath) || cleanPath === '/api/shield/wids-event')) {
    return next();
  }
  return requireControlAuth(req, res, next);
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as RequestWithRawBody).rawBody = buf.toString('utf8');
    },
  })
);

let pendingCoins: number = 0;
let isHardwareGpioAvailable = false;
let coinSlotEnabled: boolean = false;    // Default to INHIBITED/BLOCKED on boot to prevent unauthorized coin insertion
let autoDisableTimer: ReturnType<typeof setTimeout> | null = null;

// --- CL-168 Coin Slot Event Log (circular buffer, last 100 events) ---
interface CoinEvent {
  timestamp: number;
  type:
    | 'pulse'
    | 'coin_detected'
    | 'slot_enabled'
    | 'slot_disabled'
    | 'inhibit_timeout'
    | 'error'
    | 'outage'
    | 'button_pressed'
    | 'tamper';
  value?: number;         // peso value for 'coin_detected'
  bcmPin?: number;
  rawPulseCount?: number; // how many pulses in the completed train
  trainMs?: number;       // duration of the pulse train in ms
  breakdown?: number[];   // constituent coin values e.g. [20, 5]
  reason?: string;
  widthMs?: number;
}
const coinEventLog: CoinEvent[] = [];
const MAX_EVENT_LOG = 100;

function logCoinEvent(event: CoinEvent) {
  coinEventLog.push(event);
  if (coinEventLog.length > MAX_EVENT_LOG) coinEventLog.shift();
}

// --- Denomination stats tracker ---
const denominationStats: Record<string, number[]> = { '1': [], '5': [], '10': [], '20': [] };

// --- ESP32 Wireless Satellite Multi-Coinslots Registry ---
export interface SatelliteCoinslot {
  id: string;
  name: string;
  ip: string;
  mac: string;
  status: 'ready' | 'unlocked' | 'offline';
  rssi?: number;
  lastHeartbeat: number;
  pendingCoins: number;
}
export const satelliteCoinslots = new Map<string, SatelliteCoinslot>();

// --- OpenPiso Shield Live State ---
export interface ShieldAlertRecord {
  id: string;
  timestamp: number;
  type: string;
  severity: 'high' | 'medium' | 'low';
  band?: string;
  ssid?: string;
  bssid?: string;
  mac?: string;
  count?: number;
  message: string;
}

const MAX_SHIELD_ALERTS = 100;
const shieldAlerts: ShieldAlertRecord[] = [];
let stormShieldUntil = 0;
let stormShieldEnabled = true;

export function getShieldCounts() {
  let deauthStorms = 0;
  let evilTwins = 0;
  let coinTampers = 0;
  for (const a of shieldAlerts) {
    if (a.type === 'deauth_storm' || a.type.includes('deauth')) deauthStorms++;
    else if (a.type === 'evil_twin') evilTwins++;
    else if (a.type === 'coin_tamper') coinTampers++;
  }
  return { deauthStorms, evilTwins, coinTampers, total: shieldAlerts.length };
}

export function getShieldAlerts(): ShieldAlertRecord[] {
  return [...shieldAlerts];
}

export function recordShieldAlert(input: Omit<ShieldAlertRecord, 'id' | 'timestamp'> & { timestamp?: number }): ShieldAlertRecord {
  const alert: ShieldAlertRecord = {
    id: crypto.randomUUID(),
    timestamp: input.timestamp ?? Date.now(),
    type: input.type,
    severity: input.severity,
    band: input.band,
    ssid: input.ssid,
    bssid: input.bssid,
    mac: input.mac,
    count: input.count,
    message: input.message,
  };
  shieldAlerts.unshift(alert);
  if (shieldAlerts.length > MAX_SHIELD_ALERTS) {
    shieldAlerts.length = MAX_SHIELD_ALERTS;
  }
  supabaseSync.recordSecurityAlert(alert).catch(() => {});
  return alert;
}

export function engageStormShield(durationSeconds = 90, reason?: string): number {
  if (!stormShieldEnabled) return 0;
  const clampedSec = Math.min(600, Math.max(15, Math.floor(durationSeconds)));
  const targetUntil = Date.now() + clampedSec * 1000;
  if (targetUntil > stormShieldUntil) {
    stormShieldUntil = targetUntil;
  }
  console.warn(`[OPENPISO SHIELD] Storm Shield ENGAGED for ${clampedSec}s${reason ? `: ${reason}` : ''}`);
  return Math.max(0, Math.ceil((stormShieldUntil - Date.now()) / 1000));
}

// --- Sales & Cashbox Telemetry State ---
let todaySalesTotal = 0;
let todayTxCount = 0;
let cashBoxAmount = 0;
let lastDayRecorded = new Date().toDateString();

function checkDayRollover() {
  const currentDay = new Date().toDateString();
  if (currentDay !== lastDayRecorded) {
    todaySalesTotal = 0;
    todayTxCount = 0;
    lastDayRecorded = currentDay;
  }
}

// --- Telegram, Supabase & Serial Coin Bridge Services ---
export const telegramBot = new TelegramBotService();
export const supabaseSync = new SupabaseSyncService();
export const serialCoinBridge = new SerialCoinBridge();

/**
 * Decomposes a total pulse count into Philippine coin denominations (20, 10, 5, 1).
 * E.g., 25 pulses -> [20, 5]
 * E.g., 60 pulses -> [20, 20, 20]
 * E.g., 68 pulses -> [20, 20, 5, 5, 5, 5, 5, 1, 1, 1]
 */
export function decomposePulseCount(totalPulses: number): number[] {
  if (totalPulses <= 0) return [];
  if ([20, 10, 5, 1].includes(totalPulses)) return [totalPulses];

  const denoms = [20, 10, 5, 1];
  const coins: number[] = [];
  let remaining = totalPulses;

  for (const d of denoms) {
    while (remaining >= d) {
      coins.push(d);
      remaining -= d;
    }
  }

  return coins;
}

function recordDenomination(pulseCount: number) {
  const coins = decomposePulseCount(pulseCount);
  for (const c of coins) {
    const key = String(c);
    if (denominationStats[key]) {
      denominationStats[key].push(c);
    }
  }
}

// --- Canonical BCM Pin Mapping (Raspberry Pi 40-pin BCM -> Physical reference only; NEVER remap BCM inputs!) ---
const BCM_TO_PHYSICAL: Record<number, number> = {
  2: 3,   3: 5,   4: 7,   14: 8,  15: 10, 17: 11, 18: 12, 27: 13,
  22: 15, 23: 16, 24: 18, 10: 19, 9: 21,  25: 22, 11: 23, 8: 24,
  7: 26,  5: 29,  6: 31,  12: 32, 13: 33, 19: 35, 16: 36, 26: 37,
  20: 38, 21: 40,
};

export function resolvePin(bcm: number): { bcm: number; physical: number } {
  return {
    bcm,
    physical: BCM_TO_PHYSICAL[bcm] ?? bcm,
  };
}

export type GpioBackend = 'auto' | 'gpiozero' | 'gpiod' | 'serial';

export interface PersistedGpioConfig {
  coinBcm: number;
  inhibitBcm: number;
  buttonBcm: number;
  inhibitActiveHigh: boolean;
  gpioBackend: GpioBackend;
  boardProfile: string;
  pulseMultiplier: number;
  serialPort: string;
  updatedAt?: string;
}

function getGpioConfigPath(): string {
  return process.env.DAEMON_GPIO_CONFIG_PATH || path.join(DAEMON_ROOT, '.gpio-config.json');
}

function parsePinEnvOrDefault(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 && n <= 512 ? n : fallback;
}

function parseBackend(raw: unknown, fallback: GpioBackend = 'auto'): GpioBackend {
  if (raw === 'auto' || raw === 'gpiozero' || raw === 'gpiod' || raw === 'serial') {
    return raw;
  }
  return fallback;
}

function loadPersistedGpioConfig(): PersistedGpioConfig {
  const defaults: PersistedGpioConfig = {
    coinBcm: parsePinEnvOrDefault(process.env.COIN_GPIO_PIN, 4),
    inhibitBcm: parsePinEnvOrDefault(process.env.INHIBIT_GPIO_PIN, 17),
    buttonBcm: parsePinEnvOrDefault(process.env.BUTTON_GPIO_PIN, 27),
    inhibitActiveHigh: process.env.INHIBIT_ACTIVE_HIGH !== 'false',
    gpioBackend: parseBackend(process.env.GPIO_BACKEND, 'auto'),
    boardProfile: (process.env.BOARD_PROFILE || 'rpi').trim() || 'rpi',
    pulseMultiplier: Math.max(1, parseInt(process.env.PULSE_MULTIPLIER || '1', 10) || 1),
    serialPort: (process.env.SERIAL_COIN_PORT || '').trim(),
  };

  try {
    const cfgPath = getGpioConfigPath();
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as Partial<PersistedGpioConfig>;
      return {
        coinBcm: typeof parsed.coinBcm === 'number' && Number.isInteger(parsed.coinBcm) && parsed.coinBcm >= 0 ? parsed.coinBcm : defaults.coinBcm,
        inhibitBcm: typeof parsed.inhibitBcm === 'number' && Number.isInteger(parsed.inhibitBcm) && parsed.inhibitBcm >= 0 ? parsed.inhibitBcm : defaults.inhibitBcm,
        buttonBcm: typeof parsed.buttonBcm === 'number' && Number.isInteger(parsed.buttonBcm) && parsed.buttonBcm >= 0 ? parsed.buttonBcm : defaults.buttonBcm,
        inhibitActiveHigh: typeof parsed.inhibitActiveHigh === 'boolean' ? parsed.inhibitActiveHigh : defaults.inhibitActiveHigh,
        gpioBackend: parseBackend(parsed.gpioBackend, defaults.gpioBackend),
        boardProfile: typeof parsed.boardProfile === 'string' && parsed.boardProfile.trim() ? parsed.boardProfile.trim() : defaults.boardProfile,
        pulseMultiplier:
          typeof parsed.pulseMultiplier === 'number' && Number.isFinite(parsed.pulseMultiplier) && parsed.pulseMultiplier >= 1
            ? Math.min(1000, Math.round(parsed.pulseMultiplier))
            : defaults.pulseMultiplier,
        serialPort: typeof parsed.serialPort === 'string' ? parsed.serialPort.trim() : defaults.serialPort,
      };
    }
  } catch (err: any) {
    console.warn('[GPIO] Could not load persisted .gpio-config.json:', err?.message || err);
  }

  return defaults;
}

function savePersistedGpioConfig(cfg: PersistedGpioConfig): void {
  try {
    const cfgPath = getGpioConfigPath();
    const payload = JSON.stringify({ ...cfg, updatedAt: new Date().toISOString() }, null, 2);
    fs.writeFileSync(cfgPath, payload, { mode: 0o600 });
    fs.chmodSync(cfgPath, 0o600);
  } catch (err: any) {
    console.warn('[GPIO] Could not persist .gpio-config.json:', err?.message || err);
  }
}

const bootGpioCfg = loadPersistedGpioConfig();
let activeCoinBcm = bootGpioCfg.coinBcm;
let activeInhibitBcm = bootGpioCfg.inhibitBcm;
let activeButtonBcm = bootGpioCfg.buttonBcm;
let inhibitActiveHigh = bootGpioCfg.inhibitActiveHigh;
let activeGpioBackend: GpioBackend = bootGpioCfg.gpioBackend;
let activeBoardProfile = bootGpioCfg.boardProfile;
let activePulseMultiplier = bootGpioCfg.pulseMultiplier;
let activeSerialPort = bootGpioCfg.serialPort;

const coinSlotTimeoutSeconds = process.env.COIN_SLOT_TIMEOUT_SECONDS
  ? parseInt(process.env.COIN_SLOT_TIMEOUT_SECONDS, 10)
  : 90;

let coinGpio: any = null;
let inhibitGpio: any = null;
let buttonGpio: any = null;
let lastButtonPress = 0;

// --- Outage Guard: Real-time WAN connectivity health checker ---
let isWanOnline = true;
let lastWanCheckTime = 0;
let wanCheckInProgress = false;

export async function checkWanStatus(): Promise<boolean> {
  if (Date.now() - lastWanCheckTime < 5000 && !wanCheckInProgress) {
    return isWanOnline;
  }
  wanCheckInProgress = true;
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2500);
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    socket.on('connect', () => {
      cleanup();
      isWanOnline = true;
      lastWanCheckTime = Date.now();
      wanCheckInProgress = false;
      resolve(true);
    });
    const onError = () => {
      cleanup();
      const socket2 = new net.Socket();
      socket2.setTimeout(2500);
      const cleanup2 = () => {
        socket2.removeAllListeners();
        socket2.destroy();
      };
      socket2.on('connect', () => {
        cleanup2();
        isWanOnline = true;
        lastWanCheckTime = Date.now();
        wanCheckInProgress = false;
        resolve(true);
      });
      const onFail = () => {
        cleanup2();
        isWanOnline = false;
        lastWanCheckTime = Date.now();
        wanCheckInProgress = false;
        resolve(false);
      };
      socket2.on('error', onFail);
      socket2.on('timeout', onFail);
      try {
        socket2.connect(53, '8.8.8.8');
      } catch {
        onFail();
      }
    };
    socket.on('error', onError);
    socket.on('timeout', onError);
    try {
      socket.connect(53, '1.1.1.1');
    } catch {
      onError();
    }
  });
}

function handlePhysicalButtonPressed() {
  const now = Date.now();
  if (now - lastButtonPress < 1000) return; // 1s debounce
  lastButtonPress = now;
  console.log(`[HARDWARE BUTTON] 🕹️ Physical Insert Coin button pressed on BCM ${activeButtonBcm}!`);
  logCoinEvent({ timestamp: now, type: 'button_pressed', bcmPin: activeButtonBcm });
  void enableCoinSlot();
}

let prevWanStatus = true;
let consecutiveWanFailures = 0;
let consecutiveWanSuccesses = 0;

// Initialize the OpenWrt Router Controller (defaults to 192.168.1.1)
const router = new RouterController();

let lastGpioError: string | null = null;
let bridgeProcess: ChildProcess | null = null;

// Pulse-train collector & tamper tracking
let trainPulses: number[] = [];
let trainTimer: ReturnType<typeof setTimeout> | null = null;
let inhibitedPulseTimestamps: number[] = [];
const TAMPER_WINDOW_MS = 10_000;
const TAMPER_THRESHOLD = 3;

export function getCoinStateForTest() {
  return {
    pendingCoins,
    coinSlotEnabled,
    pulseMultiplier: activePulseMultiplier,
    inhibitedPulseCount: inhibitedPulseTimestamps.length,
  };
}

export function resetCoinStateForTest(options?: { enabled?: boolean; pulseMultiplier?: number }) {
  pendingCoins = 0;
  coinSlotEnabled = options?.enabled ?? false;
  activePulseMultiplier = options?.pulseMultiplier ?? 1;
  inhibitedPulseTimestamps = [];
  trainPulses = [];
  if (trainTimer) {
    clearTimeout(trainTimer);
    trainTimer = null;
  }
  if (autoDisableTimer) {
    clearTimeout(autoDisableTimer);
    autoDisableTimer = null;
  }
  shieldAlerts.length = 0;
}

function recordBlockedPulseTamper(bcmPin: number, now: number, sourceLabel = 'GPIO') {
  inhibitedPulseTimestamps = inhibitedPulseTimestamps.filter((ts) => now - ts <= TAMPER_WINDOW_MS);
  inhibitedPulseTimestamps.push(now);

  logCoinEvent({
    timestamp: now,
    type: 'tamper',
    bcmPin,
    value: 0,
    reason: 'inhibited_pulse',
  });
  console.warn(
    `[TAMPER GUARD] Blocked ${sourceLabel} pulse on BCM ${bcmPin} while coin slot is INHIBITED (${inhibitedPulseTimestamps.length}/${TAMPER_THRESHOLD} in 10s).`
  );

  if (inhibitedPulseTimestamps.length >= TAMPER_THRESHOLD) {
    const burstCount = inhibitedPulseTimestamps.length;
    inhibitedPulseTimestamps = [];
    const message = `Detected ${burstCount} pulses on ${sourceLabel} BCM ${bcmPin} while slot inhibited within 10s`;
    recordShieldAlert({
      type: 'coin_tamper',
      severity: 'high',
      count: burstCount,
      message,
    });
    void telegramBot.notifySecurityAlert('coin_tamper', 'high', {
      message,
      source: sourceLabel,
      bcmPin,
      count: burstCount,
    });
  }
}

export function handleIncomingPulse(bcmPin: number, nowOverride?: number): boolean {
  const now = nowOverride ?? Date.now();

  // Gate pulses strictly on coinSlotEnabled to stop un-inhibited/piezo/wire-tap coin theft
  if (!coinSlotEnabled) {
    recordBlockedPulseTamper(bcmPin, now, 'GPIO');
    return false;
  }

  // 1. Credit peso value (1 pulse * pulseMultiplier) in real-time
  const valueDelta = activePulseMultiplier;
  pendingCoins += valueDelta;

  // 2. Keep the coin slot alive: reset the auto-disable timer on every pulse
  resetAutoDisableTimer();

  // 3. Log real-time pulse event
  logCoinEvent({ timestamp: now, type: 'pulse', bcmPin, value: valueDelta });
  console.log(`[GPIO] ⚡ PULSE DETECTED on BCM ${bcmPin} (+₱${valueDelta}) -> pendingCoins: ₱${pendingCoins}`);

  // 4. Background train tracking for stats & diagnostics (purely telemetry)
  trainPulses.push(now);

  // Settle window (400ms after last pulse) to record finished coin/train telemetry
  if (trainTimer) clearTimeout(trainTimer);
  trainTimer = setTimeout(() => {
    const pulseCount = trainPulses.length;
    const totalValue = pulseCount * activePulseMultiplier;
    const lastPulse = trainPulses[trainPulses.length - 1] ?? now;
    const firstPulse = trainPulses[0] ?? now;
    const trainMs = trainPulses.length > 1 ? lastPulse - firstPulse : 0;
    trainPulses = [];
    trainTimer = null;

    const breakdown = decomposePulseCount(totalValue);
    recordDenomination(totalValue);

    const breakdownText = breakdown.length > 1
      ? ` -> breakdown: ${breakdown.map((c) => `₱${c}`).join(' + ')}`
      : '';

    logCoinEvent({
      timestamp: Date.now(),
      type: 'coin_detected',
      value: totalValue,
      bcmPin,
      rawPulseCount: pulseCount,
      trainMs,
      breakdown,
    });
    console.log(
      `[HARDWARE] 🪙 Coin train settled: ₱${totalValue}${breakdownText} (${pulseCount} pulses x ${activePulseMultiplier} in ${trainMs}ms). Total pending: ₱${pendingCoins}`
    );

    telegramBot.notifyCoinInserted('Local GPIO Slot', totalValue, pendingCoins);
  }, 400);

  return true;
}

/**
 * Sets the inhibit pin state across Python bridge, onoff, and USB serial bridge.
 */
function setInhibitPin(blocked: boolean) {
  // targetLevel: 0 (LOW / 0V) or 1 (HIGH / 3.3V)
  const targetLevel = inhibitActiveHigh ? (blocked ? 1 : 0) : (blocked ? 0 : 1);

  if (bridgeProcess && bridgeProcess.stdin && !bridgeProcess.killed) {
    try {
      bridgeProcess.stdin.write(`${blocked ? 'disable' : 'enable'} ${targetLevel}\n`);
      console.log(`[INHIBIT] Python bridge: sent ${blocked ? 'disable (blocked)' : 'enable (accept)'} level=${targetLevel} (activeHigh=${inhibitActiveHigh})`);
    } catch (err) {
      console.error('[INHIBIT] Failed writing to Python bridge:', err);
    }
  }
  if (inhibitGpio) {
    try {
      inhibitGpio.writeSync(targetLevel);
      console.log(`[INHIBIT] onoff: Pin physical level set to ${targetLevel} (${blocked ? 'BLOCKED' : 'ENABLED'}, activeHigh=${inhibitActiveHigh}).`);
    } catch (err) {
      console.error('[INHIBIT] Failed writing to onoff:', err);
    }
  }
  if (serialCoinBridge.isActive()) {
    serialCoinBridge.setInhibit(blocked);
  }
}

/**
 * Enable the coin slot: pull inhibit pin LOW, start auto-disable timer.
 * Timer resets on each coin detected.
 * Returns true if successfully enabled, false if blocked by outage guard.
 */
export async function enableCoinSlot(force = false): Promise<boolean> {
  if (!force) {
    const online = await checkWanStatus();
    if (!online) {
      console.warn('[OUTAGE GUARD] Cannot enable coin slot: Internet connection is DOWN!');
      return false;
    }
  }
  coinSlotEnabled = true;
  setInhibitPin(false); // slot accepting
  logCoinEvent({ timestamp: Date.now(), type: 'slot_enabled', bcmPin: activeInhibitBcm });
  console.log(`[INHIBIT] Coin slot ENABLED (BCM ${activeInhibitBcm} → ACCEPT). Auto-disable in ${coinSlotTimeoutSeconds}s.`);
  resetAutoDisableTimer();
  return true;
}

/**
 * Disable the coin slot: pull inhibit pin HIGH.
 */
export function disableCoinSlot(reason: 'manual' | 'timeout' | 'outage' = 'manual') {
  coinSlotEnabled = false;
  setInhibitPin(true); // slot blocked
  if (autoDisableTimer) { clearTimeout(autoDisableTimer); autoDisableTimer = null; }
  const type = reason === 'timeout' ? 'inhibit_timeout' : (reason === 'outage' ? 'outage' : 'slot_disabled');
  logCoinEvent({ timestamp: Date.now(), type, bcmPin: activeInhibitBcm });
  console.log(`[INHIBIT] Coin slot DISABLED (BCM ${activeInhibitBcm} → BLOCKED). Reason: ${reason}.`);
}

function resetAutoDisableTimer() {
  if (autoDisableTimer) clearTimeout(autoDisableTimer);
  autoDisableTimer = setTimeout(() => {
    console.log(`[INHIBIT] Auto-disable timeout (${coinSlotTimeoutSeconds}s). Blocking coin slot.`);
    disableCoinSlot('timeout');
  }, coinSlotTimeoutSeconds * 1000);
}

/**
 * Try initializing hardware via Python gpiozero / libgpiod bridge
 */
function tryInitPythonBridge(
  coinBcm: number,
  inhibitBcm: number,
  buttonBcm: number,
  backend: 'auto' | 'gpiozero' | 'gpiod' = 'auto'
): Promise<boolean> {
  return new Promise((resolve) => {
    if (bridgeProcess) {
      try { bridgeProcess.stdin?.write('quit\n'); bridgeProcess.kill('SIGTERM'); } catch {}
      bridgeProcess = null;
    }

    const scriptCandidates = [
      path.resolve(process.cwd(), 'scripts/gpio-bridge.py'),
      path.resolve(process.cwd(), 'daemon/scripts/gpio-bridge.py'),
      path.resolve(process.cwd(), 'pisowifi-daemon/scripts/gpio-bridge.py'),
      path.resolve(__dirname, 'scripts/gpio-bridge.py'),
      path.resolve(__dirname, '../scripts/gpio-bridge.py'),
    ];
    const scriptPath = scriptCandidates.find((p) => fs.existsSync(p));
    if (!scriptPath) {
      console.log('[GPIO] Python bridge script not found at expected paths.');
      return resolve(false);
    }

    try {
      console.log(
        `[GPIO] Spawning Python bridge (${backend}): ${scriptPath} ${coinBcm} ${inhibitBcm} ${inhibitActiveHigh} ${buttonBcm} ${backend}`
      );
      const proc = spawn(
        'python3',
        ['-u', scriptPath, String(coinBcm), String(inhibitBcm), String(inhibitActiveHigh), String(buttonBcm), backend],
        { stdio: ['pipe', 'pipe', 'inherit'] }
      );

      let resolved = false;
      let pythonStdoutBuffer = '';

      proc.stdout?.on('data', (data: Buffer) => {
        pythonStdoutBuffer += data.toString();
        const lines = pythonStdoutBuffer.split('\n');
        pythonStdoutBuffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          if (line === 'PULSE') {
            handleIncomingPulse(coinBcm);
          } else if (line === 'BUTTON_PRESSED') {
            handlePhysicalButtonPressed();
          } else if (line.startsWith('{')) {
            try {
              const msg = JSON.parse(line) as {
                status?: string;
                event?: string;
                error?: string;
                backend?: string;
                reason?: string;
                widthMs?: number;
              };
              if (msg.status === 'ready') {
                bridgeProcess = proc;
                console.log(
                  `[GPIO] Python bridge (${msg.backend || backend}) ready! (Coin: BCM ${coinBcm}, Inhibit: BCM ${inhibitBcm}, Button: BCM ${buttonBcm}, activeHigh: ${inhibitActiveHigh})`
                );
                setInhibitPin(!coinSlotEnabled);
                if (!resolved) {
                  resolved = true;
                  resolve(true);
                }
              } else if (msg.event === 'tamper') {
                const reason = msg.reason || 'abnormal_pulse';
                const widthMs = typeof msg.widthMs === 'number' ? msg.widthMs : undefined;
                logCoinEvent({ timestamp: Date.now(), type: 'tamper', bcmPin: coinBcm, reason, widthMs });
                const alertMsg = `Hardware tamper on BCM ${coinBcm}: ${reason}${widthMs !== undefined ? ` (${widthMs}ms)` : ''}`;
                if (reason === 'stuck_low') {
                  recordShieldAlert({ type: 'coin_tamper', severity: 'high', message: alertMsg });
                  void telegramBot.notifySecurityAlert('coin_tamper', 'high', { message: alertMsg, reason, widthMs, bcmPin: coinBcm });
                } else {
                  recordBlockedPulseTamper(coinBcm, Date.now(), `GPIO-${reason}`);
                }
              } else if (msg.status === 'error') {
                lastGpioError = `Python bridge error: ${msg.error}`;
                console.warn(`[GPIO] ${lastGpioError}`);
                if (!resolved) {
                  resolved = true;
                  resolve(false);
                }
              }
            } catch {}
          }
        }
      });

      proc.on('error', (err) => {
        lastGpioError = `Python spawn error: ${err.message}`;
        console.warn(`[GPIO] ${lastGpioError}`);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      proc.on('exit', (code) => {
        console.log(`[GPIO] Python bridge process exited with code ${code}`);
        bridgeProcess = null;
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 3500);
    } catch (e: any) {
      lastGpioError = `Python bridge invocation failed: ${e?.message || e}`;
      resolve(false);
    }
  });
}

/**
 * Fallback to onoff library for legacy sysfs systems (Raspberry Pi OS Bullseye / older)
 */
async function tryInitOnoff(coinBcm: number, inhibitBcm: number, buttonBcm?: number): Promise<boolean> {
  try {
    const { Gpio } = await import('onoff');

    if (inhibitGpio) { try { inhibitGpio.unexport(); } catch {} }
    inhibitGpio = new Gpio(inhibitBcm, 'out');
    setInhibitPin(true);

    if (coinGpio) { try { coinGpio.unwatchAll(); coinGpio.unexport(); } catch {} }
    coinGpio = new Gpio(coinBcm, 'in', 'falling', { debounceTimeout: 0 });
    coinGpio.watch((err: Error | null | undefined) => {
      if (err) {
        logCoinEvent({ timestamp: Date.now(), type: 'error', bcmPin: coinBcm });
        console.error('[GPIO] onoff watch error:', err);
        return;
      }
      handleIncomingPulse(coinBcm);
    });

    if (buttonGpio) { try { buttonGpio.unwatchAll(); buttonGpio.unexport(); } catch {} buttonGpio = null; }
    if (buttonBcm !== undefined && buttonBcm >= 0 && buttonBcm !== coinBcm && buttonBcm !== inhibitBcm) {
      try {
        buttonGpio = new Gpio(buttonBcm, 'in', 'falling', { debounceTimeout: 50 });
        buttonGpio.watch((err: Error | null | undefined) => {
          if (!err) handlePhysicalButtonPressed();
        });
      } catch {}
    }

    console.log(`[GPIO] onoff legacy sysfs driver initialized (Coin: BCM ${coinBcm}, Inhibit: BCM ${inhibitBcm})`);
    return true;
  } catch (err: any) {
    console.warn(`[GPIO] onoff driver failed (sysfs deprecated): ${err?.message || err}`);
    return false;
  }
}

let serialListenersBound = false;
function bindSerialBridgeEvents() {
  if (serialListenersBound) return;
  serialListenersBound = true;

  serialCoinBridge.on('ready', () => {
    serialCoinBridge.setInhibit(!coinSlotEnabled);
  });

  serialCoinBridge.on('coin_inserted', ({ pulses }: { amount: number; pulses: number }) => {
    const now = Date.now();
    if (!coinSlotEnabled) {
      for (let i = 0; i < pulses; i++) {
        recordBlockedPulseTamper(activeCoinBcm, now, 'USB-Serial');
      }
      return;
    }

    const totalValue = pulses * activePulseMultiplier;
    pendingCoins += totalValue;
    resetAutoDisableTimer();

    const breakdown = decomposePulseCount(totalValue);
    recordDenomination(totalValue);
    logCoinEvent({
      timestamp: now,
      type: 'coin_detected',
      value: totalValue,
      bcmPin: activeCoinBcm,
      rawPulseCount: pulses,
      breakdown,
    });
    console.log(`[SERIAL-BRIDGE] 🪙 Accepted ${pulses} pulse(s) x ${activePulseMultiplier} = ₱${totalValue}. Pending: ₱${pendingCoins}`);
    telegramBot.notifyCoinInserted('USB Serial Bridge', totalValue, pendingCoins);
  });

  serialCoinBridge.on('tamper', ({ reason, widthMs }: { reason: string; widthMs?: number }) => {
    const now = Date.now();
    logCoinEvent({ timestamp: now, type: 'tamper', bcmPin: activeCoinBcm, reason, widthMs });
    const msg = `USB serial coin bridge tamper: ${reason}${widthMs !== undefined ? ` (${widthMs}ms)` : ''}`;
    recordShieldAlert({ type: 'coin_tamper', severity: 'high', message: msg });
    void telegramBot.notifySecurityAlert('coin_tamper', 'high', { message: msg, reason, widthMs });
  });
}

/**
 * Initialize (or re-initialize) coin + inhibit + button GPIO or USB serial bridge.
 */
async function initGpio(
  coinBcm: number,
  inhibitBcm: number,
  buttonBcm: number = activeButtonBcm,
  backend: GpioBackend = activeGpioBackend,
  serialPort: string = activeSerialPort
) {
  activeCoinBcm = coinBcm;
  activeInhibitBcm = inhibitBcm;
  activeButtonBcm = buttonBcm;
  activeGpioBackend = backend;
  activeSerialPort = serialPort;

  serialCoinBridge.stop();
  bindSerialBridgeEvents();

  if (process.platform !== 'linux') {
    lastGpioError = `Running on ${process.platform} (Non-Linux): Hardware GPIO disabled, Simulation mode active.`;
    console.log(`[GPIO] ${lastGpioError}`);
    return;
  }

  // Serial USB Bridge mode (x86_64 Mini PC / esp32-coin-bridge.ino)
  if (backend === 'serial') {
    if (bridgeProcess) {
      try { bridgeProcess.stdin?.write('quit\n'); bridgeProcess.kill('SIGTERM'); } catch {}
      bridgeProcess = null;
    }
    const serialOk = await serialCoinBridge.start(serialPort || process.env.SERIAL_COIN_PORT || '');
    isHardwareGpioAvailable = serialOk;
    lastGpioError = serialOk ? null : serialCoinBridge.getLastError() || 'Serial coin bridge failed to open port.';
    return;
  }

  // 1. Primary: Python gpiozero / gpiod bridge
  const pyBackend = backend === 'gpiod' ? 'gpiod' : backend === 'gpiozero' ? 'gpiozero' : 'auto';
  const pythonOk = await tryInitPythonBridge(coinBcm, inhibitBcm, buttonBcm, pyBackend);
  if (pythonOk) {
    isHardwareGpioAvailable = true;
    lastGpioError = null;
    return;
  }

  // 2. Secondary: Fallback to onoff for older systems (unless user explicitly requested gpiod only)
  if (backend !== 'gpiod') {
    const onoffOk = await tryInitOnoff(coinBcm, inhibitBcm, buttonBcm);
    if (onoffOk) {
      isHardwareGpioAvailable = true;
      lastGpioError = null;
      return;
    }
  }

  // 3. Fallback to USB Serial Bridge in 'auto' mode if SERIAL_COIN_PORT is configured
  if (backend === 'auto' && (serialPort || process.env.SERIAL_COIN_PORT)) {
    const serialOk = await serialCoinBridge.start(serialPort || process.env.SERIAL_COIN_PORT || '');
    if (serialOk) {
      isHardwareGpioAvailable = true;
      lastGpioError = null;
      return;
    }
  }

  isHardwareGpioAvailable = false;
  if (!lastGpioError) {
    lastGpioError = 'GPIO initialization failed. Install python3-gpiozero python3-lgpio or python3-libgpiod.';
  }
  console.warn(`[GPIO] Hardware GPIO unavailable: ${lastGpioError}`);
}

// -------------------------------------------------------------
// DAEMON STATUS & VERSION API
// -------------------------------------------------------------
app.get('/api/version', (_req: Request, res: Response) => {
  let version = '1.0.2';
  const candidatePkgPaths = [
    new URL('./package.json', import.meta.url),
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
  ];
  for (const candidate of candidatePkgPaths) {
    try {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if ((pkg.name === 'open-piso-wifi-daemon' || pkg.name === 'pisowifi-daemon') && pkg.version) {
          version = pkg.version;
          break;
        }
      }
    } catch {}
  }

  res.json({
    name: 'pisowifi-daemon',
    version: `v${version.replace(/^v/, '')}`,
    nodeVersion: process.version,
    platform: `${process.platform} (${process.arch})`,
    uptime: Math.floor(process.uptime()),
    gpioAvailable: isHardwareGpioAvailable,
    online: true,
  });
});

// -------------------------------------------------------------
// COIN ACCEPTOR API ENDPOINTS
// -------------------------------------------------------------

// API for Next.js to check pending coins + slot state (supports ?slotId= query)
app.get('/api/coins', (req: Request, res: Response) => {
  const rawSlotId = typeof req.query.slotId === 'string' ? req.query.slotId.trim() : '';
  const slotId = rawSlotId || undefined;
  let pulses = pendingCoins;
  let slotEnabled = coinSlotEnabled;

  if (slotId && slotId !== 'local' && slotId !== 'main') {
    if (satelliteCoinslots.has(slotId)) {
      const slot = satelliteCoinslots.get(slotId)!;
      pulses = slot.pendingCoins;
      slotEnabled = slot.status === 'unlocked';
    } else {
      pulses = 0;
      slotEnabled = false;
    }
  }

  const coin = resolvePin(activeCoinBcm);
  const inhibit = resolvePin(activeInhibitBcm);
  const button = resolvePin(activeButtonBcm);
  res.json({
    pulses,
    gpioAvailable: isHardwareGpioAvailable,
    coinSlotEnabled: slotEnabled,
    isWanOnline,
    slotId,
    activeSlots: satelliteCoinslots.size + (isHardwareGpioAvailable ? 1 : 0),
    coinPin: coin.physical,
    inhibitPin: inhibit.physical,
    buttonPin: button.physical,
    coinBcm: coin.bcm,
    inhibitBcm: inhibit.bcm,
    buttonBcm: button.bcm,
    pulseMultiplier: activePulseMultiplier,
  });
});

// API for Next.js or developer to simulate inserting coins (testing)
app.post('/api/coins/simulate', (req: Request<{}, {}, { amount?: number; pulses?: number; slotId?: string }>, res: Response) => {
  // Security guard: Disable simulator in production environments or when accessed externally
  const isDev = process.env.NODE_ENV !== 'production';
  const simulatorEnabled = process.env.ENABLE_COIN_SIMULATOR === 'true' || isDev;
  const isLocalhost = isLoopbackAddress(req.socket.remoteAddress);

  if (!simulatorEnabled || !isLocalhost) {
    return res.status(403).json({
      error: 'SIMULATOR_DISABLED',
      message: 'Coin simulator is disabled in production and only accessible via localhost.',
    });
  }

  const addPulses = Math.max(1, Math.floor(Number(req.body.amount || req.body.pulses || 1)));
  const rawSlotId = typeof req.body.slotId === 'string' ? req.body.slotId.trim() : '';
  const slotId = rawSlotId || undefined;

  if (slotId && slotId !== 'local' && slotId !== 'main') {
    if (!satelliteCoinslots.has(slotId)) {
      return res.status(404).json({ error: 'SLOT_NOT_FOUND', message: `Satellite slot '${slotId}' not registered.` });
    }
    const slot = satelliteCoinslots.get(slotId)!;
    slot.pendingCoins += addPulses;
    logCoinEvent({ timestamp: Date.now(), type: 'coin_detected', value: addPulses, rawPulseCount: addPulses });
    telegramBot.notifyCoinInserted(slot.name, addPulses, slot.pendingCoins);
    return res.json({ success: true, slotId, pulses: slot.pendingCoins });
  }

  if (!coinSlotEnabled && isHardwareGpioAvailable) {
    return res.status(403).json({ error: 'Coin slot is inhibited. Enable it first via /api/coins/enable.' });
  }

  pendingCoins += addPulses;
  logCoinEvent({ timestamp: Date.now(), type: 'coin_detected', value: addPulses, rawPulseCount: addPulses });
  console.log(`[SIMULATOR] Injected ${addPulses} coin pulse(s). Total pending: ₱${pendingCoins}`);
  telegramBot.notifyCoinInserted('Local Simulator', addPulses, pendingCoins);
  res.json({ success: true, pulses: pendingCoins });
});

function notifySatelliteDisable(slot: SatelliteCoinslot) {
  const secret = getSatelliteSecret();
  fetch(`http://${slot.ip}/disable`, {
    method: 'POST',
    headers: {
      'X-Slot-Secret': secret,
      'Authorization': `Bearer ${secret}`,
    },
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

// Atomic coin claim: reads + zeroes pending coins for the targeted slot (or local) and inhibits the slot
app.post('/api/coins/claim', (req: Request<{}, {}, { slotId?: string }>, res: Response) => {
  const rawSlotId = typeof req.body?.slotId === 'string' ? req.body.slotId.trim() : '';
  const slotId = rawSlotId || undefined;

  if (slotId && slotId !== 'local' && slotId !== 'main') {
    if (!satelliteCoinslots.has(slotId)) {
      return res.json({ success: true, pulses: 0, slotId, coinSlotEnabled: false });
    }
    const slot = satelliteCoinslots.get(slotId)!;
    const claimedPulses = slot.pendingCoins;
    slot.pendingCoins = 0;
    slot.status = 'ready';
    notifySatelliteDisable(slot);
    return res.json({ success: true, pulses: claimedPulses, slotId, coinSlotEnabled: false });
  }

  const claimedPulses = pendingCoins;
  pendingCoins = 0;
  disableCoinSlot('manual');
  res.json({ success: true, pulses: claimedPulses, slotId: slotId ?? null, coinSlotEnabled: false });
});

// API for Next.js to clear coins after crediting a session — also re-inhibits the slot
app.post('/api/coins/clear', (req: Request<{}, {}, { slotId?: string }>, res: Response) => {
  const rawSlotId = typeof req.body?.slotId === 'string' ? req.body.slotId.trim() : '';
  const slotId = rawSlotId || undefined;

  if (slotId && slotId !== 'local' && slotId !== 'main') {
    if (satelliteCoinslots.has(slotId)) {
      const slot = satelliteCoinslots.get(slotId)!;
      slot.pendingCoins = 0;
      slot.status = 'ready';
      notifySatelliteDisable(slot);
    }
    return res.json({ success: true, slotId, pulses: 0, coinSlotEnabled: false });
  }

  pendingCoins = 0;
  disableCoinSlot('manual');
  res.json({ success: true, pulses: 0, coinSlotEnabled: false });
});

// Enable coin slot: inhibit pin goes LOW (if WAN online or force=true)
app.post('/api/coins/enable', async (req: Request<{}, {}, { force?: boolean; slotId?: string; timeoutSeconds?: number }>, res: Response) => {
  const force = req.body?.force === true;
  const rawSlotId = typeof req.body?.slotId === 'string' ? req.body.slotId.trim() : '';
  const slotId = rawSlotId || undefined;
  const timeoutSec = Math.max(10, Math.min(600, Math.floor(Number(req.body?.timeoutSeconds || coinSlotTimeoutSeconds))));

  if (!force) {
    const online = await checkWanStatus();
    if (!online) {
      return res.status(503).json({
        success: false,
        error: 'NO_INTERNET',
        message: 'Internet connection is unavailable. Coinslot temporarily disabled to prevent coin loss.',
        coinSlotEnabled: false,
        isWanOnline: false,
      });
    }
  }

  // If targeting a wireless satellite ESP32 slot
  if (slotId && slotId !== 'local' && slotId !== 'main') {
    if (!satelliteCoinslots.has(slotId)) {
      return res.status(404).json({
        success: false,
        error: 'SLOT_NOT_FOUND',
        message: `Satellite slot '${slotId}' is not registered.`,
        coinSlotEnabled: false,
      });
    }
    const slot = satelliteCoinslots.get(slotId)!;
    slot.status = 'unlocked';
    const secret = getSatelliteSecret();
    try {
      await fetch(`http://${slot.ip}/enable?timeout=${timeoutSec}`, {
        method: 'POST',
        headers: {
          'X-Slot-Secret': secret,
          'Authorization': `Bearer ${secret}`,
        },
        signal: AbortSignal.timeout(3000),
      });
    } catch (err: any) {
      console.warn(`[SATELLITE] Failed unlocking ${slotId} at ${slot.ip}:`, err.message);
    }
    return res.json({ success: true, slotId, coinSlotEnabled: true, isWanOnline: true });
  }

  const ok = await enableCoinSlot(force);
  const coin = resolvePin(activeCoinBcm);
  const inhibit = resolvePin(activeInhibitBcm);
  if (!ok) {
    return res.status(503).json({
      success: false,
      error: 'NO_INTERNET',
      message: 'Internet connection is unavailable. Coinslot temporarily disabled to prevent coin loss.',
      coinSlotEnabled: false,
      isWanOnline: false,
      coinPin: coin.physical,
      inhibitPin: inhibit.physical,
      coinBcm: coin.bcm,
      inhibitBcm: inhibit.bcm,
    });
  }
  res.json({
    success: true,
    coinSlotEnabled: true,
    isWanOnline: true,
    coinPin: coin.physical,
    inhibitPin: inhibit.physical,
    coinBcm: coin.bcm,
    inhibitBcm: inhibit.bcm,
  });
});

// Disable coin slot: inhibit pin goes HIGH
app.post('/api/coins/disable', (req: Request<{}, {}, { slotId?: string }>, res: Response) => {
  const rawSlotId = typeof req.body?.slotId === 'string' ? req.body.slotId.trim() : '';
  const slotId = rawSlotId || undefined;

  if (slotId && slotId !== 'local' && slotId !== 'main') {
    if (satelliteCoinslots.has(slotId)) {
      const slot = satelliteCoinslots.get(slotId)!;
      slot.status = 'ready';
      notifySatelliteDisable(slot);
    }
    return res.json({ success: true, slotId, coinSlotEnabled: false });
  }

  disableCoinSlot('manual');
  res.json({ success: true, coinSlotEnabled: false });
});

// -------------------------------------------------------------
// SATELLITE MULTI-COINSLOT API ENDPOINTS
// -------------------------------------------------------------

// ESP32 registers itself on boot (authenticated via HMAC or shared secret)
app.post('/api/coinslots/register', verifySatelliteAuth, (req: Request, res: Response) => {
  const { slotId, name, ip, mac, rssi } = req.body || {};
  const cleanSlotId = typeof slotId === 'string' ? slotId.trim() : '';
  if (!cleanSlotId || !/^[a-zA-Z0-9_-]{1,64}$/.test(cleanSlotId)) {
    return res.status(400).json({ error: 'INVALID_SLOT_ID', message: 'slotId must be 1-64 alphanumeric/dash/underscore characters' });
  }

  const bodyIp = typeof ip === 'string' ? ip.trim().replace(/^::ffff:/i, '') : '';
  if (bodyIp && !isPrivateLanIpv4(bodyIp)) {
    return res.status(400).json({
      error: 'INVALID_SLOT_IP',
      message: 'slot.ip must be a valid private LAN IPv4 address (10.x, 172.16-31.x, 192.168.x)',
    });
  }

  const socketIp = (req.socket?.remoteAddress || '').replace(/^::ffff:/i, '').trim();
  let resolvedIp = '';
  if (isPrivateLanIpv4(socketIp)) {
    resolvedIp = socketIp;
  } else if (isLoopbackAddress(req.socket?.remoteAddress) && isPrivateLanIpv4(bodyIp)) {
    resolvedIp = bodyIp;
  } else {
    return res.status(400).json({
      error: 'INVALID_SLOT_IP',
      message: 'Satellite must register from or provide a valid private LAN IPv4 address.',
    });
  }

  const slot: SatelliteCoinslot = {
    id: cleanSlotId,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : `Coinslot ${cleanSlotId}`,
    ip: resolvedIp,
    mac: typeof mac === 'string' && mac.trim() ? mac.trim().slice(0, 32) : 'unknown',
    status: 'ready',
    rssi: typeof rssi === 'number' ? rssi : undefined,
    lastHeartbeat: Date.now(),
    pendingCoins: 0,
  };

  satelliteCoinslots.set(cleanSlotId, slot);
  console.log(`[SATELLITE] 🔌 Coinslot registered: ${slot.name} (${cleanSlotId}) @ ${resolvedIp}`);
  telegramBot.notifySlotRegistered(cleanSlotId, slot.name, resolvedIp);

  res.json({
    success: true,
    registered: cleanSlotId,
    ip: resolvedIp,
    serverTime: Math.floor(Date.now() / 1000),
  });
});

// Periodic heartbeat from ESP32 (authenticated via HMAC or shared secret)
app.post('/api/coinslots/heartbeat', verifySatelliteAuth, (req: Request, res: Response) => {
  const { slotId, status, rssi } = req.body || {};
  if (typeof slotId === 'string' && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.lastHeartbeat = Date.now();
    if (status === 'ready' || status === 'unlocked' || status === 'offline') slot.status = status;
    if (typeof rssi === 'number') slot.rssi = rssi;
    return res.json({ success: true, serverTime: Math.floor(Date.now() / 1000) });
  }
  res.status(404).json({ error: 'Slot not found' });
});

// List all active satellite coinslots
app.get('/api/coinslots', (_req: Request, res: Response) => {
  const now = Date.now();
  const list = Array.from(satelliteCoinslots.values()).map(s => ({
    ...s,
    online: (now - s.lastHeartbeat <= 30000),
  }));
  res.json({ slots: list });
});

// ESP32 pushes real-time coin pulses (authenticated via HMAC or shared secret; isolated per slotId)
app.post('/api/coinslots/pulse', verifySatelliteAuth, (req: Request, res: Response) => {
  const { slotId, pulses } = req.body || {};
  const addCount = typeof pulses === 'number' && Number.isFinite(pulses) && pulses > 0 ? Math.floor(pulses) : 1;

  if (typeof slotId === 'string' && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.pendingCoins += addCount;
    slot.lastHeartbeat = Date.now();

    logCoinEvent({
      timestamp: Date.now(),
      type: 'pulse',
      value: addCount,
      rawPulseCount: addCount,
    });

    console.log(`[SATELLITE] ⚡ Pulse from ${slot.name} (${slotId}): +${addCount} (Slot Total: ₱${slot.pendingCoins})`);
    telegramBot.notifyCoinInserted(slot.name, addCount, slot.pendingCoins);

    return res.json({ success: true, slotId, currentSlotCoins: slot.pendingCoins });
  }

  res.status(404).json({ error: 'SLOT_NOT_FOUND', message: 'Satellite slot not registered' });
});

// Test Telegram Bot alert
app.post('/api/telegram/test', async (_req: Request, res: Response) => {
  const ok = await telegramBot.sendNotification('🧪 *OpenPisoWiFi Test Alert*\n\nYour Telegram bot is successfully connected to your Piso-WiFi daemon!');
  if (ok) {
    res.json({ success: true, message: 'Telegram alert sent successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Failed to send alert. Check Telegram Bot Token and Admin Chat ID in Admin Settings.' });
  }
});

// Dynamic Telegram Bot Configuration (No .env editing required!)
app.post('/api/telegram/config', async (req: Request<{}, {}, { token?: string; adminChatId?: string }>, res: Response) => {
  const { token, adminChatId } = req.body;
  telegramBot.updateConfig(token, adminChatId);
  console.log(`[TELEGRAM] ⚙️ Bot configuration updated via API. Token: ${token ? 'provided' : 'none'}, Admin Chat ID: ${adminChatId || 'none'}`);
  res.json({
    success: true,
    message: 'Telegram bot configuration updated',
    status: telegramBot.getStatus(),
  });
});

// Telegram Bot Status
app.get('/api/telegram/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: telegramBot.getStatus(),
  });
});

interface GpioConfigRequestBody {
  coinBcm?: number;
  inhibitBcm?: number;
  buttonBcm?: number;
  coinPin?: number;
  inhibitPin?: number;
  buttonPin?: number;
  inhibitActiveHigh?: boolean;
  gpioBackend?: GpioBackend;
  boardProfile?: string;
  pulseMultiplier?: number;
  serialPort?: string;
}

// Hot-reload GPIO pin config (canonical BCM numbers) and persist to .gpio-config.json
app.post('/api/gpio/config', async (req: Request<{}, {}, GpioConfigRequestBody>, res: Response) => {
  const parseBcmInput = (val: unknown, current: number): number | null => {
    if (val === undefined) return current;
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0 || n > 512) return null;
    return n;
  };

  const nextCoinBcm = parseBcmInput(req.body.coinBcm ?? req.body.coinPin, activeCoinBcm);
  const nextInhibitBcm = parseBcmInput(req.body.inhibitBcm ?? req.body.inhibitPin, activeInhibitBcm);
  const nextButtonBcm = parseBcmInput(req.body.buttonBcm ?? req.body.buttonPin, activeButtonBcm);

  if (nextCoinBcm === null || nextInhibitBcm === null || nextButtonBcm === null) {
    return res.status(400).json({ error: 'INVALID_BCM_PIN', message: 'BCM pin numbers must be integers between 0 and 512.' });
  }

  if (typeof req.body.inhibitActiveHigh === 'boolean') {
    inhibitActiveHigh = req.body.inhibitActiveHigh;
  }

  const nextBackend = req.body.gpioBackend !== undefined
    ? parseBackend(req.body.gpioBackend, activeGpioBackend)
    : activeGpioBackend;

  const nextBoardProfile = typeof req.body.boardProfile === 'string' && req.body.boardProfile.trim()
    ? req.body.boardProfile.trim().slice(0, 64)
    : activeBoardProfile;

  let nextMultiplier = activePulseMultiplier;
  if (req.body.pulseMultiplier !== undefined) {
    const m = Number(req.body.pulseMultiplier);
    if (!Number.isFinite(m) || m < 1 || m > 1000) {
      return res.status(400).json({ error: 'INVALID_PULSE_MULTIPLIER', message: 'pulseMultiplier must be between 1 and 1000.' });
    }
    nextMultiplier = Math.round(m);
  }

  const nextSerialPort = typeof req.body.serialPort === 'string' ? req.body.serialPort.trim() : activeSerialPort;

  const coin = resolvePin(nextCoinBcm);
  const inhibit = resolvePin(nextInhibitBcm);
  const button = resolvePin(nextButtonBcm);

  activeBoardProfile = nextBoardProfile;
  activePulseMultiplier = nextMultiplier;

  savePersistedGpioConfig({
    coinBcm: coin.bcm,
    inhibitBcm: inhibit.bcm,
    buttonBcm: button.bcm,
    inhibitActiveHigh,
    gpioBackend: nextBackend,
    boardProfile: activeBoardProfile,
    pulseMultiplier: activePulseMultiplier,
    serialPort: nextSerialPort,
  });

  console.log(
    `[GPIO] Hot-reload requested: Coin BCM ${coin.bcm} (Pin ${coin.physical}), Inhibit BCM ${inhibit.bcm} (Pin ${inhibit.physical}), Button BCM ${button.bcm} (Pin ${button.physical}), activeHigh=${inhibitActiveHigh}, backend=${nextBackend}, profile=${activeBoardProfile}, multiplier=${activePulseMultiplier}`
  );
  await initGpio(coin.bcm, inhibit.bcm, button.bcm, nextBackend, nextSerialPort);
  setInhibitPin(!coinSlotEnabled);
  res.json({
    success: true,
    coinPin: coin.physical,
    inhibitPin: inhibit.physical,
    buttonPin: button.physical,
    coinBcm: coin.bcm,
    inhibitBcm: inhibit.bcm,
    buttonBcm: button.bcm,
    inhibitActiveHigh,
    gpioBackend: activeGpioBackend,
    boardProfile: activeBoardProfile,
    pulseMultiplier: activePulseMultiplier,
    serialPort: activeSerialPort,
  });
});

// Hardware debug endpoint: returns event log, current state, denomination stats
app.get('/api/hardware/debug', (_req: Request, res: Response) => {
  const VALID_DENOMS = [1, 5, 10, 20];
  const stats: Record<string, { expected: number; detected: number[]; match: boolean | null }> = {};
  for (const denom of VALID_DENOMS) {
    const key = String(denom);
    const detected = denominationStats[key] || [];
    stats[key] = {
      expected: denom,
      detected,
      match: detected.length === 0 ? null : detected.every((d) => d === denom),
    };
  }

  const coin = resolvePin(activeCoinBcm);
  const inhibit = resolvePin(activeInhibitBcm);
  const button = resolvePin(activeButtonBcm);

  res.json({
    events: [...coinEventLog],
    currentState: {
      coinSlotEnabled,
      pendingCoins,
      coinPin: coin.physical,
      inhibitPin: inhibit.physical,
      buttonPin: button.physical,
      coinBcm: coin.bcm,
      inhibitBcm: inhibit.bcm,
      buttonBcm: button.bcm,
      inhibitActiveHigh,
      gpioBackend: activeGpioBackend,
      boardProfile: activeBoardProfile,
      pulseMultiplier: activePulseMultiplier,
      serialPort: activeSerialPort,
      gpioAvailable: isHardwareGpioAvailable,
      lastGpioError,
      timeoutSeconds: coinSlotTimeoutSeconds,
    },
    denominationStats: stats,
  });
});

// -------------------------------------------------------------
// OPENPISO SHIELD WIDS & SECURITY ENDPOINTS
// -------------------------------------------------------------

// OpenWrt WIDS daemon (or local detector) reports deauth storms / evil twins
app.post('/api/shield/wids-event', verifyShieldAuth, (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const rawType = typeof body.type === 'string' ? body.type.trim() : '';
  if (!rawType) {
    return res.status(400).json({ error: 'INVALID_WIDS_EVENT', message: 'Event "type" is required.' });
  }

  const type = rawType.slice(0, 64);
  const rawSeverity = body.severity;
  const severity: 'high' | 'medium' | 'low' =
    rawSeverity === 'high' || rawSeverity === 'medium' || rawSeverity === 'low'
      ? rawSeverity
      : type === 'deauth_storm' || type === 'evil_twin' || type === 'coin_tamper'
        ? 'high'
        : 'medium';

  const band = typeof body.band === 'string' ? body.band.trim().slice(0, 32) : undefined;
  const ssid = typeof body.ssid === 'string' ? body.ssid.trim().slice(0, 64) : undefined;
  const bssid = typeof body.bssid === 'string' ? body.bssid.trim().slice(0, 32) : undefined;
  const mac = typeof body.mac === 'string' ? body.mac.trim().slice(0, 32) : undefined;
  const count = typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : undefined;
  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 280)
      : `WIDS detected ${type}${band ? ` on ${band}` : ''}${ssid ? ` (${ssid})` : ''}`;

  const alert = recordShieldAlert({ type, severity, band, ssid, bssid, mac, count, message });

  if (type === 'deauth_storm' || body.engageStormShield === true) {
    engageStormShield(90, message);
  }

  void telegramBot.notifySecurityAlert(type, severity, {
    message,
    band,
    ssid,
    bssid,
    mac,
    count,
  });

  const stormRemaining = Math.max(0, Math.ceil((stormShieldUntil - Date.now()) / 1000));
  res.json({
    success: true,
    stormShieldActive: Date.now() < stormShieldUntil,
    stormShieldRemainingSec: stormRemaining,
    alert,
  });
});

// Live OpenPiso Shield status for Portal Admin Dashboard
app.get('/api/shield/status', async (_req: Request, res: Response) => {
  let routerCapabilities = {
    oweSupported: false,
    widsRunning: false,
    clientIsolation: false,
    antiTethering: false,
  } as Awaited<ReturnType<RouterController['getShieldCapabilities']>>;

  try {
    routerCapabilities = await router.getShieldCapabilities();
  } catch {}

  const now = Date.now();
  const stormShieldActive = now < stormShieldUntil;
  const stormShieldRemainingSec = stormShieldActive ? Math.ceil((stormShieldUntil - now) / 1000) : 0;

  res.json({
    stormShieldActive,
    stormShieldRemainingSec,
    alerts: getShieldAlerts(),
    counts: getShieldCounts(),
    routerCapabilities,
  });
});

// Apply OpenPiso Shield configuration (or channel hop action)
app.post('/api/shield/config', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as ShieldApplyConfig & {
      action?: string;
      shield_storm_shield_enabled?: boolean | string;
      stormShieldEnabled?: boolean | string;
    };

    if (body.action === 'channel_hop_2g') {
      const hopRes = await router.hopChannel2g();
      if (!hopRes.success) {
        return res.status(500).json(hopRes);
      }
      return res.json(hopRes);
    }

    const stormSetting = body.stormShieldEnabled ?? body.shield_storm_shield_enabled;
    if (stormSetting !== undefined) {
      stormShieldEnabled = stormSetting === true || stormSetting === 'true' || stormSetting === '1';
      if (!stormShieldEnabled) {
        stormShieldUntil = 0;
      }
    }

    const result = await router.applyShieldConfig(body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to apply Shield config' });
  }
});

// Channel hop 2.4GHz endpoint (canonical + alias)
app.post('/api/shield/channel-hop', async (_req: Request, res: Response) => {
  try {
    const result = await router.hopChannel2g();
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Channel hop failed' });
  }
});

app.post('/api/shield/hop-channel', async (_req: Request, res: Response) => {
  try {
    const result = await router.hopChannel2g();
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Channel hop failed' });
  }
});

// Clear Shield security alert history
app.post('/api/shield/clear-alerts', (req: Request, res: Response) => {
  shieldAlerts.length = 0;
  if (req.body?.resetStormShield === true) {
    stormShieldUntil = 0;
  }
  res.json({ success: true, cleared: true });
});

// Trigger or clear Storm Shield freeze window (called by Portal mass-disconnect detector or Admin)
app.post('/api/shield/storm-trigger', (req: Request, res: Response) => {
  const { durationSeconds = 90, reason, active } = (req.body || {}) as {
    durationSeconds?: number;
    reason?: string;
    active?: boolean;
  };

  if (active === false) {
    stormShieldUntil = 0;
    return res.json({ success: true, stormShieldActive: false, stormShieldRemainingSec: 0 });
  }

  const msg = typeof reason === 'string' && reason.trim()
    ? reason.trim().slice(0, 280)
    : 'Mass Wi-Fi client disconnection triggered Storm Shield auto-pause freeze';

  const remaining = engageStormShield(typeof durationSeconds === 'number' ? durationSeconds : 90, msg);
  recordShieldAlert({
    type: 'deauth_storm',
    severity: 'high',
    message: msg,
  });
  void telegramBot.notifySecurityAlert('deauth_storm', 'high', { message: msg, durationSeconds: remaining });

  res.json({
    success: true,
    stormShieldActive: Date.now() < stormShieldUntil,
    stormShieldRemainingSec: remaining,
  });
});


// -------------------------------------------------------------
// OPENWRT ROUTER & FIREWALL AUTHORIZATION ENDPOINTS
// -------------------------------------------------------------

// Authorize a client MAC address on OpenWrt
app.post('/api/authorize', async (req: Request<{}, {}, AuthorizeRequestBody>, res: Response) => {
  const { mac, durationMinutes, ip, amount, slotId, type, isNewSession, notify, deviceName, notes } = req.body;

  if (!mac || typeof durationMinutes !== 'number') {
    return res.status(400).json({ error: 'Invalid request body. "mac" and "durationMinutes" are required.' });
  }

  // Safety Gate: If this is a whitelisted / unlimited VIP MAC (e.g. 1 year / 525,600m duration or marked WHITELIST),
  // add to permanent OpenWrt whitelist, notify as VIP, and NEVER process as a coin sale!
  if (type === 'WHITELIST' || durationMinutes >= 500000) {
    const wlResult = await router.addWhitelist(mac, ip);
    if (!wlResult.success) {
      return res.status(500).json({ error: wlResult.error || 'Failed to whitelist MAC on router' });
    }
    if (notify !== false) {
      telegramBot.notifyVipConnected(mac, deviceName, notes);
    }
    return res.json({ success: true, mac, status: 'WHITELISTED', isVip: true });
  }

  const result = await router.authorize(mac, durationMinutes, ip);

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to authorize MAC on router' });
  }

  // Only record sales, cashbox, and transactions if this is a genuine new/paid session
  // (Prevents captive portal probes, session polls, auto-resumes, and firewall refreshes from creating phantom transactions or spamming Telegram)
  const isPaidTransaction = isNewSession === true || (typeof amount === 'number' && amount > 0);
  const txAmount = typeof amount === 'number' ? amount : 0;

  if (isPaidTransaction && txAmount > 0) {
    checkDayRollover();
    todaySalesTotal += txAmount;
    todayTxCount += 1;
    cashBoxAmount += txAmount;
  }

  const slotObj = slotId ? satelliteCoinslots.get(slotId) : undefined;
  const slotName = slotObj ? slotObj.name : 'Main Coinslot';

  // Instant notification to Telegram admin only for new sessions or explicit paid amounts
  if (notify !== false && (isNewSession === true || (typeof amount === 'number' && amount > 0))) {
    telegramBot.notifySessionAuthorized(slotName, txAmount, durationMinutes, mac);
  }

  // Sync to Supabase PostgreSQL cloud database only for genuine new transactions
  if (isPaidTransaction) {
    const normalizedTxType: 'COIN' | 'VOUCHER' | 'FREE_TRIAL' =
      type === 'VOUCHER' || type === 'FREE_TRIAL' ? type : 'COIN';
    supabaseSync.recordTransaction({
      slotId: slotId || 'main',
      slotName,
      amount: txAmount,
      durationMinutes,
      macAddress: mac,
      type: normalizedTxType,
    }).catch(() => {});
  }

  res.json({ success: true, mac, expires_in: durationMinutes, recordedAmount: txAmount });
});

// Deauthorize a client MAC address on OpenWrt
app.post('/api/deauthorize', async (req: Request<{}, {}, DeauthorizeRequestBody>, res: Response) => {
  const { mac, kickStation } = req.body;

  if (!mac) {
    return res.status(400).json({ error: 'Invalid request body. "mac" is required.' });
  }

  const result = await router.deauthorize(mac, { kickStation });

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to deauthorize MAC on router' });
  }

  res.json({ success: true, mac, message: 'Client deauthorized from router' });
});

// Explicitly disconnect / kick an associated Wi-Fi station from OpenWrt
app.post('/api/router/kick', async (req: Request<{}, {}, { mac: string }>, res: Response) => {
  const { mac } = req.body;

  if (!mac) {
    return res.status(400).json({ error: 'Invalid request body. "mac" is required.' });
  }

  const result = await router.kickStation(mac);

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to kick station on router' });
  }

  res.json({ success: true, mac, message: 'Station disconnected from Wi-Fi' });
});

// Get Gateway Hardware Driver & Capabilities (Profile 1 OpenWrt SSH vs Profile 2 Pi Local Gateway)
app.get('/api/gateway/capabilities', (_req: Request, res: Response) => {
  res.json(router.getCapabilities());
});

// Get OpenWrt Router Health & Connection Status
app.get('/api/router/status', async (_req: Request, res: Response) => {
  try {
    const status = await router.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error getting router status' });
  }
});

// Test SSH Connection to OpenWrt Router
app.post('/api/router/test', async (req: Request<{}, {}, TestConnectionRequestBody>, res: Response) => {
  try {
    const testResult = await router.testConnection(req.body);
    res.json(testResult);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Test connection error' });
  }
});

// Update Router Configuration dynamically
app.post('/api/router/config', (req: Request<{}, {}, Partial<RouterConfig>>, res: Response) => {
  try {
    router.updateConfig(req.body);
    res.json({ success: true, config: router.getConfig() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update router config' });
  }
});

// Lookup Client MAC from IP using OpenWrt ARP / DHCP Cache
app.get('/api/router/arp', async (req: Request, res: Response) => {
  const ip = (req.query.ip as string) || '';
  if (!ip) {
    return res.status(400).json({ error: 'Missing "ip" query parameter' });
  }

  try {
    const mac = await router.lookupArp(ip);
    res.json({ ip, mac });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'ARP lookup failed' });
  }
});

// Bulk Synchronize Active Sessions
app.post('/api/router/sync', async (req: Request<{}, {}, { sessions: Array<{ macAddress: string; remainingMinutes: number }> }>, res: Response) => {
  const { sessions } = req.body;
  if (!Array.isArray(sessions)) {
    return res.status(400).json({ error: 'Expected "sessions" array' });
  }

  try {
    await router.syncSessions(sessions);
    res.json({ success: true, syncedCount: sessions.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to sync sessions' });
  }
});

// Get Router Wi-Fi Configuration
app.get('/api/router/wifi', async (_req: Request, res: Response) => {
  try {
    const config = await router.getWifiConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get Wi-Fi config' });
  }
});

// Update Router Wi-Fi Configuration
app.post('/api/router/wifi', async (req: Request, res: Response) => {
  try {
    const result = await router.updateWifiConfig(req.body);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to update Wi-Fi' });
    }
    res.json({ success: true, message: 'Wi-Fi configuration applied successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update Wi-Fi' });
  }
});

// Reboot OpenWrt Router
app.post('/api/router/reboot', async (_req: Request, res: Response) => {
  try {
    const result = await router.rebootRouter();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reboot router' });
  }
});

// Flush OpenWrt Active Auth Table
app.post('/api/router/flush', async (_req: Request, res: Response) => {
  try {
    const result = await router.flushAuthTable();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to flush auth table' });
  }
});

// Device Whitelist Management
app.post('/api/router/whitelist', async (req: Request<{}, {}, { action: 'add' | 'remove'; mac: string; ip?: string; name?: string; notes?: string; notify?: boolean }>, res: Response) => {
  const { action, mac, ip, name, notes, notify } = req.body;
  try {
    const result = action === 'remove' ? await router.removeWhitelist(mac) : await router.addWhitelist(mac, ip);
    if (action === 'add' && notify !== false) {
      telegramBot.notifyVipConnected(mac, name, notes);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Whitelist action failed' });
  }
});

// Device Blacklist Management
app.post('/api/router/blacklist', async (req: Request<{}, {}, { action: 'add' | 'remove'; mac: string }>, res: Response) => {
  const { action, mac } = req.body;
  try {
    const result = action === 'remove' ? await router.removeBlacklist(mac) : await router.addBlacklist(mac);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Blacklist action failed' });
  }
});

// Device Rules Status (OpenWrt nftables elements)
app.get('/api/router/devices/status', async (_req: Request, res: Response) => {
  try {
    const status = await router.getDeviceRulesStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get device rules status' });
  }
});

// Bulk Device Rules Sync
app.post('/api/router/devices/sync', async (req: Request<{}, {}, { whitelist: string[]; blacklist: string[] }>, res: Response) => {
  const { whitelist = [], blacklist = [] } = req.body;
  try {
    await router.syncDeviceRules(whitelist, blacklist);
    res.json({ success: true, whitelistedCount: whitelist.length, blacklistedCount: blacklist.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Device sync failed' });
  }
});

// Router Bandwidth Speed Limiter (QoS) Apply
app.post('/api/router/qos', async (req: Request<{}, {}, { downloadMbps: number; uploadMbps: number }>, res: Response) => {
  const { downloadMbps = 0, uploadMbps = 0 } = req.body;
  try {
    const result = await router.applySpeedLimit(downloadMbps, uploadMbps);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to apply speed limit' });
  }
});

// Router Bandwidth Speed Limiter (QoS) Status Query
app.get('/api/router/qos/status', async (_req: Request, res: Response) => {
  try {
    const status = await router.getQoSStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get QoS status' });
  }
});

// Router Live Telemetry (Uptime, Load, Memory, Wi-Fi Stations Count)
app.get('/api/router/telemetry', async (_req: Request, res: Response) => {
  try {
    const telemetry = await router.getRouterTelemetry();
    res.json(telemetry);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get router telemetry' });
  }
});

// Router Connected Clients Detail List (Wi-Fi Stations + DHCP Leases)
app.get('/api/router/clients', async (_req: Request, res: Response) => {
  try {
    const clients = await router.getConnectedClients();
    res.json({ clients });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get connected clients' });
  }
});

// Get Active DHCP Leases (MAC, IP, Hostname)
app.get('/api/router/dhcp', async (_req: Request, res: Response) => {
  try {
    const leases = await router.getDhcpLeases();
    res.json({ leases });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get DHCP leases' });
  }
});

// Update Portal Domain & DNS resolution on OpenWrt
app.post('/api/router/dns', async (req: Request, res: Response) => {
  try {
    const { domain, portalIp, routerIp } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    const resolvedPortalIp = portalIp || process.env.PORTAL_IP || '192.168.1.240';
    const result = await router.setPortalDns(domain, resolvedPortalIp, routerIp);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update router DNS' });
  }
});

// Run Gigabit WAN Speedtest directly on OpenWrt Router (speedtestcpp)
app.get('/api/router/speedtest', async (_req: Request, res: Response) => {
  try {
    const result = await router.runSpeedtest();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to run router speedtest' });
  }
});

app.post('/api/router/speedtest', async (_req: Request, res: Response) => {
  try {
    const result = await router.runSpeedtest();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to run router speedtest' });
  }
});

// -------------------------------------------------------------
// NATIVE PORT 80 -> 3000 REVERSE PROXY (HIDES :3000 FROM URL)
// -------------------------------------------------------------
const PORTAL_PORT = process.env.PORTAL_PORT || '3000';
const DEFAULT_PORTAL_HOST = process.env.PORTAL_DOMAIN || process.env.PORTAL_IP || 'wifi.local';

export function buildPort80ProxyHeaders(
  incomingHeaders: http.IncomingHttpHeaders,
  hostHeader: string,
  socketRemoteAddress?: string | null,
  daemonSecret: string = process.env.DAEMON_API_SECRET || ''
): http.OutgoingHttpHeaders {
  const remoteIp = (socketRemoteAddress || '').replace(/^::ffff:/i, '').trim() || '127.0.0.1';
  const proxyHeaders: http.OutgoingHttpHeaders = {
    ...incomingHeaders,
    host: hostHeader,
    'x-forwarded-for': remoteIp,
    'x-real-ip': remoteIp,
    'x-forwarded-proto': 'http',
    'x-forwarded-host': hostHeader,
  };
  delete proxyHeaders['x-proxy-auth'];
  if (daemonSecret) {
    proxyHeaders['x-proxy-auth'] = crypto
      .createHmac('sha256', daemonSecret)
      .update(remoteIp)
      .digest('hex');
  }
  return proxyHeaders;
}

const port80Server = http.createServer((req, res) => {
  const hostHeader = req.headers.host || DEFAULT_PORTAL_HOST;
  const cleanHost = (hostHeader.split(':')[0] || '').toLowerCase();
  const configuredPortalIp = (process.env.PORTAL_IP || '192.168.1.240').trim();

  // If 10.0.0.1 is a NAT-masqueraded shortcut alias on a non-10.0.0.1 Pi,
  // redirect cleanly (without :3000) to the Pi's real LAN IP for Layer 2 MAC detection.
  if (cleanHost === '10.0.0.1' && configuredPortalIp !== '10.0.0.1') {
    const destination = `http://${configuredPortalIp}${req.url || '/'}`;
    res.writeHead(302, {
      Location: destination,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end();
    return;
  }

  const proxyHeaders = buildPort80ProxyHeaders(
    req.headers,
    hostHeader,
    req.socket.remoteAddress,
    process.env.DAEMON_API_SECRET || ''
  );

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: parseInt(PORTAL_PORT, 10) || 3000,
      path: req.url || '/',
      method: req.method,
      headers: proxyHeaders,
    },
    (proxyRes) => {
      const responseHeaders: http.IncomingHttpHeaders = { ...proxyRes.headers };
      if (typeof responseHeaders.location === 'string') {
        responseHeaders.location = responseHeaders.location.replace(
          new RegExp(`^(http://[^/]+):${PORTAL_PORT}(/|$)`),
          '$1$2'
        );
      }
      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end(`Portal upstream unavailable: ${err.message}`);
  });

  req.pipe(proxyReq, { end: true });
});

port80Server.on('error', (err: any) => {
  if (err.code === 'EACCES') {
    console.log('[PORT 80 PROXY] Port 80 requires root privileges. Skipping native port 80 listener (dev/non-root mode).');
  } else if (err.code === 'EADDRINUSE') {
    console.log('[PORT 80 PROXY] Port 80 is already in use by another service.');
  } else {
    console.warn('[PORT 80 PROXY] Port 80 notice:', err.message);
  }
});

// -------------------------------------------------------------
// AUTOMATIC WI-FI STATION DISCONNECT & RE-CONNECT SYNC (AUTO-PAUSE)
// -------------------------------------------------------------
const STATION_SYNC_INTERVAL_MS = 15000;
const PORTAL_INTERNAL_SYNC_URL =
  process.env.PORTAL_SYNC_URL || `http://127.0.0.1:${PORTAL_PORT}/api/internal/station-sync`;

let isStationSyncing = false;
async function syncConnectedStationsWithPortal() {
  if (isStationSyncing) return;
  isStationSyncing = true;

  try {
    // Query ONLY live associated Wi-Fi stations (not 24h DHCP leases) so disconnects trigger Auto-Pause
    const scan = await router.getAssociatedWifiMacs();
    if (!scan.ok) {
      return;
    }

    await fetch(PORTAL_INTERNAL_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-daemon-secret': process.env.DAEMON_API_SECRET || '',
      },
      body: JSON.stringify({
        activeMacs: scan.macs,
        scanOk: true,
        stormShieldActive: Date.now() < stormShieldUntil,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Portal might be starting up or temporarily reloading
  } finally {
    isStationSyncing = false;
  }
}

export async function startDaemon(): Promise<void> {
  await initGpio(
    activeCoinBcm,
    activeInhibitBcm,
    activeButtonBcm,
    activeGpioBackend,
    activeSerialPort
  );

  // Background WAN Outage Monitor (runs every 15 seconds)
  setInterval(async () => {
    const online = await checkWanStatus();
    if (!online) {
      consecutiveWanSuccesses = 0;
      consecutiveWanFailures++;

      if (consecutiveWanFailures >= 2 && prevWanStatus !== false) {
        prevWanStatus = false;
        telegramBot.notifyWanStatus(false);
        if (coinSlotEnabled) {
          console.warn('[OUTAGE GUARD] Internet connection is DOWN! Automatically inhibiting coin slot.');
          disableCoinSlot('outage');
        }
      }
    } else {
      consecutiveWanFailures = 0;
      consecutiveWanSuccesses++;

      if (prevWanStatus === false && consecutiveWanSuccesses >= 1) {
        prevWanStatus = true;
        telegramBot.notifyWanStatus(true);
        void supabaseSync.flushOfflineQueue();
      }
    }
  }, 15000);

  app.listen(PORT, BIND_HOST, () => {
    console.log(
      `Hardware Daemon running on http://${BIND_HOST}:${PORT} [GPIO Available: ${isHardwareGpioAvailable}] [Backend: ${activeGpioBackend}] [Router: ${router.getConfig().host}]`
    );

    telegramBot.setStatsProvider({
      getTodaySales: () => {
        checkDayRollover();
        return { totalAmount: todaySalesTotal, transactionCount: todayTxCount };
      },
      getCashBoxAmount: () => cashBoxAmount,
      resetCashBox: () => {
        const collected = cashBoxAmount;
        cashBoxAmount = 0;
        void supabaseSync.recordCashCollection(collected);
        return collected;
      },
      getSlotsStatus: () => {
        const now = Date.now();
        return Array.from(satelliteCoinslots.values()).map((s) => ({
          id: s.id,
          name: s.name,
          ip: s.ip,
          status: now - s.lastHeartbeat > 30000 ? 'offline' : s.status,
          rssi: s.rssi,
        }));
      },
      isWanOnline: () => isWanOnline,
      getShieldStatus: () => {
        const now = Date.now();
        const active = now < stormShieldUntil;
        return {
          stormShieldActive: active,
          stormShieldRemainingSec: active ? Math.ceil((stormShieldUntil - now) / 1000) : 0,
          counts: getShieldCounts(),
          recentAlerts: getShieldAlerts().slice(0, 5),
        };
      },
    });
    telegramBot.start({ isBoot: true });

    // Bootstrap fallback: pull saved Telegram credentials from local Portal once ready
    if (!telegramBot.getStatus().configured) {
      const portalPort = process.env.PORTAL_PORT || '3000';
      const bootstrapTelegramFromPortal = async (attempt = 1) => {
        if (telegramBot.getStatus().configured) return;
        try {
          const res = await fetch(`http://127.0.0.1:${portalPort}/api/telegram/config`, {
            headers: {
              'Cache-Control': 'no-store',
              'x-daemon-secret': process.env.DAEMON_API_SECRET || '',
            },
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const data = (await res.json()) as { token?: string; adminChatId?: string };
            if (data.token && data.adminChatId) {
              console.log('[TELEGRAM] 🔄 Loaded saved Telegram credentials from Portal database on boot.');
              telegramBot.updateConfig(data.token, data.adminChatId, { isBoot: true });
              return;
            }
          }
        } catch {
          // Portal may still be starting up right after boot
        }
        if (attempt < 15 && !telegramBot.getStatus().configured) {
          setTimeout(() => bootstrapTelegramFromPortal(attempt + 1), 3000);
        }
      };
      setTimeout(() => bootstrapTelegramFromPortal(1), 2000);
    }

    setInterval(() => {
      if (supabaseSync.enabled) {
        void supabaseSync.syncHeartbeat({
          uptimeSeconds: Math.floor(process.uptime()),
          activeSlots: satelliteCoinslots.size + (isHardwareGpioAvailable ? 1 : 0),
          isWanOnline,
          currentCashBox: cashBoxAmount,
          todayTotal: todaySalesTotal,
        });
      }
    }, 60000);

    supabaseSync.setCommandHandler(async (commandType: string, payload: any) => {
      switch (commandType) {
        case 'kick_session': {
          if (!payload.mac) return { success: false, error: 'MAC address required' };
          const res = await router.kickStation(payload.mac);
          return { success: res.success, error: res.error };
        }
        case 'add_time': {
          if (!payload.mac || typeof payload.durationMinutes !== 'number') {
            return { success: false, error: 'mac and durationMinutes required' };
          }
          const res = await router.authorize(payload.mac, payload.durationMinutes, payload.ip);
          return { success: res.success, error: res.error };
        }
        case 'unlock_slot': {
          const ok = await enableCoinSlot(true);
          return { success: ok };
        }
        case 'lock_slot': {
          disableCoinSlot('manual');
          return { success: true };
        }
        case 'reboot_router': {
          const res = await router.rebootRouter();
          return { success: res.success, error: res.success ? undefined : res.message };
        }
        default:
          return { success: false, error: `Unsupported command type: ${commandType}` };
      }
    });

    setInterval(() => {
      if (supabaseSync.enabled) {
        void supabaseSync.pollAndExecuteCommands();
      }
    }, 10000);
  });

  try {
    port80Server.listen(80, '0.0.0.0', () => {
      console.log(`[PORT 80 PROXY] Native HTTP Port 80 -> 127.0.0.1:${PORTAL_PORT} reverse proxy active.`);
    });
  } catch (err: any) {
    console.warn('[PORT 80 PROXY] Could not start port 80 listener:', err.message);
  }

  // Start station auto-pause polling 5 seconds after daemon startup
  setTimeout(() => {
    void syncConnectedStationsWithPortal();
    setInterval(() => {
      void syncConnectedStationsWithPortal();
    }, STATION_SYNC_INTERVAL_MS);
    console.log(
      `[AUTO-PAUSE SYNC] Background Wi-Fi station heartbeat active (interval: ${
        STATION_SYNC_INTERVAL_MS / 1000
      }s -> ${PORTAL_INTERNAL_SYNC_URL})`
    );
  }, 5000);
}

function isRunningAsMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(path.resolve(__filename));
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(__filename);
  }
}

if (isRunningAsMainModule() && process.env.DAEMON_TEST_MODE !== '1') {
  void startDaemon();
}