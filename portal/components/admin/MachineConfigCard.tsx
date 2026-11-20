'use client';

import React, { useEffect, useState } from 'react';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Cpu,
  Clock,
  Key,
  ToggleLeft,
  Coins,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GpioPinSelector } from '@/components/admin/GpioPinSelector';

interface MachineConfigCardProps {
  initialSettings: {
    admin_pin?: string;
    has_admin_pin?: boolean;
    coin_gpio_pin?: string;
    inhibit_gpio_pin?: string;
    button_gpio_pin?: string;
    inhibit_mode?: string;
    gpio_backend?: string;
    board_profile?: string;
    pulse_multiplier?: string;
    coin_slot_timeout_seconds?: string;
  };
  onSaveSuccess?: () => void;
}

export function MachineConfigCard({ initialSettings, onSaveSuccess }: MachineConfigCardProps) {
  const [formData, setFormData] = useState({
    admin_pin: '',
    coin_gpio_pin: initialSettings.coin_gpio_pin || '4',
    inhibit_gpio_pin: initialSettings.inhibit_gpio_pin || '17',
    button_gpio_pin: initialSettings.button_gpio_pin || '27',
    inhibit_mode: initialSettings.inhibit_mode || 'high',
    gpio_backend: initialSettings.gpio_backend || 'auto',
    board_profile: initialSettings.board_profile || 'rpi',
    pulse_multiplier: initialSettings.pulse_multiplier || '1',
    coin_slot_timeout_seconds: initialSettings.coin_slot_timeout_seconds || '60',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialSettings && !isDirty) {
      setFormData((prev) => ({
        ...prev,
        coin_gpio_pin: initialSettings.coin_gpio_pin || prev.coin_gpio_pin,
        inhibit_gpio_pin: initialSettings.inhibit_gpio_pin || prev.inhibit_gpio_pin,
        button_gpio_pin: initialSettings.button_gpio_pin || prev.button_gpio_pin,
        inhibit_mode: initialSettings.inhibit_mode || prev.inhibit_mode,
        gpio_backend: initialSettings.gpio_backend || prev.gpio_backend,
        board_profile: initialSettings.board_profile || prev.board_profile,
        pulse_multiplier: initialSettings.pulse_multiplier || prev.pulse_multiplier,
        coin_slot_timeout_seconds: initialSettings.coin_slot_timeout_seconds || prev.coin_slot_timeout_seconds,
      }));
    }
  }, [initialSettings, isDirty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload: Record<string, string> = {
        coin_gpio_pin: formData.coin_gpio_pin,
        inhibit_gpio_pin: formData.inhibit_gpio_pin,
        button_gpio_pin: formData.button_gpio_pin,
        inhibit_mode: formData.inhibit_mode,
        gpio_backend: formData.gpio_backend,
        board_profile: formData.board_profile,
        pulse_multiplier: formData.pulse_multiplier || '1',
        coin_slot_timeout_seconds: formData.coin_slot_timeout_seconds,
      };
      if (formData.admin_pin.trim() !== '') {
        payload.admin_pin = formData.admin_pin.trim();
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save machine configuration');
      }

      setFormData((prev) => ({ ...prev, admin_pin: '' }));
      setIsDirty(false);
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
            onChange={(coinBcm, inhibitBcm) => {
              setFormData((prev) => ({
                ...prev,
                coin_gpio_pin: String(coinBcm),
                inhibit_gpio_pin: String(inhibitBcm),
              }));
              setIsDirty(true);
            }}
          />

          {/* Hardware Profile & GPIO Backend Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                Hardware Board Profile
              </label>
              <select
                value={formData.board_profile}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, board_profile: e.target.value }));
                  setIsDirty(true);
                }}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-[#ffe17c] shadow-neo-sm"
              >
                <option value="rpi">Raspberry Pi (40-Pin BCM Header)</option>
                <option value="orangepi">Orange Pi (Linux SBC / libgpiod)</option>
                <option value="nanopi">NanoPi / Banana Pi (libgpiod)</option>
                <option value="x86_serial">x86 / Mini PC (USB ESP32 Coin Bridge)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Select the host controller board running the OpenPisoWiFi daemon
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                GPIO / Hardware Backend
              </label>
              <select
                value={formData.gpio_backend}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, gpio_backend: e.target.value }));
                  setIsDirty(true);
                }}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-[#ffe17c] shadow-neo-sm"
              >
                <option value="auto">Auto-Detect (gpiozero → libgpiod)</option>
                <option value="gpiozero">gpiozero (Raspberry Pi OS)</option>
                <option value="gpiod">libgpiod (Orange Pi / NanoPi / Kernel GPIO)</option>
                <option value="serial">USB Serial (ESP32 Coin Bridge)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Driver used by daemon to monitor coin pulses and drive inhibit pin
              </p>
            </div>
          </div>

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
                onClick={() => {
                  setFormData((prev) => ({ ...prev, inhibit_mode: 'high' }));
                  setIsDirty(true);
                }}
                className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
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
                  <span className="text-xs font-black text-black dark:text-white">Inhibit HIGH (Active-LOW Accept)</span>
                </div>
                <div className="pl-6 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-mono font-black">IDLE: 3.3V HIGH</span>
                    <span className="text-neutral-600 dark:text-neutral-300">→ (Blocked)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-mono font-black">ACTIVE: 0V LOW</span>
                    <span className="text-neutral-600 dark:text-neutral-300">→ (Slot Accepting)</span>
                  </div>
                  <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 pt-0.5">
                    For coin acceptors with built-in SET / Inhibit pin (CL-168, Allan, HX-616)
                  </p>
                </div>
              </button>

              {/* LOW trigger level */}
              <button
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, inhibit_mode: 'low' }));
                  setIsDirty(true);
                }}
                className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
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
                  <span className="text-xs font-black text-black dark:text-white">Inhibit LOW (Active-HIGH Relay)</span>
                </div>
                <div className="pl-6 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-mono font-black">IDLE: 0V LOW</span>
                    <span className="text-neutral-600 dark:text-neutral-300">→ (Blocked)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-mono font-black">ACTIVE: 3.3V HIGH</span>
                    <span className="text-neutral-600 dark:text-neutral-300">→ (Relay ON)</span>
                  </div>
                  <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 pt-0.5">
                    For external relay modules that cut the coin line or 12V power supply
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                Coin Slot Timeout (Seconds)
              </label>
              <Input
                type="number"
                min={10}
                max={300}
                value={formData.coin_slot_timeout_seconds}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, coin_slot_timeout_seconds: e.target.value }));
                  setIsDirty(true);
                }}
                placeholder="60"
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Active countdown after Insert Coin (resets on each coin drop).
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                Pulse-to-Peso Multiplier
              </label>
              <Input
                type="number"
                min={1}
                max={100}
                value={formData.pulse_multiplier}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, pulse_multiplier: e.target.value }));
                  setIsDirty(true);
                }}
                placeholder="1"
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Default 1 for coins (₱1/pulse); set &gt;1 for bill acceptors.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                Physical Button Pin (BCM)
              </label>
              <Input
                type="number"
                min={0}
                max={27}
                value={formData.button_gpio_pin}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, button_gpio_pin: e.target.value }));
                  setIsDirty(true);
                }}
                placeholder="27"
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Optional kiosk hardware button BCM pin (default: 27 / Pin 13).
              </p>
            </div>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-black text-black dark:text-white">
                Admin Access PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] font-mono text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPin ? 'Hide' : 'Reveal'}
              </button>
            </div>
            <Input
              type={showPin ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.admin_pin}
              onChange={(e) => setFormData((prev) => ({ ...prev, admin_pin: e.target.value }))}
              placeholder="Leave blank to keep current PIN"
            />
            <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              Leave blank to keep current PIN. Stored securely hashed with scrypt on the server.
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
