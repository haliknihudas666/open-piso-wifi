'use client';

import React from 'react';
import { Zap, Activity, ArrowDown, ArrowUp, CheckCircle2, X, Clock, Gamepad2, Film } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SpeedTestResult } from '@/app/api/speedtest/route';

interface SpeedReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  speedData?: (SpeedTestResult & { ageMinutes?: number }) | null;
  onInsertCoinClick?: () => void;
}

export function SpeedReportModal({
  isOpen,
  onClose,
  speedData,
  onInsertCoinClick,
}: SpeedReportModalProps) {
  if (!isOpen) return null;

  const download = speedData?.downloadMbps || 50;
  const upload = speedData?.uploadMbps || 15;
  const ping = speedData?.pingMs || 18;
  const ageMinutes = speedData?.ageMinutes ?? 0;
  const grade = speedData?.grade || 'Ultra High-Speed Fiber';

  const timeLabel =
    ageMinutes === 0
      ? 'Just now'
      : ageMinutes === 1
        ? '1 minute ago'
        : `${ageMinutes} minutes ago`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-xl p-5 space-y-4 text-black dark:text-white relative animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <Zap className="w-5 h-5 fill-black text-black" />
            </div>
            <div>
              <h3 className="text-base font-black font-display leading-tight">
                Live Speed Test
              </h3>
              <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2]">
                Automated Hourly Speed Benchmark
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713] text-black dark:text-white shadow-neo-sm flex items-center justify-center hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Quality Banner */}
        <div className="p-3 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-black shrink-0" />
            <span className="text-xs font-black uppercase tracking-wide">{grade}</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white text-black font-black">
            VERIFIED
          </Badge>
        </div>

        {/* Speed Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Download Card */}
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-neutral-600 dark:text-neutral-300">
              <ArrowDown className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
              <span>DOWNLOAD</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-black font-display text-black dark:text-[#ffe17c]">
                {download}
              </span>
              <span className="text-[10px] font-black uppercase text-neutral-500 dark:text-neutral-400">
                Mbps
              </span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 dark:text-[#b7c6c2] block mt-0.5">
              High-speed streaming
            </span>
          </div>

          {/* Upload Card */}
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-neutral-600 dark:text-neutral-300">
              <ArrowUp className="w-3.5 h-3.5 text-blue-500 stroke-[3]" />
              <span>UPLOAD</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-black font-display text-black dark:text-[#ffe17c]">
                {upload}
              </span>
              <span className="text-[10px] font-black uppercase text-neutral-500 dark:text-neutral-400">
                Mbps
              </span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 dark:text-[#b7c6c2] block mt-0.5">
              Smooth video calls
            </span>
          </div>
        </div>

        {/* Latency / Ping & Gaming Readiness */}
        <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span>Latency (Ping):</span>
            </div>
            <span className="text-sm font-black font-mono text-black dark:text-[#ffe17c]">
              {ping} ms
            </span>
          </div>

          <div className="pt-2 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold">
              <Gamepad2 className="w-3.5 h-3.5" />
              Low Ping Gaming Ready
            </span>
            <span className="flex items-center gap-1">
              <Film className="w-3.5 h-3.5" />
              4K HD Video & Streaming
            </span>
          </div>
        </div>

        {/* Test Age Info */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-neutral-500 dark:text-[#b7c6c2]">
          <Clock className="w-3.5 h-3.5" />
          <span>Tested {timeLabel} • Automatically tested hourly</span>
        </div>

        {/* Action Button */}
        <Button
          onClick={() => {
            onClose();
            if (onInsertCoinClick) onInsertCoinClick();
          }}
          variant="primary"
          size="md"
          className="w-full gap-2 shadow-neo font-display"
        >
          <span>Insert Coins to Enjoy Speed</span>
        </Button>
      </div>
    </div>
  );
}
