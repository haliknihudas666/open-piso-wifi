'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Wifi,
  Radio,
  Lock,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Zap,
  Activity,
  Key,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

type OweMode = 'off' | 'transition' | 'owe_5g' | 'owe_all';
type BoolStr = 'true' | 'false';

interface ShieldSettings {
  shield_owe_mode: OweMode;
  shield_client_isolation: BoolStr;
  shield_anti_tethering: BoolStr;
  shield_block_random_mac_trial: BoolStr;
  shield_storm_shield_enabled: BoolStr;
  shield_wids_enabled: BoolStr;
  shield_iot_ssid: string;
  has_iot_passphrase: boolean;
}

interface ShieldAlertEvent {
  id?: string;
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

interface ShieldLiveStatus {
  stormShieldActive: boolean;
  stormShieldRemainingSec: number;
  alerts: ShieldAlertEvent[];
  counts: {
    deauthStorms: number;
    evilTwins: number;
    coinTampers: number;
    total: number;
  };
  routerCapabilities: {
    oweSupported: boolean;
    widsRunning: boolean;
    clientIsolation: boolean;
    antiTethering: boolean;
    iotSsid?: string;
  };
}

interface ShieldApiResponse {
  settings: ShieldSettings;
  live: ShieldLiveStatus;
}

interface SecurityShieldCardProps {
  onUnauthorized?: () => void;
}

const OWE_MODE_OPTIONS: Array<{
  value: OweMode;
  title: string;
  badge?: string;
  description: string;
}> = [
  {
    value: 'owe_5g',
    title: '5GHz OWE + PMF (Recommended)',
    badge: 'Recommended',
    description:
      'Enables zero-password Opportunistic Wireless Encryption (OWE) + mandatory 802.11w PMF on 5GHz to block deauth spoofing, while keeping 2.4GHz Open for legacy devices and ESP32 satellites.',
  },
  {
    value: 'transition',
    title: 'OWE Transition Mode',
    badge: 'Hybrid',
    description:
      'Broadcasts paired Open + hidden OWE interfaces so modern phones upgrade automatically to encrypted 802.11w PMF sessions without locking out older clients.',
  },
  {
    value: 'owe_all',
    title: 'OWE + PMF All Bands (2.4G + 5G)',
    badge: 'Strict',
    description:
      'Enforces zero-password OWE encryption and 802.11w Protected Management Frames on both 2.4GHz and 5GHz guest SSIDs. Requires OWE-capable clients (use Hidden IoT SSID below for ESP32s).',
  },
  {
    value: 'off',
    title: 'Off (Standard Open Captive Portal)',
    description:
      'Disables OWE and 802.11w PMF on guest Wi-Fi radios. Only recommended for legacy routers without hostapd OWE support.',
  },
];

type ShieldToggleKey =
  | 'shield_client_isolation'
  | 'shield_storm_shield_enabled'
  | 'shield_wids_enabled'
  | 'shield_anti_tethering'
  | 'shield_block_random_mac_trial';

const SECURITY_TOGGLES: Array<{
  key: ShieldToggleKey;
  title: string;
  description: string;
  tag: string;
}> = [
  {
    key: 'shield_client_isolation',
    title: 'AP Client Isolation',
    tag: 'L2 Isolation',
    description:
      'Blocks direct peer-to-peer Wi-Fi traffic between connected customers on the same access point (isolate=1) to prevent ARP spoofing and local sniffing.',
  },
  {
    key: 'shield_storm_shield_enabled',
    title: 'Storm Shield Auto-Pause Protection',
    tag: 'Deauth Defense',
    description:
      'Automatically freezes auto-pause disconnect penalties and extends active session timers during mass deauth storms so paying users never lose time.',
  },
  {
    key: 'shield_wids_enabled',
    title: 'OpenWrt WIDS Monitor',
    tag: 'Live Sensor',
    description:
      'Runs the lightweight router WIDS daemon to detect sudden mass station disconnects, deauth floods, and Evil Twin rogue APs broadcasting your SSID.',
  },
  {
    key: 'shield_anti_tethering',
    title: 'Anti-Tethering (TTL=1)',
    tag: 'Hotspot Lock',
    description:
      'Rewrites outbound LAN IP packet TTL to 1 so clients cannot rebroadcast paid internet through portable travel routers or phone hotspots.',
  },
  {
    key: 'shield_block_random_mac_trial',
    title: 'Block Randomized MACs on Free Trial',
    tag: 'Anti-Abuse',
    description:
      'Rejects locally administered / randomized private Wi-Fi MAC addresses when claiming free trial minutes to stop unlimited trial resets.',
  },
];

function formatAlertTimestamp(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getSeverityBadgeVariant(severity: ShieldAlertEvent['severity']) {
  if (severity === 'high') return 'danger' as const;
  if (severity === 'medium') return 'warning' as const;
  return 'info' as const;
}

export function SecurityShieldCard({ onUnauthorized }: SecurityShieldCardProps) {
  const fetcher = async (url: string): Promise<ShieldApiResponse> => {
    const res = await fetch(url);
    if (res.status === 401) {
      onUnauthorized?.();
      throw new Error('Unauthorized');
    }
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to load OpenPiso Shield status');
    }
    return payload;
  };

  const { data, error, mutate, isValidating } = useSWR<ShieldApiResponse>(
    '/api/admin/shield',
    fetcher,
    { refreshInterval: 5000 }
  );

  const [formData, setFormData] = useState({
    shield_owe_mode: 'owe_5g' as OweMode,
    shield_client_isolation: 'true' as BoolStr,
    shield_anti_tethering: 'false' as BoolStr,
    shield_block_random_mac_trial: 'true' as BoolStr,
    shield_storm_shield_enabled: 'true' as BoolStr,
    shield_wids_enabled: 'true' as BoolStr,
    shield_iot_ssid: '',
    shield_iot_passphrase: '',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHopping, setIsHopping] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (data?.settings && !isDirty) {
      setFormData((prev) => ({
        ...prev,
        shield_owe_mode: data.settings.shield_owe_mode || 'owe_5g',
        shield_client_isolation: data.settings.shield_client_isolation || 'true',
        shield_anti_tethering: data.settings.shield_anti_tethering || 'false',
        shield_block_random_mac_trial: data.settings.shield_block_random_mac_trial || 'true',
        shield_storm_shield_enabled: data.settings.shield_storm_shield_enabled || 'true',
        shield_wids_enabled: data.settings.shield_wids_enabled || 'true',
        shield_iot_ssid: data.settings.shield_iot_ssid || '',
      }));
    }
  }, [data?.settings, isDirty]);

