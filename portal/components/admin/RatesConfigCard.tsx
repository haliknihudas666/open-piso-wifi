'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Settings,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Tag,
  Router,
  Activity,
  Gauge,
  Gift,
  Pause,
  Megaphone,
  RefreshCw,
  Zap,
  Wrench,
  Globe,
  Cpu,
  Clock,
  Palette,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DEFAULT_RATE_TIERS, RateTier } from '@/lib/rates';
import { formatDuration } from '@/lib/utils';
import { GpioPinSelector } from '@/components/admin/GpioPinSelector';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const PRESET_TRIAL_OPTIONS = ['5', '10', '15', '30', '60'];

interface RatesConfigCardProps {
  initialSettings: {
    minutes_per_peso: string;
    portal_title: string;
    banner_message: string;
    admin_pin: string;
    rates_config?: string;
    portal_domain?: string;
    router_ip?: string;
    portal_ip?: string;
    router_ssh_port?: string;
    router_ssh_user?: string;
    router_ssh_key_path?: string;
    router_mode?: string;
    speed_limit?: string;
    custom_down_mbps?: string;
    custom_up_mbps?: string;
    allow_pause_time?: string;
    auto_pause_on_disconnect?: string;
    auto_pause_grace_seconds?: string;
    auto_resume_on_reconnect?: string;
    free_trial_enabled?: string;
    free_trial_minutes?: string;
    show_coin_simulator?: string;
    portal_theme?: string;
    announcement?: string;
    // GPIO Hardware Pin Settings
    coin_gpio_pin?: string;
    inhibit_gpio_pin?: string;
    coin_slot_timeout_seconds?: string;
  };
  onSaveSuccess?: () => void;
  onNavigateTab?: (tab: any) => void;
}

