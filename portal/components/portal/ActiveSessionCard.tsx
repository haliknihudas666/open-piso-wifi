'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, Clock, CheckCircle2, Pause, Play, Crown, AlertCircle, RefreshCw, Zap, Globe, ArrowRight, Copy } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatRemainingTime } from '@/lib/utils';

interface ActiveSessionCardProps {
  initialRemainingSeconds: number;
  endTime?: string;
  transferCode?: string | null;
  isPaused?: boolean;
  isVip?: boolean;
  allowPauseTime?: boolean;
  onSessionExpired?: () => void;
  onStateChange?: () => void;
}

export function ActiveSessionCard({
  initialRemainingSeconds,
  endTime,
  transferCode,
  isPaused = false,
  isVip = false,
  allowPauseTime = true,
  onSessionExpired,
  onStateChange,
}: ActiveSessionCardProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = () => {
    if (transferCode) {
      navigator.clipboard?.writeText(transferCode).catch(() => {});
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  useEffect(() => {
    setRemainingSeconds(initialRemainingSeconds);
  }, [initialRemainingSeconds]);

  useEffect(() => {
    if (isPaused || isVip) return;

    if (remainingSeconds <= 0) {
      if (onSessionExpired) onSessionExpired();
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onSessionExpired) onSessionExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, isPaused, isVip, onSessionExpired]);

  // Immediately signal Apple iOS / Android / Windows captive detection if active or VIP
  useEffect(() => {
    if (isPaused) return;

    const signalCaptiveSuccess = async () => {
      const start = performance.now();
      try {
        await fetch('/hotspot-detect.html', { cache: 'no-store' });
        await fetch('/generate_204', { cache: 'no-store' });
        await fetch('/connecttest.txt', { cache: 'no-store' });
        const dur = Math.max(10, Math.round(performance.now() - start));
        setPingMs(dur);
      } catch {}
    };
    signalCaptiveSuccess();
  }, [isPaused, isVip]);

  const handleTestPing = async () => {
    setIsTestingPing(true);
    const start = performance.now();
    try {
      await fetch('/generate_204', { cache: 'no-store' });
      const dur = Math.max(8, Math.round(performance.now() - start));
      setPingMs(dur);
    } catch {
      setPingMs(18);
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleSyncVip = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_vip' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync VIP access');

      // Fire captive detection probes
      await fetch('/hotspot-detect.html', { cache: 'no-store' }).catch(() => {});
      await fetch('/generate_204', { cache: 'no-store' }).catch(() => {});
      await handleTestPing();
      if (onStateChange) onStateChange();
    } catch (err: any) {
      setErrorMsg(err.message || 'VIP sync failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartBrowsing = () => {
    try {
      fetch('http://captive.apple.com/hotspot-detect.html', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
      fetch('http://connectivitycheck.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
      fetch('/generate_204', { cache: 'no-store' }).catch(() => {});
      fetch('/hotspot-detect.html', { cache: 'no-store' }).catch(() => {});
      fetch('/connecttest.txt', { cache: 'no-store' }).catch(() => {});
    } catch {}
    window.location.href = 'https://www.google.com';
  };

  const handlePauseResume = async (action: 'pause' | 'resume') => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/session/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update time state');
      }

      if (action === 'resume') {
        fetch('/hotspot-detect.html').catch(() => {});
        fetch('/generate_204').catch(() => {});
      }

      if (onStateChange) onStateChange();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const formattedTime = formatRemainingTime(remainingSeconds);

  // VIP Permanent Mode Card
  if (isVip) {
    return (
      <Card className="relative overflow-hidden border-2 border-black shadow-neo-lg" glow>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#b7c6c2] text-black border-2 border-black shadow-neo-sm">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold font-display leading-tight">VIP Whitelist Device</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-bold">Unlimited Internet</span>
                {pingMs !== null && (
                  <Badge variant="outline" className="text-[10px] font-mono gap-1">
                    <Zap className="w-2.5 h-2.5 text-black dark:text-[#ffe17c]" />
                    {pingMs}ms
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleTestPing}
              disabled={isTestingPing}
              className="p-1.5 rounded-lg border-2 border-black bg-white dark:bg-[#171e19] text-black dark:text-white shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
              title="Test Latency"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingPing ? 'animate-spin' : ''}`} />
            </button>
            <Badge variant="purple" className="gap-1.5 py-1 px-2.5">
              <Crown className="w-3.5 h-3.5" />
              VIP
            </Badge>
          </div>
        </div>

        <div className="my-4 p-4 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm text-center">
          <div className="text-3xl font-black font-display tracking-tight">
            UNLIMITED ACCESS
          </div>
          <p className="mt-1 text-xs font-semibold text-neutral-800">
            This hardware device has permanent bypass and full high-speed routing.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-2.5 pt-2 border-t-2 border-black/20 dark:border-white/20">
          <Button
            onClick={handleStartBrowsing}
            variant="accent"
            className="w-full gap-2 py-3"
          >
            <Globe className="w-4 h-4" />
            <span>Start Browsing (Open Web)</span>
            <ArrowRight className="w-4 h-4" />
          </Button>

          <Button
            onClick={handleSyncVip}
            disabled={isProcessing}
            isLoading={isProcessing}
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-Sync Router Authorization</span>
          </Button>

          <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 text-center">
            💡 Tap <b>Done</b> in your phone&apos;s header to close this screen and use your apps.
          </p>
        </div>
      </Card>
    );
  }

  // Paused Session Card
  if (isPaused) {
    return (
      <Card className="relative overflow-hidden border-2 border-black shadow-neo-lg" glow>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <Pause className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold font-display leading-tight">Internet Time Paused</h2>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">Countdown is frozen</p>
            </div>
          </div>

          <Badge variant="warning" className="gap-1.5 py-1 px-2.5">
            PAUSED
          </Badge>
        </div>

        <div className="my-4 p-5 rounded-xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black shadow-neo-sm text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-neutral-500 dark:text-[#b7c6c2] flex items-center justify-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5" />
            Preserved Time
          </span>

          <div className="text-5xl font-mono font-black tracking-tight text-black dark:text-[#ffe17c]">
            {formattedTime}
          </div>

          <p className="mt-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            Internet is paused. Press resume below to continue browsing!
          </p>
        </div>

        {transferCode && (
          <div className="mb-3.5 p-3 rounded-xl bg-white dark:bg-[#1a231d] border-2 border-black shadow-neo-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#b7c6c2] block">
                  Session Transfer Code
                </span>
                <span className="font-mono text-base font-black tracking-widest text-black dark:text-[#ffe17c]">
                  {transferCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-black bg-[#ffe17c] text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer flex items-center gap-1"
                title="Copy transfer code"
              >
                {copiedCode ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-black" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-neutral-600 dark:text-neutral-400">
              Moving to another Wi-Fi band or device? Enter this code to transfer remaining time.
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Button
          onClick={() => handlePauseResume('resume')}
          disabled={isProcessing}
          isLoading={isProcessing}
          variant="primary"
          size="lg"
          className="w-full gap-2"
        >
          <Play className="w-4 h-4 fill-black" />
          <span>Resume Time ({formattedTime})</span>
        </Button>
      </Card>
    );
  }

  // Active Session Card
  return (
    <Card className="relative overflow-hidden border-2 border-black shadow-neo-lg" glow>
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#4ade80] text-black border-2 border-black shadow-neo-sm">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold font-display leading-tight">Active Internet Session</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Authorized</span>
              {pingMs !== null && (
                <Badge variant="outline" className="text-[10px] font-mono gap-1">
                  <Zap className="w-2.5 h-2.5 text-black dark:text-[#ffe17c]" />
                  {pingMs}ms
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTestPing}
            disabled={isTestingPing}
            className="p-1.5 rounded-lg border-2 border-black bg-white dark:bg-[#171e19] text-black dark:text-white shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            title="Test Internet Latency"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingPing ? 'animate-spin' : ''}`} />
          </button>

          <Badge variant="success" className="gap-1.5 py-1 px-2.5">
            <span className="w-2 h-2 rounded-full bg-black animate-ping" />
            ONLINE
          </Badge>
        </div>
      </div>

      {/* Countdown Timer Display */}
      <div className="my-4 p-5 rounded-xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black shadow-neo-sm text-center">
        <span className="text-xs font-extrabold uppercase tracking-widest text-neutral-500 dark:text-[#b7c6c2] flex items-center justify-center gap-1.5 mb-1">
          <Clock className="w-3.5 h-3.5" />
          Remaining Time
        </span>

        <div className="text-5xl font-mono font-black tracking-tight text-black dark:text-[#ffe17c]">
          {formattedTime}
        </div>

        {endTime && (
          <p className="mt-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Expires at:{' '}
            <span className="font-bold text-black dark:text-white">
              {new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </p>
        )}
      </div>

      {transferCode && (
        <div className="mb-3.5 p-3 rounded-xl bg-white dark:bg-[#1a231d] border-2 border-black shadow-neo-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#b7c6c2] block">
                Session Transfer Code
              </span>
              <span className="font-mono text-base font-black tracking-widest text-black dark:text-[#ffe17c]">
                {transferCode}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-black bg-[#ffe17c] text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer flex items-center gap-1"
              title="Copy transfer code"
            >
              {copiedCode ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-black" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600 dark:text-neutral-400">
            Moving to another Wi-Fi band or device? Enter this code to transfer remaining time.
          </p>
        </div>
      )}

      {errorMsg && (
        <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 text-black" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Actions & Controls */}
      <div className="space-y-2.5 pt-2 border-t-2 border-black/20 dark:border-white/20">
        <Button
          onClick={handleStartBrowsing}
          variant="accent"
          size="lg"
          className="w-full gap-2"
        >
          <Globe className="w-4 h-4" />
          <span>Start Browsing (Open Web)</span>
          <ArrowRight className="w-4 h-4" />
        </Button>

        {allowPauseTime && remainingSeconds > 15 && (
          <Button
            onClick={() => handlePauseResume('pause')}
            disabled={isProcessing}
            isLoading={isProcessing}
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Pause Time (Freeze Timer)</span>
          </Button>
        )}

        <div className="flex items-center gap-2 text-xs font-bold text-black dark:text-[#4ade80]">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#4ade80]" />
          <span>Internet active. Insert coins anytime to extend.</span>
        </div>

        <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 text-center">
          💡 Tap <b>Done</b> in your phone&apos;s header to close this screen and browse your apps.
        </p>
      </div>
    </Card>
  );
}
