'use client';

import React from 'react';
import useSWR from 'swr';
import { Cpu, HardDrive, Thermometer, Clock, Activity, Wifi, RefreshCw, Globe } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatRemainingTime } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SystemHealthCard() {
  const { data, mutate, isValidating } = useSWR('/api/admin/system/health', fetcher, {
    refreshInterval: 5000,
  });

  const { data: versionData } = useSWR('/api/admin/system/version', fetcher);

  const rpi = data?.rpi;
  const router = data?.router;

  const tempColor =
    (rpi?.cpuTempC || 0) < 55
      ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
      : (rpi?.cpuTempC || 0) < 70
      ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
      : 'text-rose-400 bg-rose-500/15 border-rose-500/30';

  const formatUptime = (seconds: number) => {
    if (!seconds) return '0m';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Hardware Health & Telemetry</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Real-time status of Raspberry Pi & OpenWrt router</p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => mutate()}
          disabled={isValidating}
          className="h-8 w-8 p-0 shadow-neo-sm"
          title="Refresh Telemetry"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raspberry Pi Host Telemetry */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3.5 shadow-neo-sm">
          <div className="flex items-center justify-between border-b-2 border-black/10 dark:border-white/10 pb-2">
            <div>
              <span className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 font-display">
                🍓 Raspberry Pi Paywall
              </span>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-[#1c241f] border border-black dark:border-[#4a6052] text-black dark:text-white flex items-center gap-1 shadow-neo-sm">
                  <Globe className="w-2.5 h-2.5 text-black dark:text-[#ffe17c]" />
                  Portal: {versionData?.portalVersion || versionData?.systemVersion || '...'}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-[#1c241f] border border-black dark:border-[#4a6052] text-black dark:text-white flex items-center gap-1 shadow-neo-sm">
                  <span className={`w-1.5 h-1.5 rounded-full ${versionData?.daemonOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  Daemon: {versionData?.daemonVersion || versionData?.systemVersion || '...'}
                </span>
              </div>
            </div>
            <Badge variant="success" className="text-[10px] py-0 font-black">Online</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* CPU Temp */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-black dark:text-[#ffe17c]" />
                <span className="font-extrabold text-neutral-700 dark:text-[#b7c6c2]">CPU Temp</span>
              </div>
              <span className={`px-2 py-0.5 rounded-lg border-2 border-black font-mono font-black text-xs shadow-neo-sm ${tempColor}`}>
                {rpi?.cpuTempC || 0}°C
              </span>
            </div>

            {/* Uptime */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-black dark:text-[#ffe17c]" />
                <span className="font-extrabold text-neutral-700 dark:text-[#b7c6c2]">Uptime</span>
              </div>
              <span className="font-mono font-black text-black dark:text-[#ffe17c] text-xs">
                {formatUptime(rpi?.uptimeSeconds || 0)}
              </span>
            </div>
          </div>

          {/* RAM Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-neutral-700 dark:text-[#b7c6c2] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                RAM Usage ({rpi?.memUsedMb || 0}MB / {rpi?.memTotalMb || 0}MB)
              </span>
              <span className="font-mono font-black text-black dark:text-white">{rpi?.memUsagePercent || 0}%</span>
            </div>
            <div className="w-full h-3 bg-white dark:bg-[#1c241f] rounded-full overflow-hidden border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
              <div
                className="h-full bg-[#ffe17c] rounded-full border-r-2 border-black transition-all"
                style={{ width: `${rpi?.memUsagePercent || 0}%` }}
              />
            </div>
          </div>

          {/* SD Card Disk Progress */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-neutral-700 dark:text-[#b7c6c2] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                SD Storage ({rpi?.diskUsedGb || 0}GB / {rpi?.diskTotalGb || 0}GB)
              </span>
              <span className="font-mono font-black text-black dark:text-white">{rpi?.diskPercent || 0}%</span>
            </div>
            <div className="w-full h-3 bg-white dark:bg-[#1c241f] rounded-full overflow-hidden border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
              <div
                className="h-full bg-[#b7c6c2] rounded-full border-r-2 border-black transition-all"
                style={{ width: `${rpi?.diskPercent || 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* OpenWrt Router Telemetry */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3.5 shadow-neo-sm">
          <div className="flex items-center justify-between border-b-2 border-black/10 dark:border-white/10 pb-2">
            <span className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 font-display">
              📡 Ruijie OpenWrt Router
            </span>
            <Badge variant="info" className="text-[10px] py-0 font-bold">192.168.1.1</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Wi-Fi Clients */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span className="font-extrabold text-neutral-700 dark:text-[#b7c6c2]">Wi-Fi Stations</span>
              </div>
              <span className="font-mono font-black text-cyan-600 dark:text-cyan-400 text-xs">
                {router?.totalClients || 0} online
              </span>
            </div>

            {/* Router Uptime */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-black dark:text-[#ffe17c]" />
                <span className="font-extrabold text-neutral-700 dark:text-[#b7c6c2]">Uptime</span>
              </div>
              <span className="font-mono font-black text-black dark:text-[#ffe17c] text-xs">
                {formatUptime(router?.uptimeSeconds || 0)}
              </span>
            </div>

            {/* Router RAM */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="font-extrabold text-neutral-700 dark:text-[#b7c6c2]">Free Memory</span>
              </div>
              <span className="font-mono font-black text-black dark:text-white text-xs">
                {router?.memFreeMb || 0} MB
              </span>
            </div>

            {/* Load Average */}
            <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-extrabold text-neutral-700 dark:text-[#b7c6c2]">Load</span>
              </div>
              <span className="font-mono font-black text-black dark:text-white text-xs truncate max-w-[90px]">
                {router?.loadAvg || '0.00'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] flex items-center justify-between shadow-neo-sm">
            <span>Active DHCP Leases</span>
            <span className="font-mono font-black text-black dark:text-[#ffe17c]">{router?.dhcpLeasesCount || 0} devices</span>
          </div>
        </div>
      </div>
    </Card>

  );
}
