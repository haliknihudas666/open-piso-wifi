import express, { type Request, type Response } from 'express';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { RouterController, type RouterMode, type RouterConfig } from './services/router-controller.js';
import { TelegramBotService } from './services/telegram-bot.js';
import { SupabaseSyncService } from './services/supabase-sync.js';

interface AuthorizeRequestBody {
  mac: string;
  durationMinutes: number;
  ip?: string;
  amount?: number;
  slotId?: string;
  type?: 'COIN' | 'VOUCHER' | 'FREE_TRIAL';
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

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const BIND_HOST = process.env.DAEMON_HOST || process.env.BIND_HOST || '0.0.0.0';
const SATELLITE_SECRET = process.env.SATELLITE_SECRET || process.env.SLOT_SECRET || 'openpiso-satellite-secret-2024';

/**
 * Middleware to verify that satellite requests (register, heartbeat, pulse)
 * originate from a legitimate ESP32 satellite provisioned with the shared secret.
 */
function verifySatelliteAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers['authorization'];
  const tokenHeader = req.headers['x-slot-secret'];
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : undefined;

  let providedToken: string | undefined;
  if (typeof tokenHeader === 'string') {
    providedToken = tokenHeader;
  } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (querySecret) {
    providedToken = querySecret;
  }

  if (!providedToken || providedToken !== SATELLITE_SECRET) {
    return res.status(401).json({
      error: 'UNAUTHORIZED_SATELLITE',
      message: 'Invalid or missing satellite authentication secret',
    });
  }
  next();
}

app.use(express.json());

let pendingCoins: number = 0;
let isHardwareGpioAvailable = false;
let coinSlotEnabled: boolean = false;    // Default to INHIBITED/BLOCKED on boot to prevent unauthorized coin insertion
let autoDisableTimer: ReturnType<typeof setTimeout> | null = null;

// --- CL-168 Coin Slot Event Log (circular buffer, last 100 events) ---
interface CoinEvent {
  timestamp: number;
  type: 'pulse' | 'coin_detected' | 'slot_enabled' | 'slot_disabled' | 'inhibit_timeout' | 'error' | 'outage' | 'button_pressed';
  value?: number;         // peso value for 'coin_detected'
  bcmPin?: number;
  rawPulseCount?: number; // how many pulses in the completed train
  trainMs?: number;       // duration of the pulse train in ms
  breakdown?: number[];   // constituent coin values e.g. [20, 5]
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

// --- Telegram & Supabase Services ---
export const telegramBot = new TelegramBotService();
export const supabaseSync = new SupabaseSyncService();

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

// --- Raspberry Pi 40-pin Header: Physical Pin <-> BCM GPIO Mapping ---
const PHYSICAL_TO_BCM: Record<number, number> = {
  3: 2,   5: 3,   7: 4,   8: 14,  10: 15, 11: 17, 12: 18, 13: 27,
  15: 22, 16: 23, 18: 24, 19: 10, 21: 9,  22: 25, 23: 11, 24: 8,
  26: 7,  29: 5,  31: 6,  32: 12, 33: 13, 35: 19, 36: 16, 37: 26,
  38: 20, 40: 21
};
const BCM_TO_PHYSICAL: Record<number, number> = Object.fromEntries(
  Object.entries(PHYSICAL_TO_BCM).map(([phys, bcm]) => [bcm, Number(phys)])
);

function resolvePin(val: number): { bcm: number; physical: number } {
  if (PHYSICAL_TO_BCM[val]) return { bcm: PHYSICAL_TO_BCM[val], physical: val };
  if (BCM_TO_PHYSICAL[val]) return { bcm: val, physical: BCM_TO_PHYSICAL[val] };
  return { bcm: val, physical: val };
}

// --- GPIO pin references (Physical Pin 7 for Coin, Physical Pin 11 for Inhibit, Physical Pin 5 for Button) ---
const initialCoin = resolvePin(process.env.COIN_GPIO_PIN ? parseInt(process.env.COIN_GPIO_PIN, 10) : 7);
const initialInhibit = resolvePin(process.env.INHIBIT_GPIO_PIN ? parseInt(process.env.INHIBIT_GPIO_PIN, 10) : 11);
const initialButton = resolvePin(process.env.BUTTON_GPIO_PIN ? parseInt(process.env.BUTTON_GPIO_PIN, 10) : 5);
let activeCoinBcm = initialCoin.bcm;
let activeInhibitBcm = initialInhibit.bcm;
let activeButtonBcm = initialButton.bcm;
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
  enableCoinSlot();
}

