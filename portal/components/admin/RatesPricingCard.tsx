'use client';

import React, { useState } from 'react';
import {
  Tag,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Gift,
  Pause,
  Clock,
  Coins,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DEFAULT_RATE_TIERS, RateTier } from '@/lib/rates';
import { formatDuration } from '@/lib/utils';

const PRESET_TRIAL_OPTIONS = ['5', '10', '15', '30', '60'];

interface RatesPricingCardProps {
  initialSettings: {
    minutes_per_peso: string;
    rates_config?: string;
    free_trial_enabled?: string;
    free_trial_minutes?: string;
    allow_pause_time?: string;
    auto_pause_on_disconnect?: string;
    auto_pause_grace_seconds?: string;
    auto_resume_on_reconnect?: string;
  };
  onSaveSuccess?: () => void;
}

export function RatesPricingCard({ initialSettings, onSaveSuccess }: RatesPricingCardProps) {
  const [formData, setFormData] = useState({
    minutes_per_peso: initialSettings.minutes_per_peso || '10',
    free_trial_enabled: initialSettings.free_trial_enabled || 'true',
    free_trial_minutes: initialSettings.free_trial_minutes || '5',
    allow_pause_time: initialSettings.allow_pause_time || 'true',
    auto_pause_on_disconnect: initialSettings.auto_pause_on_disconnect || 'true',
    auto_pause_grace_seconds: initialSettings.auto_pause_grace_seconds || '60',
    auto_resume_on_reconnect: initialSettings.auto_resume_on_reconnect || 'true',
  });

  const [isCustomTrial, setIsCustomTrial] = useState<boolean>(() => {
    const currentMin = String(initialSettings.free_trial_minutes || '5');
    return !PRESET_TRIAL_OPTIONS.includes(currentMin);
  });

  const [rateTiers, setRateTiers] = useState<RateTier[]>(() => {
    try {
      if (initialSettings.rates_config) {
        return JSON.parse(initialSettings.rates_config);
      }
    } catch {}
    return DEFAULT_RATE_TIERS;
  });

  const [newAmount, setNewAmount] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newPopular, setNewPopular] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddTier = () => {
    const amount = parseInt(newAmount, 10);
    const minutes = parseInt(newMinutes, 10);
    if (isNaN(amount) || amount <= 0 || isNaN(minutes) || minutes <= 0) {
      setErrorMsg('Please enter valid amount and minutes for the new tier.');
      return;
    }

    if (rateTiers.some((t) => t.amount === amount)) {
      setErrorMsg(`A rate tier for ₱${amount} already exists.`);
      return;
    }

    const updated = [
      ...rateTiers,
      {
        amount,
        minutes,
        label: newLabel.trim() || undefined,
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

  const handleRemoveTier = (amountToRemove: number) => {
    setRateTiers(rateTiers.filter((t) => t.amount !== amountToRemove));
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
          minutes_per_peso: formData.minutes_per_peso,
          rates_config: JSON.stringify(rateTiers),
          free_trial_enabled: formData.free_trial_enabled,
          free_trial_minutes: formData.free_trial_minutes,
          allow_pause_time: formData.allow_pause_time,
          auto_pause_on_disconnect: formData.auto_pause_on_disconnect,
          auto_pause_grace_seconds: formData.auto_pause_grace_seconds,
          auto_resume_on_reconnect: formData.auto_resume_on_reconnect,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save rate settings');
      }

      setSuccessMsg('Rates and pricing configuration saved successfully!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving rate settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Tag className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <CardTitle>Rates & Pricing Tiers</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
              Configure coin-to-time rates, price tier packages, free trial allocation, and client pause rules
            </p>
          </div>
        </div>
      </CardHeader>

      {/* Success / Error Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-black bg-[#4ade80] text-black shadow-neo-sm text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-black bg-[#ff5f57] text-black shadow-neo-sm text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 text-black" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ======================================================== */}
        {/* SECTION 1: PRICING TIER PACKAGES (EXACT BRACKETS)        */}
        {/* ======================================================== */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Coins className="w-4 h-4 text-amber-500" />
            <span>Pricing Tier Cards (Exact Coin-to-Time Brackets)</span>
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#ffe17c] text-black font-black uppercase text-[10px] tracking-wider border-b-2 border-black">
                <tr>
                  <th className="p-3">Amount (₱)</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Label / Subtext</th>
                  <th className="p-3">Badge</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
                {rateTiers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-neutral-500">
                      No custom tiers defined. System falls back to default conversion rate.
                    </td>
                  </tr>
                ) : (
                  rateTiers.map((tier) => (
                    <tr key={tier.amount} className="hover:bg-black/5 dark:hover:bg-white/5 font-medium">
                      <td className="p-3 font-mono font-black text-black dark:text-white text-sm">
                        ₱{tier.amount}
                      </td>
                      <td className="p-3 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                        {tier.minutes} mins ({formatDuration(tier.minutes)})
                      </td>
                      <td className="p-3 font-bold text-black dark:text-white">
                        {tier.label || formatDuration(tier.minutes)}
                      </td>
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
                          title="Delete tier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Add New Tier Strip */}
          <div className="p-3.5 rounded-xl border-2 border-black bg-white dark:bg-[#1c241f] shadow-neo-sm space-y-2.5">
            <span className="text-[11px] font-black uppercase text-black dark:text-white tracking-wider block">
              Add New Rate Tier
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2] mb-1">
                  Amount (₱)
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 5"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2] mb-1">
                  Total Minutes
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 60"
                  value={newMinutes}
                  onChange={(e) => setNewMinutes(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2] mb-1">
                  Display Label (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 1 Hour Special"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] cursor-pointer h-10 select-none">
                  <input
                    type="checkbox"
                    checked={newPopular}
                    onChange={(e) => setNewPopular(e.target.checked)}
                    className="rounded border-2 border-black text-black focus:ring-black accent-[#ffe17c] w-4 h-4"
                  />
                  <span>Popular</span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddTier}
                  className="h-10 px-3 font-extrabold gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Tier</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SECTION 2: BASE CONVERSION RATE                          */}
        {/* ======================================================== */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Base Coin-to-Time Conversion Ratio</span>
          </div>

          <div className="max-w-md">
            <label className="block text-xs font-black text-black dark:text-white mb-1.5">
              Default Minutes per ₱1 Coin
            </label>
            <Input
              type="number"
              min={1}
              value={formData.minutes_per_peso}
              onChange={(e) => setFormData({ ...formData, minutes_per_peso: e.target.value })}
              required
            />
            <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              Used for general coin drops or change that does not match an exact tier above.
            </p>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SECTION 3: DAILY FREE TRIAL GRANT                        */}
        {/* ======================================================== */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Gift className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Daily Free Trial Grant</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Free Trial Status
              </label>
              <select
                value={formData.free_trial_enabled}
                onChange={(e) => setFormData({ ...formData, free_trial_enabled: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="true">Enabled (1 Free Trial per Device / 24 Hours)</option>
                <option value="false">Disabled (No Free Access Allowed)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Allows new devices to test connection before dropping coins.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Trial Duration (Minutes)
              </label>
              <div className="flex gap-2">
                <select
                  value={isCustomTrial ? 'custom' : formData.free_trial_minutes}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setIsCustomTrial(true);
                    } else {
                      setIsCustomTrial(false);
                      setFormData({ ...formData, free_trial_minutes: val });
                    }
                  }}
                  className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
                >
                  <option value="5">5 Minutes</option>
                  <option value="10">10 Minutes</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">1 Hour (60 mins)</option>
                  <option value="custom">Custom Minutes...</option>
                </select>

                {isCustomTrial && (
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={formData.free_trial_minutes}
                    onChange={(e) => setFormData({ ...formData, free_trial_minutes: e.target.value })}
                    placeholder="e.g. 20"
                    className="w-28"
                    required
                  />
                )}
              </div>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Automatically expires and disconnects device when timer runs out.
              </p>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SECTION 4: CLIENT TIME PAUSING & DISCONNECT RULES        */}
        {/* ======================================================== */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Pause className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Client Time Pausing & Disconnect Rules</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Client Time Pausing
              </label>
              <select
                value={formData.allow_pause_time}
                onChange={(e) => setFormData({ ...formData, allow_pause_time: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="true">Allow Users to Pause & Resume Time</option>
                <option value="false">Strict Continuous Time (No Pausing)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Users can manually freeze their countdown timer when leaving the hotspot.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Auto-Pause on Disconnect
              </label>
              <select
                value={formData.auto_pause_on_disconnect}
                onChange={(e) => setFormData({ ...formData, auto_pause_on_disconnect: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="true">Enabled (Auto-freeze time when Wi-Fi disconnects)</option>
                <option value="false">Disabled (Time keeps running while away)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Freezes customer session timer when phone walks out of Wi-Fi range.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Disconnect Grace Period
              </label>
              <select
                value={formData.auto_pause_grace_seconds}
                onChange={(e) => setFormData({ ...formData, auto_pause_grace_seconds: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="30">30 seconds</option>
                <option value="60">60 seconds (Recommended)</option>
                <option value="120">2 minutes</option>
                <option value="300">5 minutes</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Wait time before pausing to prevent fake triggers during temporary signal dips.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Auto-Resume on Reconnect
              </label>
              <select
                value={formData.auto_resume_on_reconnect}
                onChange={(e) => setFormData({ ...formData, auto_resume_on_reconnect: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="true">Automatic (Restore internet immediately upon reconnect)</option>
                <option value="false">Manual (User must click Resume button on portal)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Automatically unpauses when phone re-associates with Wi-Fi.
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            className="gap-2 px-6 font-black shadow-neo"
          >
            <Save className="w-4 h-4" />
            <span>Save Rates Configuration</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
