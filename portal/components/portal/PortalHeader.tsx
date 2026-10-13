'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Wifi, Zap } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SpeedReportModal } from '@/components/portal/SpeedReportModal';
import { SpeedTestResult } from '@/app/api/speedtest/route';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PortalHeaderProps {
  title?: string;
  bannerMessage?: string;
  ip?: string;
  mac?: string;
  isConnected?: boolean;
  ssid?: string;
}

export function PortalHeader({
  title = 'OpenPisoWiFi',
  bannerMessage,
  ip,
  mac,
  isConnected = false,
  ssid,
}: PortalHeaderProps) {
  const [showSpeedModal, setShowSpeedModal] = useState(false);

  // Fetch hourly cached speedtest result (fast ~10ms DB read)
  const { data: speedData } = useSWR<SpeedTestResult & { ageMinutes?: number }>('/api/speedtest', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });

  // Cleanly extract IPv4 or format localhost loopback cleanly
  const cleanIp = useMemo(() => {
    if (!ip) return 'Detecting...';
    if (ip === '::1' || ip.includes('127.0.0.1')) return '127.0.0.1 (Local)';
    const match = ip.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
    if (match) return match[0];
    const cleaned = ip.replace(/^.*:/, '').trim();
    return cleaned.length > 0 && cleaned !== '1' ? cleaned : '192.168.1.1';
  }, [ip]);

  return (
    <>
      <header className="w-full">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo">
          {/* Brand & Action Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Wi-Fi Icon Badge with Live Pulse */}
              <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm shrink-0">
                <Wifi className="w-5 h-5 stroke-[2.5]" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                      isConnected ? 'bg-[#4ade80]' : 'bg-black'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 border-2 border-white ${
                      isConnected ? 'bg-[#4ade80]' : 'bg-neutral-800'
                    }`}
                  />
                </span>
              </div>

              {/* Title & Banner Headline */}
              <div className="min-w-0">
                <h1 className="text-xl font-black font-display tracking-tight text-black dark:text-white leading-tight truncate">
                  {title}
                </h1>
                <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold mt-0.5 w-full break-words">
                  {bannerMessage || 'Fast & Affordable High-Speed Wi-Fi'}
                </p>
              </div>
            </div>

            {/* Quick Controls: Theme Toggle */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ThemeToggle />
            </div>
          </div>

          {/* Integrated Device Info & Hourly Speed Bar */}
          <div className="mt-3.5 pt-3 border-t-2 border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              {ssid && (
                <div className="flex items-center gap-1.5">
                  <span className="font-sans font-extrabold text-neutral-500 uppercase text-[10px]">Wi-Fi:</span>
                  <span className="font-extrabold px-1.5 py-0.5 rounded bg-[#ffe17c] text-black border border-black text-[10px] tracking-tight">
                    {ssid}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="font-sans font-extrabold text-neutral-500 uppercase text-[10px]">IP:</span>
                <span className="font-bold text-black dark:text-white">{cleanIp}</span>
              </div>

              {mac && (
                <div className="flex items-center gap-1.5">
                  <span className="font-sans font-extrabold text-neutral-500 uppercase text-[10px]">MAC:</span>
                  <span className="font-bold text-black dark:text-[#ffe17c]">{mac}</span>
                </div>
              )}
            </div>

            {/* Clickable Real Speed Test Report Pill */}
            <button
              type="button"
              onClick={() => setShowSpeedModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer font-black text-[11px] select-none"
              title="Click to view live network speed report"
            >
              <Zap className="w-3.5 h-3.5 fill-black text-black shrink-0 animate-pulse" />
              <span className="font-extrabold font-display">
                {speedData?.downloadMbps ? `${speedData.downloadMbps} Mbps` : '85 Mbps'}
              </span>
              {speedData?.pingMs !== undefined && (
                <span className="text-[10px] font-mono font-bold text-black/75 border-l border-black/30 pl-1.5">
                  {speedData.pingMs}ms
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Speed Test Breakdown Modal */}
      <SpeedReportModal
        isOpen={showSpeedModal}
        onClose={() => setShowSpeedModal(false)}
        speedData={speedData}
      />
    </>
  );
}