  const live = data?.live;
  const counts = live?.counts ?? { deauthStorms: 0, evilTwins: 0, coinTampers: 0, total: 0 };
  const caps = live?.routerCapabilities;
  const alerts = live?.alerts ?? [];
  const hasIotPassphrase = Boolean(data?.settings?.has_iot_passphrase);

  const handleToggle = (key: ShieldToggleKey) => {
    setFormData((prev) => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true',
    }));
    setIsDirty(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);

    try {
      const payload: Record<string, string> = {
        shield_owe_mode: formData.shield_owe_mode,
        shield_client_isolation: formData.shield_client_isolation,
        shield_anti_tethering: formData.shield_anti_tethering,
        shield_block_random_mac_trial: formData.shield_block_random_mac_trial,
        shield_storm_shield_enabled: formData.shield_storm_shield_enabled,
        shield_wids_enabled: formData.shield_wids_enabled,
        shield_iot_ssid: formData.shield_iot_ssid.trim(),
      };
      if (formData.shield_iot_passphrase.trim()) {
        payload.shield_iot_passphrase = formData.shield_iot_passphrase.trim();
      }

      const res = await fetch('/api/admin/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || resData.message || 'Failed to save OpenPiso Shield configuration');
      }

      setFormData((prev) => ({ ...prev, shield_iot_passphrase: '' }));
      setIsDirty(false);
      setStatusMsg({
        type: 'success',
        text: resData.message || 'OpenPiso Shield policies saved and pushed to router!',
      });
      await mutate();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error applying Shield policies' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChannelHop = async () => {
    setIsHopping(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'channel_hop_2g' }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || resData.message || 'Channel hop failed');
      }
      setStatusMsg({
        type: 'success',
        text: resData.message || 'Evaded interference: hopped 2.4GHz Wi-Fi radio to a clean channel!',
      });
      await mutate();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to hop 2.4GHz channel' });
    } finally {
      setIsHopping(false);
    }
  };

  const handleClearAlerts = async () => {
    setIsClearing(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_alerts' }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || resData.message || 'Failed to clear security alerts');
      }
      setStatusMsg({ type: 'success', text: 'Security event log cleared.' });
      await mutate();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error clearing alerts' });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* CARD 1: LIVE STORM SHIELD STATUS & TELEMETRY COUNTERS    */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-4">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border-2 border-black shadow-neo-sm text-black ${
                live?.stormShieldActive ? 'bg-[#ff5f57]' : 'bg-[#ffe17c]'
              }`}
            >
              <ShieldAlert className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle>OpenPiso Shield &amp; Anti-Deauth Defense</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Zero-password OWE encryption (802.11w PMF), WIDS attack detection, Storm Shield &amp; anti-tethering
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {live?.stormShieldActive ? (
              <Badge variant="danger" className="gap-1.5 py-1 text-xs animate-pulse">
                <span className="w-2 h-2 rounded-full bg-black" />
                STORM SHIELD ACTIVE ({live.stormShieldRemainingSec}s)
              </Badge>
            ) : (
              <Badge variant="success" className="gap-1.5 py-1 text-xs">
                <ShieldCheck className="w-3.5 h-3.5" />
                SHIELD ARMED
              </Badge>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleChannelHop}
              isLoading={isHopping}
              className="gap-1.5 text-xs font-extrabold shadow-neo-sm"
              title="Hop 2.4GHz Wi-Fi radio to another non-overlapping channel (1, 6, 11)"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Evade: Hop 2.4GHz Channel</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => mutate()}
              disabled={isValidating}
              className="h-8 w-8 p-0 shadow-neo-sm"
              title="Refresh Shield Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>

        {/* Live Storm Shield Banner */}
        {live?.stormShieldActive ? (
          <div className="p-4 rounded-xl bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-black" />
            <div className="space-y-1">
              <div className="text-sm font-black uppercase tracking-wide">
                Deauth Storm Detected — Storm Shield Engaged ({live.stormShieldRemainingSec}s remaining)
              </div>
              <p className="text-xs font-bold leading-relaxed">
                Auto-pause disconnect penalties are frozen and active customer lease timers are automatically shifted
                forward so paying users do not lose internet time while clients reconnect. Consider hopping the 2.4GHz
                channel or switching to OWE + 802.11w PMF.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-black dark:text-white">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Storm Shield Standby — Monitoring Wi-Fi stations &amp; hardware coin sensors</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={caps?.oweSupported ? 'success' : 'warning'} className="text-[10px]">
                OWE / PMF: {caps?.oweSupported ? 'Supported' : 'Check hostapd'}
              </Badge>
              <Badge variant={caps?.widsRunning ? 'success' : 'outline'} className="text-[10px]">
                WIDS: {caps?.widsRunning ? 'Running' : 'Idle'}
              </Badge>
              <Badge variant={caps?.clientIsolation ? 'info' : 'outline'} className="text-[10px]">
                Isolation: {caps?.clientIsolation ? 'On' : 'Off'}
              </Badge>
              <Badge variant={caps?.antiTethering ? 'purple' : 'outline'} className="text-[10px]">
                TTL=1: {caps?.antiTethering ? 'On' : 'Off'}
              </Badge>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-black bg-[#ff5f57] text-black shadow-neo-sm text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            <span>{error.message || 'Could not load OpenPiso Shield telemetry.'}</span>
          </div>
        )}

        {statusMsg && (
          <div
            className={`flex items-center gap-2 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold text-black ${
              statusMsg.type === 'success' ? 'bg-[#4ade80]' : 'bg-[#ff5f57]'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Alert Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">
              Deauth Storms
            </div>
            <div className="font-black text-2xl font-display text-black dark:text-[#ffe17c]">
              {counts.deauthStorms}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
              802.11 flood / mass drop
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">
              Evil Twins
            </div>
            <div className="font-black text-2xl font-display text-black dark:text-[#ff5f57]">
              {counts.evilTwins}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
              Rogue BSSID spoofing
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">
              Coin Tampers
            </div>
            <div className="font-black text-2xl font-display text-black dark:text-[#c084fc]">
              {counts.coinTampers}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
              Abnormal / inhibited pulses
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <div className="text-[10px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] mb-1">
              Router Capabilities
            </div>
            <div className="font-black text-base font-display text-black dark:text-[#4ade80]">
              {caps?.oweSupported ? 'OWE Ready' : 'Legacy AP'}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
              {counts.total} total event{counts.total === 1 ? '' : 's'} logged
            </div>
          </div>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* CARD 2: ANTI-DEAUTH & ATTACK PREVENTION CONTROLS         */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#4ade80] text-black border-2 border-black shadow-neo-sm">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle>Anti-Deauth &amp; Attack Prevention Controls</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Configure passwordless OWE / 802.11w PMF encryption, isolation, WIDS, and IoT network separation
              </p>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSave} className="space-y-6">
          {/* OWE / 802.11w PMF Mode Selector */}
          <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3 shadow-neo-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
                <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>OWE Zero-Password Encryption &amp; 802.11w PMF Mode</span>
              </div>
              <Badge variant="primary" className="text-[10px]">
                No Wi-Fi Password Required
              </Badge>
            </div>

            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] leading-relaxed">
              Standard Open Wi-Fi is vulnerable to unauthenticated deauth frames. Opportunistic Wireless Encryption
              (OWE / Enhanced Open) establishes per-client encryption without asking customers for a password and
              enforces 802.11w Protected Management Frames (PMF) so attackers cannot spoof disconnect packets.
            </p>

            {caps && !caps.oweSupported && (
              <div className="p-2.5 rounded-lg bg-[#ffe17c] text-black border-2 border-black text-[11px] font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Router reports hostapd OWE is not currently detected. Setup script safely keeps Open Wi-Fi if wpad
                  lacks OWE (install wpad-openssl / wpad-wolfssl on OpenWrt to enable OWE).
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {OWE_MODE_OPTIONS.map((option) => {
                const isSelected = formData.shield_owe_mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, shield_owe_mode: option.value }));
                      setIsDirty(true);
                    }}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-black dark:border-[#ffe17c] bg-[#ffe17c]/35 dark:bg-[#ffe17c]/15 shadow-neo-sm'
                        : 'border-neutral-300 dark:border-[#3a4a42] bg-white dark:bg-[#0d120f] hover:border-black/50 dark:hover:border-[#5a7a62]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-black dark:border-[#ffe17c] bg-black dark:bg-[#ffe17c]'
                              : 'border-neutral-400 dark:border-neutral-600'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-black" />}
                        </div>
                        <span className="text-xs font-black text-black dark:text-white">{option.title}</span>
                      </div>
                      {option.badge && (
                        <Badge
                          variant={option.value === 'owe_5g' ? 'success' : option.value === 'owe_all' ? 'purple' : 'info'}
                          className="text-[9px] py-0 px-1.5 shrink-0"
                        >
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="pl-6 text-[10.5px] font-semibold text-neutral-600 dark:text-[#b7c6c2] leading-snug">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5 Security Toggles */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
              <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Active Shield Protections</span>
            </div>

            <div className="space-y-2.5">
              {SECURITY_TOGGLES.map((item) => {
                const isEnabled = formData[item.key] === 'true';
                return (
                  <div
                    key={item.key}
                    className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5 max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-black dark:text-white">{item.title}</span>
                        <Badge variant={isEnabled ? 'success' : 'outline'} className="text-[10px] py-0">
                          {isEnabled ? `Enabled • ${item.tag}` : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-[#b7c6c2] font-semibold leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={item.title}
                      onClick={() => handleToggle(item.key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-black shadow-neo-sm transition-colors duration-200 ease-in-out focus:outline-none ${
                        isEnabled ? 'bg-[#4ade80]' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white border border-black shadow-sm ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hidden WPA2/3-PMF IoT & Admin SSID */}
          <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3 shadow-neo-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
                <Radio className="w-4 h-4 text-amber-500" />
                <span>Hidden WPA2/WPA3-PMF IoT &amp; Admin SSID</span>
              </div>
              {caps?.iotSsid && (
                <Badge variant="info" className="text-[10px] font-mono">
                  Active: {caps.iotSsid}
                </Badge>
              )}
            </div>
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] leading-relaxed">
              Optional hidden, passphrase-protected SSID (WPA2/WPA3-SAE + mandatory PMF) dedicated for ESP32 satellite
              coinslots and admin management when guest Wi-Fi uses OWE.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-black dark:text-white mb-1">
                  Hidden IoT / Admin SSID
                </label>
                <Input
                  type="text"
                  value={formData.shield_iot_ssid}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, shield_iot_ssid: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="e.g. OpenPiso-IoT (leave empty to disable)"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-black dark:text-white flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>WPA2/3-PMF Passphrase</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="text-[11px] font-mono text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPassphrase ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <Input
                  type={showPassphrase ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.shield_iot_passphrase}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, shield_iot_passphrase: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder={
                    hasIotPassphrase
                      ? '•••••••• (saved — leave blank to keep)'
                      : 'Minimum 8 characters for WPA2/3-PMF'
                  }
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleChannelHop}
              isLoading={isHopping}
              className="gap-2 font-black shadow-neo-sm"
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Evade: Hop 2.4GHz Channel</span>
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSaving}
              className="gap-2 px-6 font-black shadow-neo"
            >
              <Save className="w-4 h-4" />
              <span>Save &amp; Apply Shield</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* ======================================================== */}
      {/* CARD 3: LIVE SECURITY EVENT LOG                          */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#c084fc] text-black border-2 border-black shadow-neo-sm">
              <Activity className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle>Live Security Event Log ({alerts.length})</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Real-time WIDS wireless intrusion alerts and coin acceptor tamper telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => mutate()}
              disabled={isValidating}
              className="gap-1.5 text-xs font-bold shadow-neo-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleClearAlerts}
              isLoading={isClearing}
              disabled={alerts.length === 0}
              className="gap-1.5 text-xs font-bold shadow-neo-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Alerts</span>
            </Button>
          </div>
        </CardHeader>

        {alerts.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] text-center space-y-2 shadow-neo-sm">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-black text-black dark:text-white">
              No security threats or tamper alerts recorded
            </p>
            <p className="text-[11px] font-semibold text-neutral-500 dark:text-[#b7c6c2] max-w-md mx-auto">
              Deauth floods, Evil Twin rogue SSIDs, and uninhibited coin-line tamper pulses will appear here in real
              time.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-black dark:border-[#4a6052] bg-[#121714] text-white overflow-hidden shadow-neo-sm">
            <div className="divide-y divide-white/10 max-h-96 overflow-y-auto font-mono text-xs">
              {alerts.map((alert, idx) => (
                <div
                  key={alert.id || `${alert.timestamp}-${idx}`}
                  className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-4 ${
                    alert.severity === 'high'
                      ? 'border-l-[#ff5f57] bg-[#ff5f57]/5'
                      : alert.severity === 'medium'
                      ? 'border-l-[#ffe17c] bg-[#ffe17c]/5'
                      : 'border-l-[#7dd3fc] bg-[#7dd3fc]/5'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getSeverityBadgeVariant(alert.severity)} className="text-[9px] uppercase py-0">
                        {alert.severity}
                      </Badge>
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-[#ffe17c] font-bold text-[10px] uppercase">
                        {alert.type}
                      </span>
                      {alert.band && (
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[#7dd3fc] text-[10px] font-bold">
                          {alert.band}
                        </span>
                      )}
                      {alert.count !== undefined && (
                        <span className="text-[10px] text-neutral-300 font-bold">count={alert.count}</span>
                      )}
                    </div>

                    <p className="font-sans text-xs font-bold text-white leading-snug">{alert.message}</p>

                    {(alert.ssid || alert.bssid || alert.mac) && (
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-neutral-400">
                        {alert.ssid && <span>SSID: {alert.ssid}</span>}
                        {alert.bssid && <span>BSSID: {alert.bssid}</span>}
                        {alert.mac && <span>MAC: {alert.mac}</span>}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-neutral-400 shrink-0 sm:text-right">
                    {formatAlertTimestamp(alert.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