// Background WAN Outage Monitor (runs every 15 seconds)
let prevWanStatus = true;
setInterval(async () => {
  const online = await checkWanStatus();
  if (online !== prevWanStatus) {
    prevWanStatus = online;
    telegramBot.notifyWanStatus(online);
    if (online) {
      supabaseSync.flushOfflineQueue();
    }
  }
  if (!online && coinSlotEnabled) {
    console.warn('[OUTAGE GUARD] Internet connection is DOWN! Automatically inhibiting coin slot.');
    disableCoinSlot('outage');
  }
}, 15000);

// Initialize the OpenWrt Router Controller (defaults to 192.168.1.1)
const router = new RouterController();

// Inhibit Pin Mode:
// - Default HIGH / Built-in Inhibit (inhibitActiveHigh = true): Idle/Blocked = HIGH (3.3V), Enabled/Accept = LOW (0V).
// - Default LOW / Relay Mode (inhibitActiveHigh = false): Idle/Blocked = LOW (0V), Enabled/Accept = HIGH (3.3V).
let inhibitActiveHigh = process.env.INHIBIT_ACTIVE_HIGH !== 'false';
let lastGpioError: string | null = null;
let bridgeProcess: ChildProcess | null = null;

// Pulse-train collector (shared across Python bridge and onoff)
let trainPulses: number[] = [];
let trainTimer: ReturnType<typeof setTimeout> | null = null;

function handleIncomingPulse(bcmPin: number) {
  const now = Date.now();
  
  // 1. Immediately credit 1 pulse = 1 peso in real-time (no delay!)
  pendingCoins += 1;
  // NOTE: Telegram notification is sent when the coin train settles below to prevent spamming 20 messages for ₱20 coin!

  // 2. Keep the coin slot alive: reset the auto-disable timer on every pulse
  resetAutoDisableTimer();

  // 3. Log real-time pulse event
  logCoinEvent({ timestamp: now, type: 'pulse', bcmPin, value: 1 });
  console.log(`[GPIO] ⚡ PULSE DETECTED on BCM ${bcmPin} -> pendingCoins: ₱${pendingCoins}`);

  // 4. Background train tracking for stats & diagnostics (purely telemetry)
  trainPulses.push(now);

  // Settle window (400ms after last pulse) to record finished coin/train telemetry
  if (trainTimer) clearTimeout(trainTimer);
  trainTimer = setTimeout(() => {
    const pulseCount = trainPulses.length;
    const lastPulse = trainPulses[trainPulses.length - 1] ?? now;
    const firstPulse = trainPulses[0] ?? now;
    const trainMs = trainPulses.length > 1 ? lastPulse - firstPulse : 0;
    trainPulses = [];
    trainTimer = null;

    // Record denomination for calibration stats (1, 5, 10, 20) with breakdown support
    const breakdown = decomposePulseCount(pulseCount);
    recordDenomination(pulseCount);

    const breakdownText = breakdown.length > 1
      ? ` -> breakdown: ${breakdown.map((c) => `₱${c}`).join(' + ')}`
      : '';

    logCoinEvent({
      timestamp: Date.now(),
      type: 'coin_detected',
      value: pulseCount,
      bcmPin,
      rawPulseCount: pulseCount,
      trainMs,
      breakdown,
    });
    console.log(`[HARDWARE] 🪙 Coin train settled: ₱${pulseCount}${breakdownText} (${pulseCount} pulses in ${trainMs}ms). Total pending: ₱${pendingCoins}`);
    
    // Notify Telegram once per settled coin train (e.g., ₱1, ₱5, ₱10, ₱20)
    telegramBot.notifyCoinInserted('Local GPIO Slot', pulseCount, pendingCoins);
  }, 400);
}

