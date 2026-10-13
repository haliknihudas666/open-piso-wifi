'use client';

import React, { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import {
  Activity,
  Cpu,
  Download,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Pause,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const VALID_DENOMS = [1, 5, 10, 20];

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-PH', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

interface CoinEvent {
  timestamp: number;
  type: 'pulse' | 'coin_detected' | 'slot_enabled' | 'slot_disabled' | 'inhibit_timeout' | 'error';
  value?: number;
  bcmPin?: number;
  rawPulseCount?: number;
  trainMs?: number;
  breakdown?: number[];
}

interface DenomStat {
  expected: number;
  detected: number[];
  match: boolean | null;
}

export function CoinDebugger() {
  const [paused, setPaused] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [denomStats, setDenomStats] = useState<Record<string, DenomStat>>({});
  const logRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR(
    paused ? null : '/api/admin/hardware/coin-debug',
    fetcher,
    { refreshInterval: 500, revalidateOnFocus: true }
  );

  // Auto-scroll log
  useEffect(() => {
    if (!paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [data, paused]);

  // Merge denomination stats (accumulate across polls)
  useEffect(() => {
    if (data?.denominationStats) {
      setDenomStats(data.denominationStats);
    }
  }, [data]);

  const state = data?.currentState;
  const events: CoinEvent[] = data?.events ?? [];

  async function handleEnable() {
    setIsEnabling(true);
    try {
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', force: true }),
      });
      await mutate();
    } finally {
      setIsEnabling(false);
    }
  }

  async function handleDisable() {
    setIsDisabling(true);
    try {
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', force: true }),
      });
      await mutate();
    } finally {
      setIsDisabling(false);
    }
  }

  async function handleClear() {
    setIsClearing(true);
    try {
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      await mutate();
    } finally {
      setIsClearing(false);
    }
  }

  function handleDownload() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coin-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleResetDenoms() {
    setDenomStats({});
  }

  function getEventRowStyle(event: CoinEvent): string {
    switch (event.type) {
      case 'coin_detected':
        return VALID_DENOMS.includes(event.value ?? -1)
          ? 'bg-emerald-500/5 border-l-2 border-emerald-500/50'
          : 'bg-amber-500/5 border-l-2 border-amber-500/50';
      case 'slot_enabled': return 'bg-purple-500/5 border-l-2 border-purple-500/50';
      case 'slot_disabled':
      case 'inhibit_timeout': return 'bg-neutral-800/50 border-l-2 border-neutral-600/50';
      case 'error': return 'bg-rose-500/5 border-l-2 border-rose-500/50';
      default: return 'border-l-2 border-transparent';
    }
  }

  function getEventLabel(event: CoinEvent): React.ReactNode {
    switch (event.type) {
      case 'pulse':
        return (
          <span className="text-neutral-300">
            PULSE <span className="font-mono text-[#67e8f9]">BCM {event.bcmPin}</span>
            <span className="text-emerald-400 font-bold ml-2">(+₱1 pulse credited)</span>
          </span>
        );
      case 'coin_detected': {
        const valid = VALID_DENOMS.includes(event.value ?? -1);
        const hasBreakdown = event.breakdown && event.breakdown.length > 1;
        const breakdownStr = hasBreakdown
          ? event.breakdown!.map((c) => `₱${c}`).join(' + ')
          : null;

        return (
          <span className={valid ? 'text-emerald-300' : 'text-cyan-300'}>
            COIN TRAIN{' '}
            <span className="font-bold">₱{event.value}</span>
            {breakdownStr && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-mono text-xs font-semibold border border-cyan-800/80">
                {breakdownStr}
              </span>
            )}
            <span className="font-mono text-neutral-400 ml-2">BCM {event.bcmPin}</span>
            <span className="text-neutral-400 ml-2">
              {event.rawPulseCount} pulses · {event.trainMs}ms
            </span>
            {valid ? (
              <span className="ml-2 text-emerald-400 font-bold">✅ ₱{event.value} coin</span>
            ) : (
              <span className="ml-2 text-cyan-400 font-bold">
                ⚡ {event.breakdown ? `${event.breakdown.length} coins detected in burst` : 'rapid multi-coin batch'}
              </span>
            )}
          </span>
        );
      }
      case 'slot_enabled':
        return <span className="text-purple-300 font-semibold">SLOT ENABLED — inhibit BCM {event.bcmPin} → LOW</span>;
      case 'slot_disabled':
        return <span className="text-neutral-400 font-semibold">SLOT DISABLED — inhibit BCM {event.bcmPin} → HIGH</span>;
      case 'inhibit_timeout':
        return <span className="text-amber-400 font-semibold">AUTO-INHIBIT TIMEOUT — slot blocked</span>;
      case 'error':
        return <span className="text-rose-400 font-semibold">GPIO ERROR on BCM {event.bcmPin}</span>;
      default:
        return <span className="text-neutral-400">{event.type}</span>;
    }
  }

  return (
    <div className="space-y-5">
      {/* Status Panel */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <CardTitle>Hardware GPIO Status</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Raspberry Pi physical header & CL-168 coin acceptor connection
              </p>
            </div>
          </div>
          <div>
            {state?.gpioAvailable ? (
              <Badge variant="success">GPIO Active</Badge>
            ) : (
              <Badge variant="warning">Simulation Mode</Badge>
            )}
          </div>
        </CardHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">Coin Pin</div>
            <div className="font-black text-black dark:text-[#ffe17c] text-base font-display">BCM {state?.coinBcm ?? '—'}</div>
            <div className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-400">Pin {state?.coinBcm != null ? (BCM_TO_PHYSICAL[state.coinBcm] ?? '?') : '—'}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">Inhibit Pin</div>
            <div className="font-black text-black dark:text-[#ffe17c] text-base font-display">BCM {state?.inhibitBcm ?? '—'}</div>
            <div className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-400">Pin {state?.inhibitBcm != null ? (BCM_TO_PHYSICAL[state.inhibitBcm] ?? '?') : '—'}</div>
            <div className="mt-1 text-[9px] font-black uppercase text-purple-600 dark:text-purple-400 leading-tight">
              {state?.inhibitActiveHigh ? 'Default HIGH (Built-in)' : 'Default LOW (Relay)'}
            </div>
            <div className="text-[9px] font-mono font-bold text-neutral-700 dark:text-neutral-300">
              {state?.coinSlotEnabled
                ? (state?.inhibitActiveHigh ? 'Level: 0V' : 'Level: 3.3V')
                : (state?.inhibitActiveHigh ? 'Level: 3.3V' : 'Level: 0V')}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">Slot State</div>
            <div className="mt-0.5">
              <Badge variant={state?.coinSlotEnabled ? 'success' : 'danger'}>
                {state?.coinSlotEnabled ? 'ENABLED' : 'INHIBITED'}
              </Badge>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">Pending</div>
            <div className="font-black text-black dark:text-[#ffe17c] text-base font-display">₱{state?.pendingCoins ?? 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">Timeout</div>
            <div className="font-black text-black dark:text-[#ffe17c] text-base font-display">{state?.timeoutSeconds ?? 60}s</div>
          </div>
        </div>

        {state?.lastGpioError && (
          <div className="mt-3.5 p-3.5 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm text-xs font-semibold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-black shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-sm">Hardware GPIO Alert</div>
              <div className="font-mono text-[11px] mt-0.5 font-bold">{state.lastGpioError}</div>
              <div className="text-[11px] mt-1 font-semibold text-neutral-800">
                Note: Physical Pin 3 (BCM 2) and Pin 5 (BCM 3) are I2C bus pins. If locked with EBUSY, move your wires to Pin 7 (BCM 4) for Coin and Pin 11 (BCM 17) for Inhibit, then update in Settings.
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleEnable}
            isLoading={isEnabling}
            disabled={state?.coinSlotEnabled}
            className="gap-1.5"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Enable Slot</span>
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleDisable}
            isLoading={isDisabling}
            disabled={!state?.coinSlotEnabled}
            className="gap-1.5"
          >
            <PowerOff className="w-3.5 h-3.5" />
            <span>Inhibit Slot</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClear}
            isLoading={isClearing}
            className="gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear ₱0</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </Card>

      {/* Denomination Test Results */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#4ade80] text-black border-2 border-black shadow-neo-sm">
              <Zap className="w-5 h-5 fill-black text-black" />
            </div>
            <div>
              <CardTitle>Denomination Detection Accuracy</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Pulse validation for CL-168 coin comparator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetDenoms}
            className="text-xs font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#111713] text-black dark:text-white shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Counters</span>
          </button>
        </CardHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {VALID_DENOMS.map((denom) => {
            const stat = denomStats[String(denom)];
            const count = stat?.detected?.length ?? 0;
            const allMatch = stat?.match;
            return (
              <div
                key={denom}
                className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center space-y-1.5"
              >
                <div className="text-base font-black font-display text-black dark:text-[#ffe17c]">₱{denom}</div>
                <div className="text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                  Expected: {denom} pulses
                </div>
                <div className="pt-1">
                  {count === 0 ? (
                    <Badge variant="outline" className="text-[10px]">Not tested</Badge>
                  ) : allMatch ? (
                    <Badge variant="success" className="text-[10px]">✅ {count} passed</Badge>
                  ) : (
                    <Badge variant="danger" className="text-[10px]">⚠️ {count} mismatches</Badge>
                  )}
                </div>
                {count > 0 && (
                  <div className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-400">
                    Last: {stat?.detected[stat.detected.length - 1]} pulses
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3.5 p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-xs font-mono text-black dark:text-white space-y-1">
          <div className="flex items-center gap-1.5 font-bold font-sans text-sm mb-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>CL-168 Wiring Reference (Physical & BCM Pinout)</span>
          </div>
          <div className="space-y-1 font-bold text-[11px]">
            <div><span className="font-extrabold text-red-600 dark:text-red-400">RED</span> → +12V / +5V Power supply</div>
            <div><span className="font-extrabold text-neutral-600 dark:text-neutral-400">BLACK</span> → GND Common Ground</div>
            <div><span className="font-extrabold text-amber-600 dark:text-[#ffe17c]">YELLOW/WHITE</span> → 10kΩ → BCM {state?.coinBcm ?? 4} (Physical Pin {state?.coinBcm != null ? (BCM_TO_PHYSICAL[state.coinBcm] ?? '?') : 7}) ✅</div>
            <div><span className="font-extrabold text-blue-600 dark:text-blue-400">BLUE</span> → BCM {state?.inhibitBcm ?? 17} (Physical Pin {state?.inhibitBcm != null ? (BCM_TO_PHYSICAL[state.inhibitBcm] ?? '?') : 11}) [Inhibit]</div>
          </div>
          <div className="mt-2 text-[10px] font-sans font-semibold text-neutral-500 dark:text-neutral-400 border-t border-black/10 dark:border-white/10 pt-1.5">
            Edge: FALLING · Pull-up: Enabled · Debounce: 0ms (software 300ms pulse-train window) · HIGH = Blocked
          </div>
        </div>
      </Card>

      {/* Live Event Log */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7dd3fc] text-black border-2 border-black shadow-neo-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <CardTitle>Live Pulse Event Log</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Captured {events.length} pulse events
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={paused ? 'primary' : 'outline'}
              onClick={() => setPaused((v) => !v)}
              className="gap-1 text-xs"
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{paused ? 'Resume' : 'Pause'}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDownload}
              className="gap-1 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </Button>
          </div>
        </CardHeader>

        <div
          ref={logRef}
          className="h-72 overflow-y-auto rounded-xl border-2 border-black dark:border-[#4a6052] bg-black text-[#4ade80] font-mono text-[11px] p-2 space-y-0.5 shadow-neo-sm"
        >
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-500">
              <div className="text-center font-sans font-bold">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>No pulse events recorded yet. Enable the coin slot and drop a coin.</p>
              </div>
            </div>
          ) : (
            events.map((event, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-2.5 py-1 rounded bg-neutral-900/60 hover:bg-neutral-800 transition-colors"
              >
                <span className="text-neutral-500 shrink-0 tabular-nums">[{formatTs(event.timestamp)}]</span>
                <span className="flex-1">{getEventLabel(event)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// BCM → Physical lookup used in this component
const BCM_TO_PHYSICAL: Record<number, number> = {
  0: 27, 1: 28, 2: 3, 3: 5, 4: 7, 5: 29, 6: 31, 7: 26,
  8: 24, 9: 21, 10: 19, 11: 23, 12: 32, 13: 33, 14: 8, 15: 10,
  16: 36, 17: 11, 18: 12, 19: 35, 20: 38, 21: 40, 22: 15, 23: 16,
  24: 18, 25: 22, 26: 37, 27: 13,
};
