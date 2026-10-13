'use client';

import React, { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import {
  Coins,
  Zap,
  ArrowRight,
  AlertCircle,
  Sparkles,
  PlusCircle,
  RotateCcw,
  Wrench,
  Timer,
  WifiOff,
  Lock,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDuration, cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CoinPollerProps {
  onConnectSuccess: (data: any) => void;
  isConnected?: boolean;
  macHint?: string;
  showSimulator?: boolean;
  simulatedState?: 'standby' | 'active' | 'credited';
  simulatedPulses?: number;
}

export function CoinPoller({
  onConnectSuccess,
  isConnected = false,
  macHint,
  showSimulator: propShowSimulator,
  simulatedState,
  simulatedPulses,
}: CoinPollerProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simulatingAmount, setSimulatingAmount] = useState<number | null>(null);

  // Local active session tracker for insertion
  const [isLocallyActive, setIsLocallyActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [abuseLockout, setAbuseLockout] = useState<number | null>(null);
  const [isPulseBumping, setIsPulseBumping] = useState(false);
  const prevPulsesRef = useRef<number>(0);
  const pulseBumpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic high-frequency polling:
  // When inserting coins or slot is active, poll every 200ms for instantaneous pulse counting!
  // When idle, poll every 2500ms to save CPU and bandwidth.
  const { data, mutate } = useSWR('/api/coins', fetcher, {
    refreshInterval: (isLocallyActive || countdown !== null) ? 200 : 2500,
    revalidateOnFocus: true,
  });

  const rawPulses = data?.pulses || 0;
  const rawEstimatedMinutes = data?.estimatedMinutes || 0;
  const minutesPerPeso = data?.minutesPerPeso || 10;
  const daemonOnline = data?.daemonOnline ?? true;
  const coinSlotEnabled = data?.coinSlotEnabled ?? false;
  const isWanOnline = data?.isWanOnline ?? true;
  const isBusy = data?.isBusy ?? false;
  const busyRemainingSeconds = data?.busyRemainingSeconds ?? 0;
  const isHolder = data?.isHolder ?? false;
  const showSimulator = propShowSimulator !== undefined
    ? propShowSimulator
    : Boolean(data?.showCoinSimulator);
  const timeoutSeconds = data?.timeoutSeconds ?? 60;

  // Simulated override for preview mockups
  const isSimActive = simulatedState === 'active';
  const isSimCredited = simulatedState === 'credited';

  const pulses = isSimCredited ? (simulatedPulses ?? 1) : isSimActive ? 0 : rawPulses;
  const estimatedMinutes = isSimCredited
    ? (simulatedPulses ?? 1) * minutesPerPeso
    : isSimActive
    ? 0
    : rawEstimatedMinutes;
  const displayCountdown = isSimCredited ? 14 : isSimActive ? 29 : (countdown ?? timeoutSeconds);

  // Active state is true ONLY if:
  // 1. Simulation mode is active (preview mockups)
  // 2. OR this device is not busy with another customer AND either:
  //    - real coins have already been inserted into the slot (pulses > 0)
  //    - OR the user on THIS device explicitly activated the slot (isLocallyActive)
  const isSlotActive = isSimActive || isSimCredited || (!isBusy && (pulses > 0 || isLocallyActive));

  // Play audio chime on coin pulse (if audio context permitted)
  const playPulseChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      // Fast happy coin blip: 987Hz (B5) sliding to 1318Hz (E6)
      osc.frequency.setValueAtTime(987.77, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio autoplay policy might silently block if unprompted, ignore
    }
  };

  // Abuse lockout countdown timer
  useEffect(() => {
    if (abuseLockout === null || abuseLockout <= 0) return;
    const timer = setInterval(() => {
      setAbuseLockout((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [abuseLockout]);

  // Restore locally active state across page reloads if this client holds the active session lock
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('piso_insert_active') === 'true') {
      if (isHolder && coinSlotEnabled && (data?.lockRemainingSeconds ?? 0) > 0) {
        setIsLocallyActive(true);
      } else {
        sessionStorage.removeItem('piso_insert_active');
      }
    }
  }, [isHolder, coinSlotEnabled, data?.lockRemainingSeconds]);

  // Start countdown & track real-time pulses whenever slot becomes active or new coins drop
  useEffect(() => {
    if (isSlotActive) {
      // If pulses increased, play sound, trigger pulse bump animation, and reset timer back to timeoutSeconds
      if (pulses > prevPulsesRef.current) {
        setIsPulseBumping(true);
        playPulseChime();
        if (pulseBumpTimeoutRef.current) clearTimeout(pulseBumpTimeoutRef.current);
        pulseBumpTimeoutRef.current = setTimeout(() => {
          setIsPulseBumping(false);
        }, 250);

        setCountdown(timeoutSeconds);
      } else if (countdown === null) {
        const initialSeconds =
          data?.lockRemainingSeconds && data.lockRemainingSeconds > 0
            ? data.lockRemainingSeconds
            : timeoutSeconds;
        setCountdown(initialSeconds);
      }
      prevPulsesRef.current = pulses;
    } else {
      setCountdown(null);
      prevPulsesRef.current = 0;
    }
  }, [isSlotActive, pulses, timeoutSeconds, data?.lockRemainingSeconds]);

  // Interval countdown
  useEffect(() => {
    if (!isSlotActive || countdown === null) return;

    if (countdown <= 0) {
      if (pulses === 0) {
        // Timed out with 0 coins: revert to idle standby state
        setIsLocallyActive(false);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('piso_insert_active');
        }
        fetch('/api/coins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'disable' }),
        }).catch(() => { });
        mutate();
      }
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSlotActive, countdown, pulses, mutate]);

  const handleStartInsertCoin = async () => {
    if (!isWanOnline) {
      setErrorMsg('Cannot activate coin slot: Internet connection is currently offline.');
      return;
    }
    if (isBusy) {
      setErrorMsg('Coinslot is currently in use by another customer. Please wait for your turn.');
      return;
    }
    if (abuseLockout && abuseLockout > 0) {
      setErrorMsg(`Coinslot temporarily locked due to repeated attempts. Please wait ${abuseLockout}s.`);
      return;
    }

    setIsActivating(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable' }),
      });
      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          setErrorMsg(resData.message || 'Coinslot is currently in use by another customer. Please wait for your turn.');
        } else if (res.status === 429) {
          const secs = resData.lockoutSeconds || 300;
          setAbuseLockout(secs);
          setErrorMsg(resData.message || `Too many insert attempts. Please wait ${secs}s.`);
        } else if (res.status === 503) {
          setErrorMsg(resData.message || 'Internet connection offline. Coin slot is disabled to protect your coins.');
        } else {
          setErrorMsg(resData.message || 'Could not activate coin slot. Please try again.');
        }
        setIsLocallyActive(false);
        setCountdown(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('piso_insert_active');
        }
        await mutate();
        return;
      }

      setIsLocallyActive(true);
      setCountdown(timeoutSeconds);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('piso_insert_active', 'true');
      }
      await mutate();
    } catch (err) {
      console.error('Error enabling coin slot:', err);
      setErrorMsg('Could not activate coin slot. Please try again.');
      setIsLocallyActive(false);
      setCountdown(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('piso_insert_active');
      }
    } finally {
      setIsActivating(false);
    }
  };

  const handleSimulateCoin = async (amount: number) => {
    setSimulatingAmount(amount);
    setErrorMsg(null);
    setIsLocallyActive(true);
    setCountdown(timeoutSeconds);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('piso_insert_active', 'true');
    }

    try {
      // Ensure slot is enabled first
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable' }),
      });
      // Simulate coin drop
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', amount }),
      });
      await mutate();
    } catch (err) {
      console.error('Error simulating coin:', err);
    } finally {
      setSimulatingAmount(null);
    }
  };

  const handleClearCoins = async () => {
    try {
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      setIsLocallyActive(false);
      setCountdown(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('piso_insert_active');
      }
      await mutate();
    } catch (err) {
      console.error('Error clearing coins:', err);
    }
  };

  const handleConnect = async () => {
    if (pulses <= 0) {
      setErrorMsg('No coins inserted yet! Drop coins into the machine slot to connect.');
      return;
    }

    setIsConnecting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ macHint }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to connect. Please try again.');
      }

      fetch('/hotspot-detect.html', { cache: 'no-store' }).catch(() => { });
      fetch('/generate_204', { cache: 'no-store' }).catch(() => { });

      setIsLocallyActive(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('piso_insert_active');
      }
      mutate();
      onConnectSuccess(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection error. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <Card className="relative overflow-hidden" glow={pulses > 0}>
        {/* Card Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border-2 border-black shadow-neo-sm transition-all ${isSlotActive ? 'bg-[#4ade80] text-black' : 'bg-[#ffe17c] text-black'
                }`}
            >
              <Coins className={`w-5 h-5 ${isSlotActive ? 'animate-bounce' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-extrabold font-display leading-tight text-black dark:text-white">
                Coin Slot Acceptor
              </h2>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Accepts ₱1, ₱5, ₱10, ₱20 coins
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isWanOnline ? (
              <Badge variant="danger" className="gap-1 bg-[#ff5f57] text-black">
                <WifiOff className="w-3.5 h-3.5" />
                WAN OFFLINE
              </Badge>
            ) : isBusy ? (
              <Badge variant="warning" className="gap-1 bg-[#ffe17c] text-black border border-black animate-pulse">
                <Lock className="w-3.5 h-3.5" />
                IN USE {busyRemainingSeconds > 0 && <span className="tabular-nums">({busyRemainingSeconds}s)</span>}
              </Badge>
            ) : !daemonOnline ? (
              <Badge variant="warning">SIMULATION</Badge>
            ) : (
              isSlotActive ? (
                <Badge variant="success" className="gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                  ACTIVE <span className="tabular-nums">({displayCountdown}s)</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-[#f8f6ee] text-black dark:bg-[#111713] dark:text-white">
                  STANDBY
                </Badge>
              )
            )}
          </div>
        </div>

        {/* STATE 1: IDLE / STANDBY / BUSY (Single "Start Insert Coin" Button) */}
        {!isSlotActive && (
          <div className="space-y-3.5">
            {isBusy ? (
              <div className="p-4 rounded-xl bg-[#fff7d1] dark:bg-[#1f2922] border-2 border-black dark:border-[#ffe17c] shadow-neo-sm text-center space-y-2 animate-in fade-in">
                <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider text-black dark:text-[#ffe17c]">
                  <Lock className="w-4 h-4 text-black dark:text-[#ffe17c]" />
                  <span>Coinslot In Use</span>
                </div>
                <p className="text-xs font-bold text-neutral-800 dark:text-[#cbd5e1] leading-relaxed">
                  Another customer is currently inserting coins. The slot will automatically unlock for you once they finish.
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-black text-[#ffe17c] font-mono font-black text-xs shadow-neo-sm">
                  <Timer className="w-3.5 h-3.5" />
                  <span>Waiting for turn... ({busyRemainingSeconds}s)</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-[#b7c6c2] block">
                  Standard Rate
                </span>
                {!data || minutesPerPeso === undefined ? (
                  <div className="mt-1 h-8 flex items-center justify-center">
                    <div className="h-6 w-36 bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
                  </div>
                ) : (
                  <div className="mt-1 text-2xl font-black font-display tracking-tight text-black dark:text-[#ffe17c]">
                    ₱1 = {minutesPerPeso} Minutes
                  </div>
                )}
                <p className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Press the button below to activate the machine slot and insert your coins.
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 text-black" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* The 1 Primary Button */}
            {!isWanOnline ? (
              <Button
                disabled
                variant="outline"
                size="lg"
                className="w-full gap-2 shadow-neo font-display text-base bg-neutral-200 dark:bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-80"
              >
                <WifiOff className="w-5 h-5 shrink-0" />
                <span>Internet Offline • Slot Disabled</span>
              </Button>
            ) : isBusy ? (
              <Button
                disabled
                variant="outline"
                size="lg"
                className="w-full gap-2 shadow-neo font-display text-base bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 cursor-not-allowed opacity-80"
              >
                <Lock className="w-5 h-5 shrink-0" />
                <span>Slot In Use • Please Wait ({busyRemainingSeconds}s)</span>
              </Button>
            ) : abuseLockout && abuseLockout > 0 ? (
              <Button
                disabled
                variant="outline"
                size="lg"
                className="w-full gap-2 shadow-neo font-display text-base bg-[#ffe4e6] text-[#e11d48] border-[#e11d48] cursor-not-allowed"
              >
                <Timer className="w-5 h-5 shrink-0" />
                <span>Locked Out ({abuseLockout}s)</span>
              </Button>
            ) : (
              <Button
                onClick={handleStartInsertCoin}
                isLoading={isActivating}
                variant="primary"
                size="lg"
                className="w-full gap-2 shadow-neo font-display text-base"
              >
                <Coins className="w-5 h-5 stroke-[2.5]" />
                <span>{isConnected ? 'Insert Coins to Add Time' : 'Start Insert Coin'}</span>
              </Button>
            )}

            <p className="text-center text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              {isBusy
                ? 'Please wait near the vendo for the slot to become available.'
                : `Slot will stay active for ${timeoutSeconds} seconds to accept your coins.`}
            </p>
          </div>
        )}

        {/* STATE 2: ACTIVE (Slot Enabled -> Shows Coins Inserted, Timer, & "Connect Now" Button) */}
        {isSlotActive && (
          <div className="space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
            {/* Coins Inserted Box */}
            <div className="p-5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-center">
              {/* Header inside counter: Label + Realtime Countdown Timer */}
              <div className="flex items-center justify-between border-b-2 border-black/15 dark:border-white/15 pb-2 mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-[#b7c6c2]">
                  Coins Inserted
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#ffe17c] text-black border-2 border-black font-mono font-black text-xs">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{displayCountdown}s</span>
                </span>
              </div>

              {/* Giant Peso Counter with Realtime Pulse Bounce */}
              <div className="my-2 flex items-baseline justify-center gap-1.5">
                <span
                  className={cn(
                    "text-6xl font-black font-display tracking-tight text-black dark:text-[#ffe17c] transition-all duration-150 inline-block",
                    isPulseBumping && "scale-115 text-emerald-600 dark:text-[#67e8f9] drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                  )}
                >
                  ₱{pulses}
                </span>
              </div>

              {/* Real-time pulse detection feedback indicator */}
              <div className="flex items-center justify-center gap-1.5 my-1.5 min-h-[20px]">
                {isPulseBumping ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    ⚡ Counting pulse (+₱1)...
                  </span>
                ) : pulses > 0 ? (
                  <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                    ₱{pulses} credited • Drop more or connect
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 animate-pulse">
                    Listening for coin pulses...
                  </span>
                )}
              </div>

              {/* Duration Calculation */}
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm text-xs font-extrabold">
                <Zap className="w-3.5 h-3.5 fill-black text-black shrink-0" />
                <span>
                  {pulses > 0
                    ? `Internet Time: ${formatDuration(estimatedMinutes)}`
                    : minutesPerPeso !== undefined
                    ? `Drop coins now • ₱1 = ${minutesPerPeso}m`
                    : 'Drop coins now'}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 text-black" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* "Connect Now" Button: Disabled when ₱0, Active/Clickable when ₱ > 0 */}
            <Button
              variant={pulses > 0 ? 'accent' : 'outline'}
              size="lg"
              className="w-full gap-2 shadow-neo font-display text-base transition-all"
              isLoading={isConnecting}
              disabled={pulses <= 0}
              onClick={handleConnect}
            >
              {pulses > 0 ? (
                <>
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <span>{isConnected ? 'Add Time Now' : 'Connect Now'}</span>
                  <ArrowRight className="w-5 h-5 shrink-0" />
                </>
              ) : (
                <>
                  <Timer className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="opacity-70">Connect Now (Waiting for Coins...)</span>
                </>
              )}
            </Button>

            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2] px-1">
              <span>
                {pulses > 0
                  ? 'Drop more coins or tap Connect Now'
                  : `Drop coins in the machine slot (${countdown ?? timeoutSeconds}s remaining)`}
              </span>
              {pulses === 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsLocallyActive(false);
                    setCountdown(null);
                    if (typeof window !== 'undefined') {
                      sessionStorage.removeItem('piso_insert_active');
                    }
                    await fetch('/api/coins', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'disable' }),
                    }).catch(() => { });
                    mutate();
                  }}
                  className="underline hover:text-red-500 cursor-pointer font-bold transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Interactive Dev Coin Simulator (Test Mode) */}
      {showSimulator && (
        <div className="p-4 rounded-xl bg-white dark:bg-[#1c241f] text-black dark:text-white border-2 border-black dark:border-[#4a6052] shadow-neo">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold font-display text-black dark:text-[#ffe17c]">
              <Wrench className="w-4 h-4" />
              <span>Coin Slot Simulator (Test Mode)</span>
            </div>
            <Badge variant="warning">NO HARDWARE</Badge>
          </div>

          <p className="text-[11px] text-neutral-700 dark:text-[#cbd5e1] mb-3 font-semibold">
            Simulate physical coins dropping into the CL-168 acceptor:
          </p>

          <div className="grid grid-cols-4 gap-2">
            {[1, 5, 10, 20].map((coin) => (
              <button
                key={coin}
                type="button"
                disabled={simulatingAmount !== null}
                onClick={() => handleSimulateCoin(coin)}
                className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer font-black select-none disabled:opacity-50"
              >
                <PlusCircle className="w-3.5 h-3.5 mb-0.5 text-black" />
                <span className="text-sm font-extrabold font-display leading-tight">+₱{coin}</span>
                <span className="text-[9px] font-mono font-bold text-black/80">{coin}p</span>
              </button>
            ))}
          </div>

          {pulses > 0 && (
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={handleClearCoins}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300 hover:text-red-500 dark:hover:text-[#ff5f57] font-bold cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to ₱0</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