export function RatesConfigCard({ initialSettings, onSaveSuccess, onNavigateTab }: RatesConfigCardProps) {
  const { data: qosStatus, mutate: mutateQoS } = useSWR('/api/admin/router/qos', fetcher, {
    refreshInterval: 6000,
  });

  const [isCustomTrial, setIsCustomTrial] = useState<boolean>(() => {
    const currentMin = String(initialSettings.free_trial_minutes || '5');
    return !PRESET_TRIAL_OPTIONS.includes(currentMin);
  });

  const [formData, setFormData] = useState({
    minutes_per_peso: initialSettings.minutes_per_peso || '10',
    portal_title: initialSettings.portal_title || 'OpenPisoWifi',
    banner_message: initialSettings.banner_message || 'Fast & Affordable High-Speed Wi-Fi',
    admin_pin: initialSettings.admin_pin || '1234',
    portal_domain: initialSettings.portal_domain || 'wifi.local',
    router_ip: initialSettings.router_ip || '192.168.1.1',
    portal_ip: initialSettings.portal_ip || '192.168.1.240',
    router_ssh_port: initialSettings.router_ssh_port || '22',
    router_ssh_user: initialSettings.router_ssh_user || 'root',
    router_ssh_key_path: initialSettings.router_ssh_key_path || '/root/.ssh/id_rsa',
    router_mode: initialSettings.router_mode || 'fw4_nftables',
    speed_limit: initialSettings.speed_limit || '25mbps',
    custom_down_mbps: initialSettings.custom_down_mbps || '25',
    custom_up_mbps: initialSettings.custom_up_mbps || '10',
    allow_pause_time: initialSettings.allow_pause_time || 'true',
    auto_pause_on_disconnect: initialSettings.auto_pause_on_disconnect || 'true',
    auto_pause_grace_seconds: initialSettings.auto_pause_grace_seconds || '60',
    auto_resume_on_reconnect: initialSettings.auto_resume_on_reconnect || 'true',
    free_trial_enabled: initialSettings.free_trial_enabled || 'true',
    free_trial_minutes: initialSettings.free_trial_minutes || '5',
    show_coin_simulator: initialSettings.show_coin_simulator ?? 'false',
    portal_theme: initialSettings.portal_theme || 'emerald',
    announcement: initialSettings.announcement || '⚡ High-Speed Fiber Internet • Low Ping for Online Gaming & Browsing!',
    // GPIO Hardware Pin Settings (BCM numbers)
    // Default: Coin = BCM 2 (Physical Pin 3, WiringPi 8), Inhibit = BCM 3 (Physical Pin 5, WiringPi 9)
    coin_gpio_pin: initialSettings.coin_gpio_pin || '2',
    inhibit_gpio_pin: initialSettings.inhibit_gpio_pin || '3',
    coin_slot_timeout_seconds: initialSettings.coin_slot_timeout_seconds || '60',
  });

  const [rateTiers, setRateTiers] = useState<RateTier[]>(() => {
    try {
      if (initialSettings.rates_config) {
        return JSON.parse(initialSettings.rates_config);
      }
    } catch { }
    return DEFAULT_RATE_TIERS;
  });

  const [newAmount, setNewAmount] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newPopular, setNewPopular] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingQoS, setIsApplyingQoS] = useState(false);
  const [isTestingRouter, setIsTestingRouter] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleApplyQoSOnly = async () => {
    setIsApplyingQoS(true);
    setErrorMsg(null);
    try {
      let downMbps = 0;
      let upMbps = 0;
      if (formData.speed_limit === '25mbps') {
        downMbps = 25;
        upMbps = 10;
      } else if (formData.speed_limit === '50mbps') {
        downMbps = 50;
        upMbps = 20;
      } else if (formData.speed_limit === '100mbps') {
        downMbps = 100;
        upMbps = 50;
      } else if (formData.speed_limit === 'custom') {
        downMbps = parseInt(formData.custom_down_mbps || '25', 10);
        upMbps = parseInt(formData.custom_up_mbps || '10', 10);
      }

      const res = await fetch('/api/admin/router/qos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadMbps: downMbps, uploadMbps: upMbps }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to apply speed limit');
      setSuccessMsg(resData.message || 'Speed limit applied successfully to OpenWrt!');
      mutateQoS();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error applying speed limit');
    } finally {
      setIsApplyingQoS(false);
    }
  };

  const handleAddTier = () => {
    const amount = parseInt(newAmount, 10);
    const minutes = parseInt(newMinutes, 10);
    if (isNaN(amount) || amount <= 0 || isNaN(minutes) || minutes <= 0) {
      setErrorMsg('Please enter valid amount and minutes for the new tier.');
      return;
    }

    const updated = [
      ...rateTiers.filter((t) => t.amount !== amount),
      {
        amount,
        minutes,
        label: newLabel.trim() || formatDuration(minutes),
        popular: newPopular,
      },
    ].sort((a, b) => a.amount - b.amount);

    setRateTiers(updated);
    setNewAmount('');
    setNewMinutes('');
    setNewLabel('');
    setNewPopular(false);
    setErrorMsg(null);
  };

  const handleRemoveTier = (amount: number) => {
    setRateTiers(rateTiers.filter((t) => t.amount !== amount));
  };

  const handleTestRouter = async () => {
    setIsTestingRouter(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: formData.router_ip,
          port: parseInt(formData.router_ssh_port, 10) || 22,
          username: formData.router_ssh_user,
          privateKeyPath: formData.router_ssh_key_path,
          mode: formData.router_mode,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Could not test router connection' });
    } finally {
      setIsTestingRouter(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          rates_config: JSON.stringify(rateTiers),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to update settings');
      }

      setSuccessMsg('Settings, rate tiers, and OpenWrt QoS rules applied successfully!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Machine Rates & System Configuration</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
              Time packages, price tiers, coin pulse multipliers, and hardware pin modes
            </p>
          </div>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Commercial Features Controls (Bandwidth QoS, Free Trial, Pause Time) */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Gauge className="w-4 h-4 text-amber-500" />
            <span>Commercial Hotspot Features & QoS Speed Limiter</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Speed Limiter / Bandwidth QoS */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-extrabold text-black dark:text-white flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                  Bandwidth Speed Limiter (OpenWrt)
                </label>
                {qosStatus?.active ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black">● QoS Active</span>
                ) : (
                  <span className="text-[10px] text-neutral-500 font-bold">● Uncapped</span>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={formData.speed_limit}
                  onChange={(e) => setFormData({ ...formData, speed_limit: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                >
                  <option value="25mbps">⚡ 25 Mbps Down / 10 Mbps Up (Recommended)</option>
                  <option value="50mbps">🔥 50 Mbps Down / 20 Mbps Up (Fast Fiber)</option>
                  <option value="100mbps">💎 100 Mbps Down / 50 Mbps Up (Gigabit Ultra)</option>
                  <option value="unlimited">🚀 Unlimited (Max Line Speed)</option>
                  <option value="custom">⚙️ Custom Speed Limit...</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyQoSOnly}
                  isLoading={isApplyingQoS}
                  className="shrink-0 h-10 px-3 text-xs font-black shadow-neo-sm gap-1"
                  title="Apply Speed Limit to Router immediately"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Apply</span>
                </Button>
              </div>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                {qosStatus?.active
                  ? `Active on OpenWrt ${qosStatus.lanInterface} & ${qosStatus.wanInterface}`
                  : 'Enforces CAKE / TBF Traffic Control on OpenWrt'}
              </p>
            </div>

            {/* Daily Free Trial Toggle & Duration */}
            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Daily Free Trial (Per Device / 24h)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={formData.free_trial_enabled}
                  onChange={(e) => setFormData({ ...formData, free_trial_enabled: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>

                <select
                  value={isCustomTrial ? 'custom' : formData.free_trial_minutes}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomTrial(true);
                    } else {
                      setIsCustomTrial(false);
                      setFormData({ ...formData, free_trial_minutes: e.target.value });
                    }
                  }}
                  disabled={formData.free_trial_enabled === 'false'}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm disabled:opacity-50"
                >
                  <option value="5">5 Minutes</option>
                  <option value="10">10 Minutes</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">60 Minutes (1 Hour)</option>
                  <option value="custom">Custom Duration...</option>
                </select>
              </div>

              {/* Custom Duration Input Field */}
              {isCustomTrial && formData.free_trial_enabled !== 'false' && (
                <div className="mt-2 relative animate-in fade-in slide-in-from-top-1">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={formData.free_trial_minutes}
                    onChange={(e) => setFormData({ ...formData, free_trial_minutes: e.target.value })}
                    placeholder="Enter custom minutes (e.g. 45)"
                    className="w-full h-10 px-3 pr-16"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-neutral-500 font-bold pointer-events-none">
                    Minutes
                  </span>
                </div>
              )}

              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                {formData.free_trial_enabled === 'false'
                  ? 'Free trial disabled for all users'
                  : `Free daily grant of ${formData.free_trial_minutes || 5} mins per client device`}
              </p>
            </div>

            {/* Pause Time Toggle */}
            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                <Pause className="w-3.5 h-3.5 text-amber-500" />
                Client Time Pausing
              </label>
              <select
                value={formData.allow_pause_time}
                onChange={(e) => setFormData({ ...formData, allow_pause_time: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
              >
                <option value="true">Allow Users to Pause & Resume Time</option>
                <option value="false">Disable Pause Time (Continuous Count)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Users can freeze their countdown when leaving</p>
            </div>

            {/* Auto-Pause on Disconnect Toggle */}
            {formData.allow_pause_time === 'true' && (
              <div>
                <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                  Auto-Pause on Disconnect
                </label>
                <select
                  value={formData.auto_pause_on_disconnect}
                  onChange={(e) => setFormData({ ...formData, auto_pause_on_disconnect: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                >
                  <option value="true">Enabled (Auto-freeze time when Wi-Fi disconnects)</option>
                  <option value="false">Disabled (Only pause if user clicks Pause on Portal)</option>
                </select>
                <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Freezes session when phone walks away from Wi-Fi range</p>
              </div>
            )}

            {/* Disconnect Grace Period & Auto-Resume */}
            {formData.allow_pause_time === 'true' && formData.auto_pause_on_disconnect === 'true' && (
              <>
                <div>
                  <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                    Disconnect Grace Period
                  </label>
                  <select
                    value={formData.auto_pause_grace_seconds}
                    onChange={(e) => setFormData({ ...formData, auto_pause_grace_seconds: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                  >
                    <option value="30">30 seconds (Fast)</option>
                    <option value="60">60 seconds (Recommended)</option>
                    <option value="90">90 seconds</option>
                    <option value="120">2 minutes</option>
                  </select>
                  <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Wait time before pausing to prevent false triggers during brief dips</p>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Auto-Resume on Reconnect
                  </label>
                  <select
                    value={formData.auto_resume_on_reconnect}
                    onChange={(e) => setFormData({ ...formData, auto_resume_on_reconnect: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                  >
                    <option value="true">Automatic (Restore internet immediately upon reconnect)</option>
                    <option value="false">Manual (Customer must open portal & click Resume)</option>
                  </select>
                  <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Automatically unpauses when phone re-associates with Wi-Fi</p>
                </div>
              </>
            )}

            {/* Coin Slot Simulator Visibility Toggle */}
            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-amber-500" />
                Coin Slot Simulator in Portal
              </label>
              <select
                value={formData.show_coin_simulator}
                onChange={(e) => setFormData({ ...formData, show_coin_simulator: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
              >
                <option value="false">Hidden (Production Mode - Real Coins Only)</option>
                <option value="true">Visible (Show Test +₱1, +₱5, +₱10 Buttons)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                {formData.show_coin_simulator === 'false'
                  ? 'Simulator buttons are hidden on the portal for live physical coin machine operation'
                  : 'Simulator buttons are visible on the portal for hardware-free testing'}
              </p>
            </div>
          </div>

          {/* GPIO Hardware Pins Section */}
          <div className="mt-4 pt-4 border-t-2 border-black/10 dark:border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
              <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>GPIO Hardware Pins — Raspberry Pi (BCM numbering)</span>
              <span className="text-[10px] font-bold text-neutral-500 ml-1">used by onoff package · not physical pin numbers</span>
            </div>
            <GpioPinSelector
              coinBcm={parseInt(formData.coin_gpio_pin || '4', 10)}
              inhibitBcm={parseInt(formData.inhibit_gpio_pin || '17', 10)}
              onChange={(coinBcm, inhibitBcm) =>
                setFormData({
                  ...formData,
                  coin_gpio_pin: String(coinBcm),
                  inhibit_gpio_pin: String(inhibitBcm),
                })
              }
            />
            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                Coin Slot Active Timeout (seconds)
              </label>
              <Input
                type="number"
                min={10}
                max={300}
                value={formData.coin_slot_timeout_seconds}
                onChange={(e) => setFormData({ ...formData, coin_slot_timeout_seconds: e.target.value })}
                placeholder="60"
                className="w-40"
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                After pressing Insert Coin, slot stays active for this many seconds. Timer resets on each coin drop.
              </p>
            </div>
          </div>

          {/* Custom Speed Limit Input Fields (Shown only when 'custom' is selected) */}
          {formData.speed_limit === 'custom' && (
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] grid grid-cols-1 sm:grid-cols-2 gap-3 shadow-neo-sm animate-in fade-in slide-in-from-top-1">
              <div>
                <label className="block text-xs font-extrabold text-black dark:text-white mb-1">
                  Custom Download Limit (Mbps)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={formData.custom_down_mbps}
                  onChange={(e) => setFormData({ ...formData, custom_down_mbps: e.target.value })}
                  placeholder="e.g. 25"
                  required
                />
                <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Download speed cap enforced on OpenWrt br-lan</p>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-black dark:text-white mb-1">
                  Custom Upload Limit (Mbps)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={formData.custom_up_mbps}
                  onChange={(e) => setFormData({ ...formData, custom_up_mbps: e.target.value })}
                  placeholder="e.g. 10"
                  required
                />
                <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Upload speed cap per client</p>
              </div>
            </div>
          )}
        </div>

        {/* OpenWrt Router Configuration Section */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
              <Router className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Ruijie RG-EW1200G Pro (OpenWrt Router Controller)</span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isTestingRouter}
              onClick={handleTestRouter}
              className="gap-1.5 text-xs font-bold shadow-neo-sm"
            >
              <Activity className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
              <span>Test Connection</span>
            </Button>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2.5 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${testResult.success
                  ? 'bg-[#4ade80] text-black'
                  : 'bg-[#ff5f57] text-black'
                }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-black" />
              )}
              <div className="flex-1">
                <span>{testResult.message}</span>
                {testResult.latencyMs !== undefined && (
                  <span className="ml-2 font-mono text-[11px] opacity-90">({testResult.latencyMs}ms)</span>
                )}
              </div>
            </div>
          )}

          {/* Customer Portal URLs & Mobile Access Banner */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] space-y-2 shadow-neo-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black text-black dark:text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Customer Mobile Access & Shortcuts</span>
              </div>
              <span className="text-[10px] font-bold text-neutral-500">Router gateway remains untouched at 192.168.1.1</span>
            </div>

            <div className="px-3 py-2 rounded-lg bg-[#ffe17c] text-black border-2 border-black text-xs font-bold shadow-neo-sm flex flex-wrap items-center gap-2">
              <span className="font-black flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" /> Customers can type:
              </span>
              <code className="px-1.5 py-0.5 rounded bg-white text-black font-mono text-[11px] font-black border-2 border-black shadow-neo-sm">
                http://{formData.portal_domain || 'wifi.local'}
              </code>
              <span className="text-black font-bold">or</span>
              <code className="px-1.5 py-0.5 rounded bg-white text-black font-mono text-[11px] font-black border-2 border-black shadow-neo-sm">
                http://10.0.0.1
              </code>
              <span className="text-[10px] text-neutral-800 font-bold ml-auto">(Interception routes to portal :3000 automatically)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">Local Portal Domain</label>
              <Input
                type="text"
                value={formData.portal_domain}
                onChange={(e) => setFormData({ ...formData, portal_domain: e.target.value.trim().toLowerCase() })}
                placeholder="wifi.local"
                required
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Custom address for browser access (e.g. wifi.local, pisowifi.net)</p>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">Raspberry Pi Portal IP</label>
              <Input
                type="text"
                value={formData.portal_ip}
                onChange={(e) => setFormData({ ...formData, portal_ip: e.target.value })}
                placeholder="192.168.1.240"
                required
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Static LAN IP of this Raspberry Pi</p>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">OpenWrt Router Gateway IP</label>
              <Input
                type="text"
                value={formData.router_ip}
                onChange={(e) => setFormData({ ...formData, router_ip: e.target.value })}
                placeholder="192.168.1.1"
                required
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Gateway router IP (default: 192.168.1.1)</p>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">Router Firewall Engine</label>
              <select
                value={formData.router_mode}
                onChange={(e) => setFormData({ ...formData, router_mode: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
              >
                <option value="fw4_nftables">fw4 (nftables) - OpenWrt 22.03+ / 23.05+ / 25.12+</option>
                <option value="opennds">opennds (Captive Portal Daemon)</option>
                <option value="fw3_iptables">fw3 (iptables / ipset) - OpenWrt Legacy</option>
                <option value="simulation">simulation (Local Dev / Mock)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">Firewall command driver</p>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">Dropbear SSH Port</label>
              <Input
                type="number"
                value={formData.router_ssh_port}
                onChange={(e) => setFormData({ ...formData, router_ssh_port: e.target.value })}
                placeholder="22"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">SSH Username</label>
              <Input
                type="text"
                value={formData.router_ssh_user}
                onChange={(e) => setFormData({ ...formData, router_ssh_user: e.target.value })}
                placeholder="root"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold text-black dark:text-white mb-1">SSH Private Key Path</label>
              <Input
                type="text"
                value={formData.router_ssh_key_path}
                onChange={(e) => setFormData({ ...formData, router_ssh_key_path: e.target.value })}
                placeholder="/root/.ssh/id_rsa"
              />
            </div>
          </div>
        </div>

        {/* Basic Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black text-black dark:text-white mb-1.5">
              Fallback Rate (Minutes per 1 Peso)
            </label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={formData.minutes_per_peso}
              onChange={(e) => setFormData({ ...formData, minutes_per_peso: e.target.value })}
              required
            />
            <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              Used when coin change does not match a specific tier
            </p>
          </div>

          <div>
            <label className="block text-xs font-black text-black dark:text-white mb-1.5">
              Admin Access PIN
            </label>
            <Input
              type="text"
              value={formData.admin_pin}
              onChange={(e) => setFormData({ ...formData, admin_pin: e.target.value })}
              required
            />
            <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              Used to access this administrative dashboard
            </p>
          </div>
        </div>

        {/* Tiered Rates Manager */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Tag className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Pricing Tier Cards (Exact Coin-to-Time Brackets)</span>
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#ffe17c] text-black font-black uppercase text-[10px] tracking-wider border-b-2 border-black">
                <tr>
                  <th className="p-3">Amount (₱)</th>
                  <th className="p-3">Duration (Mins)</th>
                  <th className="p-3">Display Label</th>
                  <th className="p-3">Badge</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
                {rateTiers.map((tier) => (
                  <tr key={tier.amount} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium">
                    <td className="p-3 font-black text-black dark:text-white text-xs">₱{tier.amount}</td>
                    <td className="p-3 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                      {tier.minutes} mins ({formatDuration(tier.minutes)})
                    </td>
                    <td className="p-3 font-bold text-black dark:text-white">{tier.label || formatDuration(tier.minutes)}</td>
                    <td className="p-3">
                      {tier.popular && (
                        <Badge variant="purple" className="text-[10px] font-black">
                          Popular
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(tier.amount)}
                        className="p-1 text-neutral-500 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Remove tier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add New Tier Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 items-end">
            <div>
              <label className="block text-[11px] font-extrabold text-black dark:text-white mb-1">Amount (₱)</label>
              <Input
                type="number"
                placeholder="e.g. 15"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="py-1.5 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-black dark:text-white mb-1">Minutes</label>
              <Input
                type="number"
                placeholder="e.g. 210"
                value={newMinutes}
                onChange={(e) => setNewMinutes(e.target.value)}
                className="py-1.5 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-black dark:text-white mb-1">Label</label>
              <Input
                type="text"
                placeholder="e.g. 3.5 Hours"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="py-1.5 text-xs font-bold"
              />
            </div>
            <div className="flex items-center gap-2 h-9 px-2">
              <label className="flex items-center gap-1.5 text-xs font-extrabold text-black dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPopular}
                  onChange={(e) => setNewPopular(e.target.checked)}
                  className="rounded border-2 border-black text-black cursor-pointer"
                />
                <span>Popular</span>
              </label>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTier}
                className="w-full gap-1 shadow-neo-sm font-extrabold text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tier</span>
              </Button>
            </div>
          </div>
        </div>

        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#4ade80] border-2 border-black text-black text-xs font-bold shadow-neo-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#ff5f57] border-2 border-black text-black text-xs font-bold shadow-neo-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Button type="submit" variant="primary" size="md" isLoading={isLoading} className="gap-2 shadow-neo font-black">
          <Save className="w-4 h-4" />
          <span>Save Configurations & Rates</span>
        </Button>
      </form>
    </Card>
  );
}