/**
 * Sets the inhibit pin state.
 * Works seamlessly via the Python bridge (gpiozero) or direct onoff output.
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
 * Try initializing hardware via Python gpiozero bridge (Official modern standard for Bookworm & Pi 5)
 */
function tryInitPythonBridge(coinBcm: number, inhibitBcm: number): Promise<boolean> {
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
    let scriptPath = scriptCandidates.find((p) => fs.existsSync(p));
    if (!scriptPath) {
      console.log('[GPIO] Python bridge script not found at expected paths.');
      return resolve(false);
    }

    try {
      console.log(`[GPIO] Spawning Python gpiozero bridge: ${scriptPath} ${coinBcm} ${inhibitBcm} ${inhibitActiveHigh}`);
      const proc = spawn('python3', [
        '-u',
        scriptPath,
        String(coinBcm),
        String(inhibitBcm),
        String(inhibitActiveHigh),
      ], { stdio: ['pipe', 'pipe', 'inherit'] });

      let resolved = false;
      let pythonStdoutBuffer = '';

      proc.stdout?.on('data', (data: Buffer) => {
        pythonStdoutBuffer += data.toString();
        const lines = pythonStdoutBuffer.split('\n');
        // Keep any trailing incomplete fragment in the buffer
        pythonStdoutBuffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          if (line === 'PULSE') {
            handleIncomingPulse(coinBcm);
          } else if (line.startsWith('{')) {
            try {
              const msg = JSON.parse(line);
              if (msg.status === 'ready') {
                bridgeProcess = proc;
                console.log(`[GPIO] Python gpiozero bridge connected and ready! (Coin: BCM ${coinBcm}, Inhibit: BCM ${inhibitBcm}, activeHigh: ${inhibitActiveHigh})`);
                setInhibitPin(!coinSlotEnabled);
                if (!resolved) {
                  resolved = true;
                  resolve(true);
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

      // Timeout after 3.5 seconds if python bridge doesn't report ready
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
async function tryInitOnoff(coinBcm: number, inhibitBcm: number): Promise<boolean> {
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

    console.log(`[GPIO] onoff legacy sysfs driver initialized (Coin: BCM ${coinBcm}, Inhibit: BCM ${inhibitBcm})`);
    return true;
  } catch (err: any) {
    console.warn(`[GPIO] onoff driver failed (sysfs deprecated): ${err?.message || err}`);
    return false;
  }
}

/**
 * Initialize (or re-initialize) coin + inhibit GPIO pins.
 * Called on startup and when /api/gpio/config is posted.
 */
async function initGpio(coinBcm: number, inhibitBcm: number) {
  if (process.platform !== 'linux') {
    lastGpioError = `Running on ${process.platform} (Non-Linux): Hardware GPIO disabled, Simulation mode active.`;
    console.log(`[GPIO] ${lastGpioError}`);
    return;
  }

  // 1. Primary: Python gpiozero bridge (Official modern standard for Bookworm & Pi 5)
  const pythonOk = await tryInitPythonBridge(coinBcm, inhibitBcm);
  if (pythonOk) {
    activeCoinBcm = coinBcm;
    activeInhibitBcm = inhibitBcm;
    isHardwareGpioAvailable = true;
    lastGpioError = null;
    return;
  }

  // 2. Secondary: Fallback to onoff for older systems
  const onoffOk = await tryInitOnoff(coinBcm, inhibitBcm);
  if (onoffOk) {
    activeCoinBcm = coinBcm;
    activeInhibitBcm = inhibitBcm;
    isHardwareGpioAvailable = true;
    lastGpioError = null;
    return;
  }

  // Both failed
  activeCoinBcm = coinBcm;
  activeInhibitBcm = inhibitBcm;
  isHardwareGpioAvailable = false;
  if (!lastGpioError) {
    lastGpioError = 'GPIO initialization failed. Install python3-gpiozero python3-lgpio via apt.';
  }
  console.warn(`[GPIO] Hardware GPIO unavailable: ${lastGpioError}`);
}

// Boot initialization
await initGpio(activeCoinBcm, activeInhibitBcm);

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
        if (pkg.name === 'pisowifi-daemon' && pkg.version) {
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
  const slotId = typeof req.query.slotId === 'string' ? req.query.slotId : undefined;
  let pulses = pendingCoins;
  let slotEnabled = coinSlotEnabled;

  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    pulses = slot.pendingCoins;
    slotEnabled = slot.status === 'unlocked';
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
  });
});

// API for Next.js or developer to simulate inserting coins (testing)
app.post('/api/coins/simulate', (req: Request<{}, {}, { amount?: number; pulses?: number; slotId?: string }>, res: Response) => {
  // Security guard: Disable simulator in production environments or when accessed externally
  const isDev = process.env.NODE_ENV !== 'production';
  const simulatorEnabled = process.env.ENABLE_COIN_SIMULATOR === 'true' || isDev;
  const clientIp = req.socket.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

  if (!simulatorEnabled || !isLocalhost) {
    return res.status(403).json({
      error: 'SIMULATOR_DISABLED',
      message: 'Coin simulator is disabled in production and only accessible via localhost.',
    });
  }

  const addPulses = req.body.amount || req.body.pulses || 1;
  const slotId = req.body.slotId;

  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.pendingCoins += addPulses;
    pendingCoins += addPulses;
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

// API for Next.js to clear coins after crediting a session — also re-inhibits the slot
app.post('/api/coins/clear', (req: Request<{}, {}, { slotId?: string }>, res: Response) => {
  const slotId = req.body?.slotId;
  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.pendingCoins = 0;
    slot.status = 'ready';
    fetch(`http://${slot.ip}/disable?secret=${encodeURIComponent(SATELLITE_SECRET)}`, {
      method: 'POST',
      headers: {
        'X-Slot-Secret': SATELLITE_SECRET,
        'Authorization': `Bearer ${SATELLITE_SECRET}`,
      },
      signal: AbortSignal.timeout(2000),
    }).catch(() => {});
    return res.json({ success: true, slotId, pulses: 0, coinSlotEnabled: false });
  }

  pendingCoins = 0;
  disableCoinSlot('manual');
  res.json({ success: true, pulses: 0, coinSlotEnabled: false });
});

// Enable coin slot: inhibit pin goes LOW (if WAN online or force=true)
app.post('/api/coins/enable', async (req: Request<{}, {}, { force?: boolean; slotId?: string; timeoutSeconds?: number }>, res: Response) => {
  const force = req.body?.force === true;
  const slotId = req.body?.slotId;
  const timeoutSec = req.body?.timeoutSeconds || coinSlotTimeoutSeconds;

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
  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.status = 'unlocked';
    try {
      await fetch(`http://${slot.ip}/enable?timeout=${timeoutSec}&secret=${encodeURIComponent(SATELLITE_SECRET)}`, {
        method: 'POST',
        headers: {
          'X-Slot-Secret': SATELLITE_SECRET,
          'Authorization': `Bearer ${SATELLITE_SECRET}`,
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
  const slotId = req.body?.slotId;
  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.status = 'ready';
    fetch(`http://${slot.ip}/disable?secret=${encodeURIComponent(SATELLITE_SECRET)}`, {
      method: 'POST',
      headers: {
        'X-Slot-Secret': SATELLITE_SECRET,
        'Authorization': `Bearer ${SATELLITE_SECRET}`,
      },
      signal: AbortSignal.timeout(2000),
    }).catch(() => {});
    return res.json({ success: true, slotId, coinSlotEnabled: false });
  }

  disableCoinSlot('manual');
  res.json({ success: true, coinSlotEnabled: false });
});

// -------------------------------------------------------------
// SATELLITE MULTI-COINSLOT API ENDPOINTS
// -------------------------------------------------------------

// ESP32 registers itself on boot (authenticated via shared secret)
app.post('/api/coinslots/register', verifySatelliteAuth, (req: Request, res: Response) => {
  const { slotId, name, ip, mac, rssi } = req.body || {};
  if (!slotId || !ip) {
    return res.status(400).json({ error: 'slotId and ip are required' });
  }

  const slot: SatelliteCoinslot = {
    id: slotId,
    name: name || `Coinslot ${slotId}`,
    ip,
    mac: mac || 'unknown',
    status: 'ready',
    rssi: typeof rssi === 'number' ? rssi : undefined,
    lastHeartbeat: Date.now(),
    pendingCoins: 0,
  };

  satelliteCoinslots.set(slotId, slot);
  console.log(`[SATELLITE] 🔌 Coinslot registered: ${slot.name} (${slotId}) @ ${ip}`);
  telegramBot.notifySlotRegistered(slotId, slot.name, ip);

  res.json({ success: true, registered: slotId });
});

// Periodic heartbeat from ESP32 (authenticated via shared secret)
app.post('/api/coinslots/heartbeat', verifySatelliteAuth, (req: Request, res: Response) => {
  const { slotId, status, rssi } = req.body || {};
  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.lastHeartbeat = Date.now();
    if (status) slot.status = status;
    if (typeof rssi === 'number') slot.rssi = rssi;
    return res.json({ success: true });
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

// ESP32 pushes real-time coin pulses (authenticated via shared secret)
app.post('/api/coinslots/pulse', verifySatelliteAuth, (req: Request, res: Response) => {
  const { slotId, pulses } = req.body || {};
  const addCount = typeof pulses === 'number' && pulses > 0 ? pulses : 1;

  if (slotId && satelliteCoinslots.has(slotId)) {
    const slot = satelliteCoinslots.get(slotId)!;
    slot.pendingCoins += addCount;
    slot.lastHeartbeat = Date.now();

    // Mirror to global pending coins
    pendingCoins += addCount;

    logCoinEvent({
      timestamp: Date.now(),
      type: 'pulse',
      value: addCount,
      rawPulseCount: addCount,
    });

    console.log(`[SATELLITE] ⚡ Pulse from ${slot.name} (${slotId}): +${addCount} (Slot Total: ₱${slot.pendingCoins})`);
    telegramBot.notifyCoinInserted(slot.name, addCount, slot.pendingCoins);

    return res.json({ success: true, slotId, currentSlotCoins: slot.pendingCoins, globalCoins: pendingCoins });
  }

  // Fallback if slot not pre-registered
  pendingCoins += addCount;
  logCoinEvent({ timestamp: Date.now(), type: 'pulse', value: addCount, rawPulseCount: addCount });
  telegramBot.notifyCoinInserted(slotId || 'Unknown Slot', addCount, pendingCoins);
  res.json({ success: true, globalCoins: pendingCoins });
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

// Hot-reload GPIO pin config without daemon restart
app.post('/api/gpio/config', async (req: Request<{}, {}, { coinPin?: number; inhibitPin?: number; buttonPin?: number; inhibitActiveHigh?: boolean }>, res: Response) => {
  const coin = resolvePin(req.body.coinPin ?? activeCoinBcm);
  const inhibit = resolvePin(req.body.inhibitPin ?? activeInhibitBcm);
  const button = resolvePin(req.body.buttonPin ?? activeButtonBcm);

  if (typeof req.body.inhibitActiveHigh === 'boolean') {
    inhibitActiveHigh = req.body.inhibitActiveHigh;
  }

  activeButtonBcm = button.bcm;
  console.log(`[GPIO] Hot-reload requested: Coin Pin ${coin.physical} (BCM ${coin.bcm}), Inhibit Pin ${inhibit.physical} (BCM ${inhibit.bcm}), Button Pin ${button.physical} (BCM ${button.bcm}), activeHigh=${inhibitActiveHigh}`);
  await initGpio(coin.bcm, inhibit.bcm);
  setInhibitPin(!coinSlotEnabled);
  res.json({ success: true, coinPin: coin.physical, inhibitPin: inhibit.physical, buttonPin: button.physical, coinBcm: coin.bcm, inhibitBcm: inhibit.bcm, buttonBcm: button.bcm, inhibitActiveHigh });
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

  res.json({
    events: [...coinEventLog],
    currentState: {
      coinSlotEnabled,
      pendingCoins,
      coinPin: coin.physical,
      inhibitPin: inhibit.physical,
      coinBcm: coin.bcm,
      inhibitBcm: inhibit.bcm,
      inhibitActiveHigh,
      gpioAvailable: isHardwareGpioAvailable,
      lastGpioError,
      timeoutSeconds: coinSlotTimeoutSeconds,
    },
    denominationStats: stats,
  });
});


// -------------------------------------------------------------
// OPENWRT ROUTER & FIREWALL AUTHORIZATION ENDPOINTS
// -------------------------------------------------------------

// Authorize a client MAC address on OpenWrt
app.post('/api/authorize', async (req: Request<{}, {}, AuthorizeRequestBody>, res: Response) => {
  const { mac, durationMinutes, ip, amount, slotId, type } = req.body;

  if (!mac || typeof durationMinutes !== 'number') {
    return res.status(400).json({ error: 'Invalid request body. "mac" and "durationMinutes" are required.' });
  }

  const result = await router.authorize(mac, durationMinutes, ip);

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Failed to authorize MAC on router' });
  }

  // Update live sales telemetry & cashbox
  checkDayRollover();
  const txAmount = typeof amount === 'number' ? amount : (durationMinutes > 0 ? Math.ceil(durationMinutes / 10) : 0);
  todaySalesTotal += txAmount;
  todayTxCount += 1;
  cashBoxAmount += txAmount;

  const slotObj = slotId ? satelliteCoinslots.get(slotId) : undefined;
  const slotName = slotObj ? slotObj.name : 'Main Coinslot';

  // Instant notification to Telegram admin
  telegramBot.notifySessionAuthorized(slotName, txAmount, durationMinutes, mac);

  // Sync to Supabase PostgreSQL cloud database
  supabaseSync.recordTransaction({
    slotId: slotId || 'main',
    slotName,
    amount: txAmount,
    durationMinutes,
    macAddress: mac,
    type: type || 'COIN',
  }).catch(() => {});

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
app.post('/api/router/whitelist', async (req: Request<{}, {}, { action: 'add' | 'remove'; mac: string; ip?: string }>, res: Response) => {
  const { action, mac, ip } = req.body;
  try {
    const result = action === 'remove' ? await router.removeWhitelist(mac) : await router.addWhitelist(mac, ip);
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

app.listen(PORT, BIND_HOST, () => {
  console.log(`Hardware Daemon running on http://${BIND_HOST}:${PORT} [GPIO Available: ${isHardwareGpioAvailable}] [Router: ${router.getConfig().host}]`);

  // Initialize Telegram Bot Stats Provider & Start Polling
  telegramBot.setStatsProvider({
    getTodaySales: () => {
      checkDayRollover();
      return { totalAmount: todaySalesTotal, transactionCount: todayTxCount };
    },
    getCashBoxAmount: () => cashBoxAmount,
    resetCashBox: () => {
      const collected = cashBoxAmount;
      cashBoxAmount = 0;
      supabaseSync.recordCashCollection(collected);
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
  });
  telegramBot.start();

  // Periodic Heartbeat Sync to Supabase (every 60s)
  setInterval(() => {
    if (supabaseSync.enabled) {
      supabaseSync.syncHeartbeat({
        uptimeSeconds: Math.floor(process.uptime()),
        activeSlots: satelliteCoinslots.size + (isHardwareGpioAvailable ? 1 : 0),
        isWanOnline,
        currentCashBox: cashBoxAmount,
        todayTotal: todaySalesTotal,
      });
    }
  }, 60000);

  // Register Supabase Cloud Command Bus Executor
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

  // Periodic Command Bus Polling (every 10s)
  setInterval(() => {
    if (supabaseSync.enabled) {
      supabaseSync.pollAndExecuteCommands();
    }
  }, 10000);
});

// -------------------------------------------------------------
// NATIVE PORT 80 -> 3000 HTTP REDIRECT SERVER
// -------------------------------------------------------------
// Since pisowifi-daemon runs as root on Raspberry Pi, listening on port 80 ensures that
// any browser or device opening http://wifi.local or http://10.0.0.1 or http://192.168.1.240
// without port :3000 is immediately redirected to the Next.js captive portal on port 3000.
const PORTAL_PORT = process.env.PORTAL_PORT || '3000';
const DEFAULT_PORTAL_HOST = process.env.PORTAL_DOMAIN || process.env.PORTAL_IP || 'wifi.local';
const port80Server = http.createServer((req, res) => {
  const hostHeader = req.headers.host || DEFAULT_PORTAL_HOST;
  const cleanHost = hostHeader.split(':')[0];
  // If request accessed via 10.0.0.1 shortcut, redirect to the actual portal IP (e.g. 192.168.1.240)
  // so the browser connects directly on LAN without NAT masquerade, preserving real client MAC!
  const targetHost = cleanHost === '10.0.0.1' ? (process.env.PORTAL_IP || '192.168.1.240') : cleanHost;
  const destination = `http://${targetHost}:${PORTAL_PORT}${req.url || '/'}`;

  res.writeHead(302, {
    Location: destination,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end();
});

port80Server.on('error', (err: any) => {
  if (err.code === 'EACCES') {
    console.log('[PORT 80 REDIRECT] Port 80 requires root privileges. Skipping native port 80 listener (dev/non-root mode).');
  } else if (err.code === 'EADDRINUSE') {
    console.log('[PORT 80 REDIRECT] Port 80 is already in use by another service.');
  } else {
    console.warn('[PORT 80 REDIRECT] Port 80 notice:', err.message);
  }
});

try {
  port80Server.listen(80, '0.0.0.0', () => {
    console.log(`[PORT 80 REDIRECT] Native HTTP Port 80 -> :${PORTAL_PORT} redirect server active.`);
  });
} catch (err: any) {
  console.warn('[PORT 80 REDIRECT] Could not start port 80 listener:', err.message);
}

// -------------------------------------------------------------
// AUTOMATIC WI-FI STATION DISCONNECT & RE-CONNECT SYNC (AUTO-PAUSE)
// -------------------------------------------------------------
// Polls OpenWrt router associated stations every 15 seconds and notifies
// Next.js portal to evaluate grace periods and automatically pause/resume sessions.
const STATION_SYNC_INTERVAL_MS = 15000;
const PORTAL_INTERNAL_SYNC_URL =
  process.env.PORTAL_SYNC_URL || `http://127.0.0.1:${PORTAL_PORT}/api/internal/station-sync`;

let isStationSyncing = false;
async function syncConnectedStationsWithPortal() {
  if (isStationSyncing) return;
  isStationSyncing = true;

  try {
    const clients = await router.getConnectedClients();
    const activeMacs = clients.map((c) => c.mac).filter(Boolean);

    await fetch(PORTAL_INTERNAL_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeMacs }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err: any) {
    // Portal might be starting up or temporarily reloading
  } finally {
    isStationSyncing = false;
  }
}

// Start polling 5 seconds after daemon startup
setTimeout(() => {
  syncConnectedStationsWithPortal();
  setInterval(syncConnectedStationsWithPortal, STATION_SYNC_INTERVAL_MS);
  console.log(
    `[AUTO-PAUSE SYNC] Background Wi-Fi station heartbeat active (interval: ${
      STATION_SYNC_INTERVAL_MS / 1000
    }s -> ${PORTAL_INTERNAL_SYNC_URL})`
  );
}, 5000);