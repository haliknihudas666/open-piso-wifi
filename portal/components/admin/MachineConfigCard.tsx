'use client';

import React, { useState } from 'react';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Cpu,
  Clock,
  Key,
  ToggleLeft,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GpioPinSelector } from '@/components/admin/GpioPinSelector';

interface MachineConfigCardProps {
  initialSettings: {
    admin_pin: string;
    coin_gpio_pin?: string;
    inhibit_gpio_pin?: string;
    inhibit_mode?: string;
    coin_slot_timeout_seconds?: string;
  };
  onSaveSuccess?: () => void;
}

export function MachineConfigCard({ initialSettings, onSaveSuccess }: MachineConfigCardProps) {
  const [formData, setFormData] = useState({
    admin_pin: initialSettings.admin_pin || '1234',
    coin_gpio_pin: initialSettings.coin_gpio_pin || '4',
    inhibit_gpio_pin: initialSettings.inhibit_gpio_pin || '17',
    inhibit_mode: initialSettings.inhibit_mode || 'high',
    coin_slot_timeout_seconds: initialSettings.coin_slot_timeout_seconds || '60',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
          admin_pin: formData.admin_pin,
          coin_gpio_pin: formData.coin_gpio_pin,
          inhibit_gpio_pin: formData.inhibit_gpio_pin,
          inhibit_mode: formData.inhibit_mode,
          coin_slot_timeout_seconds: formData.coin_slot_timeout_seconds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save machine configuration');
      }

      setSuccessMsg('Machine hardware and security settings saved successfully!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Wrench className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <CardTitle>Machine & Hardware Settings</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
              Configure Raspberry Pi GPIO coin acceptor pins, coin slot active window countdown, and admin access PIN
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
        {/* SECTION 1: HARDWARE GPIO COIN ACCEPTOR PINS             */}
        {/* ======================================================== */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Raspberry Pi GPIO Pin Allocation (BCM Numbering)</span>
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

          {/* Inhibit Pin Trigger Mode Selector */}
          <div className="pt-3">
            <div className="flex items-center gap-2 text-xs font-black text-black dark:text-white mb-2">
              <ToggleLeft className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Inhibit Pin Trigger Mode
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* HIGH trigger level */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, inhibit_mode: 'high' })}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  formData.inhibit_mode === 'high'
                    ? 'border-black dark:border-[#ffe17c] bg-[#e9d5ff] dark:bg-purple-900/30 shadow-neo-sm'
                    : 'border-neutral-300 dark:border-[#3a4a42] bg-white dark:bg-[#0d120f] hover:border-neutral-400 dark:hover:border-[#5a7a62]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    formData.inhibit_mode === 'high'
                      ? 'border-purple-600 dark:border-purple-400 bg-purple-600 dark:bg-purple-400'
                      : 'border-neutral-400 dark:border-neutral-600'
                  }`}>
                    {formData.inhibit_mode === 'high' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <span className="text-xs font-black text-black dark:text-white">Trigger HIGH</span>
                </div>
                <div className="pl-6 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-mono font-black">IDLE: 3.3V HIGH</span>
                    <span className="text-neutral-500 dark:text-neutral-400">→ Idle / blocked</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-mono font-black">ACTIVE: 3.3V HIGH</span>
                    <span className="text-neutral-500 dark:text-neutral-400">→ Relay / slot ON</span>
                  </div>
                  <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 pt-0.5">
                    For coin acceptors with built-in SET / Inhibit pin (CL-168, Allan, HX-616)
                  </p>
                </div>
              </button>

              {/* LOW trigger level */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, inhibit_mode: 'low' })}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  formData.inhibit_mode === 'low'
                    ? 'border-black dark:border-[#ffe17c] bg-[#fef3c7] dark:bg-amber-900/30 shadow-neo-sm'
                    : 'border-neutral-300 dark:border-[#3a4a42] bg-white dark:bg-[#0d120f] hover:border-neutral-400 dark:hover:border-[#5a7a62]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    formData.inhibit_mode === 'low'
                      ? 'border-amber-600 dark:border-amber-400 bg-amber-600 dark:bg-amber-400'
                      : 'border-neutral-400 dark:border-neutral-600'
                  }`}>
                    {formData.inhibit_mode === 'low' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <span className="text-xs font-black text-black dark:text-white">Trigger LOW</span>
                </div>
                <div className="pl-6 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-mono font-black">IDLE: 0V LOW</span>
                    <span className="text-neutral-500 dark:text-neutral-400">→ Idle / blocked</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-mono font-black">ACTIVE: 0V LOW</span>
                    <span className="text-neutral-500 dark:text-neutral-400">→ Relay / slot ON</span>
                  </div>
                  <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 pt-0.5">
                    For external relay modules that cut the coin line or 12V power supply
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-2 max-w-sm">
            <label className="block text-xs font-black text-black dark:text-white mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
              Coin Slot Active Window Timeout (Seconds)
            </label>
            <Input
              type="number"
              min={10}
              max={300}
              value={formData.coin_slot_timeout_seconds}
              onChange={(e) => setFormData({ ...formData, coin_slot_timeout_seconds: e.target.value })}
              placeholder="60"
            />
            <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              Slot stays active and uninhibited for this duration after pressing Insert Coin. Countdown resets on each coin drop.
            </p>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SECTION 2: ADMIN ACCESS SECURITY                        */}
        {/* ======================================================== */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-3 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Key className="w-4 h-4 text-amber-500" />
            <span>Admin Authentication & Dashboard Security</span>
          </div>

          <div className="max-w-md">
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
              PIN required to unlock this administrative management panel. Default is 1234.
            </p>
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
            <span>Save Machine Configuration</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
