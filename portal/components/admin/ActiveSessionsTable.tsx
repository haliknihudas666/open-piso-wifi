'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Users,
  PowerOff,
  Plus,
  Wifi,
  RefreshCw,
  Smartphone,
  Laptop,
  Tablet,
  Pause,
  ShieldCheck,
  Search,
  Check,
  Copy,
  Clock,
  Zap,
  Radio,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatRemainingTime } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export interface ActiveSessionItem {
  id: string;
  macAddress: string;
  ipAddress: string | null;
  deviceName?: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  amountPaid: number;
  isActive: boolean;
  isPaused?: boolean;
  type: string;
  remainingSeconds: number;
}

interface ActiveSessionsTableProps {
  sessions: ActiveSessionItem[];
  onSessionsUpdated: () => void;
}

export function ActiveSessionsTable({ sessions, onSessionsUpdated }: ActiveSessionsTableProps) {
  // Live fetch connected Wi-Fi radio clients & whitelisted devices for real-time live control
  const { data: clientsData, mutate: mutateClients, isValidating: isClientsValidating } = useSWR(
    '/api/admin/router/clients',
    fetcher,
    { refreshInterval: 5000 }
  );
  const { data: devicesData, mutate: mutateDevices } = useSWR('/api/admin/devices', fetcher);

  const connectedStations: any[] = clientsData?.clients || [];
  const whitelistedDevices: any[] = devicesData?.devices || [];

  // State
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [copiedMac, setCopiedMac] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'PORTAL' | 'VIP'>('ALL');
  const [customTimeModal, setCustomTimeModal] = useState<{ open: boolean; mac: string; sessionId?: string; name: string } | null>(null);
  const [customMinutes, setCustomMinutes] = useState('30');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Maps for rapid lookup
  const sessionsMap = useMemo(() => {
    const map = new Map<string, ActiveSessionItem>();
    for (const s of sessions) {
      map.set(s.macAddress.toLowerCase(), s);
    }
    return map;
  }, [sessions]);

  const whitelistSet = useMemo(() => {
    const set = new Set<string>();
    for (const d of whitelistedDevices) {
      if (d.type === 'WHITELIST') {
        set.add(d.macAddress.toLowerCase());
      }
    }
    return set;
  }, [whitelistedDevices]);

  // Combine active sessions with all currently associated Wi-Fi stations to detect freeloaders/portal guests
  const unifiedRows = useMemo(() => {
    const combined: Array<{
      sessionId?: string;
      mac: string;
      ip: string | null;
      deviceName: string;
      method: string;
      amountPaid: number;
      durationMinutes: number;
      remainingSeconds: number;
      isPaused: boolean;
      isActive: boolean;
      isWhitelisted: boolean;
      isFreeloader: boolean;
      signalDbm?: number;
      band?: string;
    }> = [];

    const seenMacs = new Set<string>();

    // 1. Add all active sessions
    for (const s of sessions) {
      const macLower = s.macAddress.toLowerCase();
      seenMacs.add(macLower);

      const station = connectedStations.find((c) => c.mac.toLowerCase() === macLower);
      const isVip = whitelistSet.has(macLower);

      combined.push({
        sessionId: s.id,
        mac: s.macAddress,
        ip: s.ipAddress || station?.ip || null,
        deviceName: s.deviceName || station?.hostname || 'Wi-Fi Client',
        method: s.type || 'COIN',
        amountPaid: s.amountPaid || 0,
        durationMinutes: s.durationMinutes || 0,
        remainingSeconds: s.remainingSeconds,
        isPaused: Boolean(s.isPaused),
        isActive: Boolean(s.isActive && !s.isPaused),
        isWhitelisted: isVip,
        isFreeloader: false,
        signalDbm: station?.signalDbm,
        band: station?.band,
      });
    }

    // 2. Add connected Wi-Fi stations not in active paid sessions (freeloaders / captive portal guests)
    for (const st of connectedStations) {
      const macLower = st.mac.toLowerCase();
      if (!seenMacs.has(macLower)) {
        seenMacs.add(macLower);
        const isVip = whitelistSet.has(macLower);

        combined.push({
          mac: st.mac,
          ip: st.ip || null,
          deviceName: st.hostname || 'Guest Device',
          method: isVip ? 'VIP' : 'GUEST',
          amountPaid: 0,
          durationMinutes: 0,
          remainingSeconds: 0,
          isPaused: false,
          isActive: isVip,
          isWhitelisted: isVip,
          isFreeloader: !isVip,
          signalDbm: st.signalDbm,
          band: st.band,
        });
      }
    }

    return combined;
  }, [sessions, connectedStations, whitelistSet]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return unifiedRows.filter((r) => {
      // Tab filter
      if (filterTab === 'ACTIVE' && (!r.isActive || r.isPaused)) return false;
      if (filterTab === 'PAUSED' && !r.isPaused) return false;
      if (filterTab === 'PORTAL' && !r.isFreeloader) return false;
      if (filterTab === 'VIP' && !r.isWhitelisted) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = r.deviceName.toLowerCase().includes(q);
        const matchMac = r.mac.toLowerCase().includes(q);
        const matchIp = (r.ip || '').toLowerCase().includes(q);
        const matchMethod = r.method.toLowerCase().includes(q);
        return matchName || matchMac || matchIp || matchMethod;
      }
      return true;
    });
  }, [unifiedRows, filterTab, searchQuery]);

  // Handle Copy MAC
  const handleCopyMac = (mac: string) => {
    navigator.clipboard.writeText(mac);
    setCopiedMac(mac);
    setTimeout(() => setCopiedMac(null), 2000);
  };

  // One-Tap Actions: Add Time, Kick, Whitelist
  const handleAction = async (
    action: 'add_time' | 'disconnect' | 'whitelist',
    target: { sessionId?: string; mac: string; deviceName?: string },
    minutes = 15
  ) => {
    setLoadingAction(`${action}_${target.mac}`);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sessionId: target.sessionId,
          macAddress: target.mac,
          deviceName: target.deviceName,
          additionalMinutes: minutes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');

      setFeedbackMsg({
        type: 'success',
        text:
          action === 'add_time'
            ? `+${minutes}m granted to ${target.deviceName || target.mac}!`
            : action === 'disconnect'
            ? `Device ${target.deviceName || target.mac} kicked and session severed!`
            : `Device ${target.deviceName || target.mac} whitelisted with free permanent access!`,
      });

      onSessionsUpdated();
      mutateClients();
      mutateDevices();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error processing action' });
    } finally {
      setLoadingAction(null);
    }
  };

  // Device Icon Classifier
  const getDeviceIcon = (name?: string | null) => {
    const n = (name || '').toLowerCase();
    if (n.includes('laptop') || n.includes('windows') || n.includes('macbook') || n.includes('pc') || n.includes('linux')) {
      return <Laptop className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />;
    }
    if (n.includes('pad') || n.includes('tab') || n.includes('galaxy tab')) {
      return <Tablet className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />;
    }
    return <Smartphone className="w-4 h-4 text-amber-500 shrink-0" />;
  };

  // Method Badge Renderer
  const renderMethodBadge = (method: string, amount: number) => {
    const m = method.toUpperCase();
    if (m === 'COIN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-black dark:border-[#4a6052] bg-[#ffe17c] text-black shadow-neo-sm">
          <span>🪙</span>
          <span>Coin{amount > 0 ? ` ₱${amount}` : ''}</span>
        </span>
      );
    }
    if (m === 'GCASH') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-black dark:border-[#4a6052] bg-[#38bdf8] text-black shadow-neo-sm">
          <span>💳</span>
          <span>GCash</span>
        </span>
      );
    }
    if (m === 'VOUCHER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-black dark:border-[#4a6052] bg-[#c084fc] text-black shadow-neo-sm">
          <span>🎟️</span>
          <span>Voucher</span>
        </span>
      );
    }
    if (m === 'FREE_TRIAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-black dark:border-[#4a6052] bg-[#4ade80] text-black shadow-neo-sm">
          <span>🎁</span>
          <span>Free Trial</span>
        </span>
      );
    }
    if (m === 'VIP') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-black dark:border-[#4a6052] bg-[#a855f7] text-white shadow-neo-sm">
          <span>👑</span>
          <span>VIP Staff</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border border-dashed border-neutral-400 text-neutral-600 dark:text-neutral-400">
        <span>●</span>
        <span>Portal Guest</span>
      </span>
    );
  };

  const activePaidCount = unifiedRows.filter((r) => r.isActive && !r.isPaused && !r.isFreeloader).length;
  const pausedCount = unifiedRows.filter((r) => r.isPaused).length;
  const freeloadersCount = unifiedRows.filter((r) => r.isFreeloader).length;
  const vipCount = unifiedRows.filter((r) => r.isWhitelisted).length;

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* SMARTFI-STYLE LIVE CONTROL HERO CARD                    */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo overflow-hidden p-0 bg-white dark:bg-[#18211b]">
        {/* Hero Header Strip */}
        <div className="p-6 pb-5 border-b-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              {/* Eyebrow badge */}
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#1c241f] text-[10px] font-black tracking-widest uppercase text-black dark:text-white shadow-neo-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>SESSIONS • LIVE CONTROL</span>
              </div>

              {/* Main Headline */}
              <h2 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-black dark:text-white">
                Control who&apos;s online — <span className="text-emerald-600 dark:text-[#4ade80]">with one tap.</span>
              </h2>

              {/* Explainer Subtitle */}
              <p className="text-xs sm:text-sm font-semibold text-neutral-600 dark:text-[#b7c6c2] leading-relaxed">
                See every connected device in real time — how they paid, their MAC, and the time ticking down. Add time,
                kick a freeloader, or whitelist a MAC for free permanent access, all from this dashboard.
              </p>
            </div>

            {/* Right Status Pill & Refresh Action */}
            <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-black bg-[#ffe17c] text-black shadow-neo-sm text-xs font-black">
                <Radio className="w-3.5 h-3.5" />
                <span>{unifiedRows.length} Total Devices</span>
              </div>

              <Button
                onClick={() => {
                  onSessionsUpdated();
                  mutateClients();
                  mutateDevices();
                }}
                variant="outline"
                size="sm"
                className="gap-1.5 px-3 py-1.5 text-xs font-bold shadow-neo-sm"
                title="Refresh Live Sessions & Connected Stations"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isClientsValidating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Now</span>
              </Button>
            </div>
          </div>

          {/* Feedback Alert */}
          {feedbackMsg && (
            <div
              className={`mt-4 flex items-center justify-between gap-2 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${
                feedbackMsg.type === 'success' ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
              }`}
            >
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{feedbackMsg.text}</span>
              </div>
              <button
                onClick={() => setFeedbackMsg(null)}
                className="text-[11px] underline font-black cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Quick Filter Tabs & Search Bar */}
          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t-2 border-black/10 dark:border-white/10">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all cursor-pointer whitespace-nowrap ${
                  filterTab === 'ALL'
                    ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black shadow-neo-sm'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                All ({unifiedRows.length})
              </button>

              <button
                onClick={() => setFilterTab('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filterTab === 'ACTIVE'
                    ? 'border-black bg-[#4ade80] text-black shadow-neo-sm'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Active ({activePaidCount})
              </button>

              <button
                onClick={() => setFilterTab('PAUSED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filterTab === 'PAUSED'
                    ? 'border-black bg-[#ffe17c] text-black shadow-neo-sm'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <Pause className="w-3 h-3" />
                Paused ({pausedCount})
              </button>

              <button
                onClick={() => setFilterTab('PORTAL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filterTab === 'PORTAL'
                    ? 'border-black bg-[#ff5f57] text-black shadow-neo-sm'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <span>🚫</span>
                Freeloaders ({freeloadersCount})
              </button>

              <button
                onClick={() => setFilterTab('VIP')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filterTab === 'VIP'
                    ? 'border-black bg-[#c084fc] text-black shadow-neo-sm'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                VIP ({vipCount})
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search device, MAC, IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-bold border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#1c241f] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* LIVE CONTROL CLIENTS TABLE                               */}
        {/* ======================================================== */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#f2efe4] dark:bg-[#141a16] text-neutral-700 dark:text-[#b7c6c2] font-black uppercase text-[11px] tracking-wider border-b-2 border-black dark:border-[#4a6052]">
              <tr>
                <th className="py-3.5 px-4">DEVICE</th>
                <th className="py-3.5 px-4">MAC ADDRESS</th>
                <th className="py-3.5 px-4">METHOD</th>
                <th className="py-3.5 px-4">TIME LEFT</th>
                <th className="py-3.5 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>

            <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#18211b]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm flex items-center justify-center">
                        <Wifi className="w-6 h-6 stroke-[2.5]" />
                      </div>
                      <p className="font-extrabold text-sm text-black dark:text-white">
                        No clients matching filter
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-[#b7c6c2]">
                        When customers associate with Wi-Fi, drop coins, or redeem vouchers, their active session streams here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.mac}
                    className="hover:bg-neutral-50 dark:hover:bg-[#1f2a23] transition-colors font-medium"
                  >
                    {/* 1. DEVICE */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl border-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713] shadow-neo-sm">
                          {getDeviceIcon(row.deviceName)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-black dark:text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{row.deviceName}</span>
                            {row.band && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-black/30 dark:border-white/30 text-neutral-600 dark:text-neutral-400">
                                {row.band}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono font-bold text-neutral-500 dark:text-[#b7c6c2]">
                            {row.ip || 'No IP assigned'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. MAC ADDRESS */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-black text-black dark:text-white">
                        <span>{row.mac}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyMac(row.mac)}
                          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-neutral-500 hover:text-black dark:hover:text-white"
                          title="Copy MAC Address"
                        >
                          {copiedMac === row.mac ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {row.signalDbm !== undefined && (
                        <div className="text-[10px] font-bold text-neutral-500 font-mono">
                          Signal: {row.signalDbm} dBm
                        </div>
                      )}
                    </td>

                    {/* 3. METHOD */}
                    <td className="py-3.5 px-4">
                      {renderMethodBadge(row.method, row.amountPaid)}
                    </td>

                    {/* 4. TIME LEFT */}
                    <td className="py-3.5 px-4">
                      {row.isWhitelisted ? (
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-sm text-purple-600 dark:text-[#c084fc]">
                            ∞ Unlimited
                          </span>
                          <div className="text-[10px] font-bold text-neutral-500">Permanent VIP</div>
                        </div>
                      ) : row.isFreeloader ? (
                        <div className="space-y-0.5">
                          <span className="font-mono font-bold text-xs text-rose-500">
                            00:00 (No Time)
                          </span>
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-black border border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-950/40">
                            Freeloader
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-1.5">
                            {row.isPaused && <Pause className="w-3 h-3 text-amber-500 shrink-0" />}
                            <span className="font-mono font-black text-base tracking-tight text-black dark:text-[#4ade80]">
                              {formatRemainingTime(row.remainingSeconds)}
                            </span>
                          </div>
                          {row.isPaused ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#ffe17c] text-black border border-black shadow-neo-sm">
                              <Pause className="w-2.5 h-2.5" />
                              Paused
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#4ade80] text-black border border-black shadow-neo-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 5. ACTIONS: [+15m] [Kick] [Whitelist] */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                        {/* +15m Quick Add Time */}
                        <Button
                          onClick={() =>
                            handleAction('add_time', {
                              sessionId: row.sessionId,
                              mac: row.mac,
                              deviceName: row.deviceName,
                            }, 15)
                          }
                          disabled={loadingAction !== null}
                          variant="outline"
                          size="sm"
                          className="px-2.5 py-1 text-xs font-black border-2 border-black bg-white dark:bg-[#111713] text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 shadow-neo-sm"
                          title="Add 15 minutes bonus time instantly"
                        >
                          <Plus className="w-3 h-3 stroke-[3]" />
                          <span>+15m</span>
                        </Button>

                        {/* Kick / Disconnect */}
                        <Button
                          onClick={() => {
                            if (confirm(`Kick ${row.deviceName || row.mac} off the Wi-Fi network?`)) {
                              handleAction('disconnect', {
                                sessionId: row.sessionId,
                                mac: row.mac,
                                deviceName: row.deviceName,
                              });
                            }
                          }}
                          disabled={loadingAction !== null}
                          variant="danger"
                          size="sm"
                          className="px-2.5 py-1 text-xs font-black shadow-neo-sm"
                          title="Sever connection and drop firewall authorization"
                        >
                          <PowerOff className="w-3 h-3 stroke-[2.5]" />
                          <span>Kick</span>
                        </Button>

                        {/* Whitelist Permanent Access */}
                        {!row.isWhitelisted && (
                          <Button
                            onClick={() => {
                              if (confirm(`Whitelist ${row.deviceName || row.mac} for permanent free access?`)) {
                                handleAction('whitelist', {
                                  sessionId: row.sessionId,
                                  mac: row.mac,
                                  deviceName: row.deviceName,
                                });
                              }
                            }}
                            disabled={loadingAction !== null}
                            variant="outline"
                            size="sm"
                            className="px-2.5 py-1 text-xs font-black border-2 border-black bg-[#ffe17c] text-black hover:bg-[#fed7aa] shadow-neo-sm"
                            title="Whitelist MAC for free permanent access (bypass paywall)"
                          >
                            <ShieldCheck className="w-3 h-3 stroke-[2.5]" />
                            <span>Whitelist</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 3 SMARTFI-INSPIRED FEATURE HIGHLIGHT CARDS               */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Add time to any active session */}
        <div className="p-4 rounded-xl border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#18211b] shadow-neo space-y-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-black dark:text-white font-display">
            <div className="p-1.5 rounded-lg bg-[#38bdf8] text-black border-2 border-black shadow-neo-sm">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
            <span>Add time to any active session</span>
          </div>
          <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] leading-relaxed">
            Top up customers with bonus time (+15m, +30m, +1h) directly from your phone in one tap without touching physical coins.
          </p>
        </div>

        {/* Card 2: Kick a freeloader in one tap */}
        <div className="p-4 rounded-xl border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#18211b] shadow-neo space-y-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-black dark:text-white font-display">
            <div className="p-1.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm">
              <span className="text-sm">👢</span>
            </div>
            <span>Kick a freeloader in one tap</span>
          </div>
          <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] leading-relaxed">
            Instantly sever unauthorized client connections, clear their DHCP lease, and drop firewall forwarding rules immediately.
          </p>
        </div>

        {/* Card 3: Whitelist a MAC for free permanent access */}
        <div className="p-4 rounded-xl border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#18211b] shadow-neo space-y-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-black dark:text-white font-display">
            <div className="p-1.5 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <span className="text-sm">♾️</span>
            </div>
            <span>Whitelist a MAC for free permanent access</span>
          </div>
          <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] leading-relaxed">
            Permanently bypass the captive portal paywall for family devices, store attendants, CCTV cameras, and POS terminals.
          </p>
        </div>
      </div>
    </div>
  );
}
