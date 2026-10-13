'use client';

import React, { useState } from 'react';
import {
  Palette,
  Save,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  Eye,
  Type,
  Sparkles,
  Wifi,
  ExternalLink,
  Moon,
  Sun,
  Laptop,
  Smartphone,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface PortalUiCardProps {
  initialSettings: {
    portal_title?: string;
    banner_message?: string;
    announcement?: string;
    show_coin_simulator?: string;
    portal_domain?: string;
    portal_theme?: string;
  };
  onSaveSuccess?: () => void;
}

export function PortalUiCard({ initialSettings, onSaveSuccess }: PortalUiCardProps) {
  const [formData, setFormData] = useState({
    portal_title: initialSettings.portal_title || 'OpenPisoWiFi',
    banner_message: initialSettings.banner_message || 'Fast & Affordable High-Speed Wi-Fi',
    announcement:
      initialSettings.announcement ||
      '⚡ High-Speed Fiber Internet • Low Ping for Online Gaming & Browsing! • Insert coins or buy vouchers at the counter!',
    show_coin_simulator: initialSettings.show_coin_simulator ?? 'false',
  });

  const [previewDark, setPreviewDark] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_title: formData.portal_title.trim() || 'OpenPisoWiFi',
          banner_message: formData.banner_message.trim() || 'Fast & Affordable High-Speed Wi-Fi',
          announcement: formData.announcement.trim(),
          show_coin_simulator: formData.show_coin_simulator,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save UI settings');
      }

      setStatusMsg({ type: 'success', text: 'Portal UI and branding settings saved successfully!' });
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error saving settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const applyMarqueeTemplate = (text: string) => {
    setFormData((prev) => ({ ...prev, announcement: text }));
  };

  const applyBannerTemplate = (text: string) => {
    setFormData((prev) => ({ ...prev, banner_message: text }));
  };

  return (
    <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-6">
      {/* Card Header */}
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Palette className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <CardTitle>Customer Portal UI & Branding</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
              Customize brand name, welcome headlines, announcement ticker marquee, and customer widgets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white text-xs font-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            <span>View Live Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </CardHeader>

      {/* Status Message Notification */}
      {statusMsg && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${
            statusMsg.type === 'success' ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
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

      {/* ======================================================== */}
      {/* REAL-TIME INTERACTIVE PORTAL LIVE PREVIEW                */}
      {/* ======================================================== */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-black dark:text-white font-display">
            <Eye className="w-4 h-4 text-amber-500" />
            <span>Real-Time Customer Portal Header Preview</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-neutral-500 hidden sm:inline">Preview Theme:</span>
            <button
              type="button"
              onClick={() => setPreviewDark(!previewDark)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white text-xs font-extrabold shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            >
              {previewDark ? (
                <>
                  <Moon className="w-3 h-3 text-purple-400" />
                  <span>Dark Preview</span>
                </>
              ) : (
                <>
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light Preview</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scaled Preview Frame */}
        <div
          className={`p-4 rounded-xl border-2 border-black transition-colors duration-200 max-w-md mx-auto space-y-3 shadow-neo ${
            previewDark ? 'bg-[#111613] text-white' : 'bg-[#faf8f3] text-black'
          }`}
        >
          {/* Announcement Marquee Ticker Preview */}
          {formData.announcement ? (
            <div className="w-full overflow-hidden bg-[#ffe17c] text-black border-2 border-black rounded-xl px-2.5 py-1.5 text-xs shadow-neo-sm">
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md bg-black text-[#ffe17c] text-[9px] font-black uppercase tracking-wider">
                  <Megaphone className="w-2.5 h-2.5 text-[#ffe17c]" />
                  NEWS
                </span>
                <div className="overflow-hidden whitespace-nowrap w-full">
                  <p className="inline-block animate-marquee text-black font-extrabold text-[11px] tracking-wide">
                    {formData.announcement}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-1 text-[10px] text-neutral-400 border border-dashed border-neutral-400 rounded-lg">
              (Announcement Marquee is currently empty / hidden)
            </div>
          )}

          {/* Portal Header Preview Card */}
          <div
            className={`p-3.5 rounded-xl border-2 border-black shadow-neo-sm space-y-3 ${
              previewDark ? 'bg-[#1c241f]' : 'bg-white'
            }`}
          >
            {/* Top Bar: Brand, Title, Tagline */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#ffe17c] border-2 border-black flex items-center justify-center font-black text-black shrink-0 shadow-neo-sm">
                  <Wifi className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold font-display text-sm tracking-tight truncate">
                      {formData.portal_title || 'OpenPisoWiFi'}
                    </span>
                    <span className="px-1.5 py-0.2 rounded-md bg-[#4ade80] text-black border border-black text-[9px] font-black uppercase tracking-wider">
                      ONLINE
                    </span>
                  </div>
                  <p
                    className={`text-[11px] font-bold truncate leading-tight ${
                      previewDark ? 'text-[#b7c6c2]' : 'text-neutral-600'
                    }`}
                  >
                    {formData.banner_message || 'Fast & Affordable High-Speed Wi-Fi'}
                  </p>
                </div>
              </div>

              {/* Mock theme toggle button */}
              <div className="p-1 rounded-lg border-2 border-black bg-[#ffe17c] text-black shrink-0">
                <Sun className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Bottom Metadata Bar */}
            <div
              className={`pt-2 border-t-2 border-black/10 dark:border-white/10 flex items-center justify-between text-[10px] font-mono font-bold ${
                previewDark ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span>IP: 192.168.1.100</span>
                <span>•</span>
                <span>MAC: 02:00:00:XX:XX</span>
              </div>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-black bg-[#ffe17c] text-black text-[9px] font-black">
                <span>⚡ 85.1 Mbps</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-center font-bold text-neutral-500 dark:text-[#b7c6c2]">
          💡 Changes reflect immediately in this preview. Click <b>"Save Changes"</b> below to publish live to customers.
        </p>
      </div>

      {/* ======================================================== */}
      {/* SETTINGS EDIT FORM                                       */}
      {/* ======================================================== */}
      <form onSubmit={handleSave} className="space-y-5">
        {/* Section 1: Branding & Headlines */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Type className="w-4 h-4 text-amber-500" />
            <span>Brand Identity & Headlines</span>
          </div>

          <div className="space-y-3">
            {/* Portal Brand Title */}
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                Portal Brand Name / Title
              </label>
              <Input
                type="text"
                value={formData.portal_title}
                onChange={(e) => setFormData({ ...formData, portal_title: e.target.value })}
                placeholder="e.g. OpenPisoWiFi"
                required
              />
              <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Displayed in the captive portal header, browser window title, mobile Wi-Fi login prompt, and printed vouchers.
              </p>
            </div>

            {/* Banner / Welcome Announcement */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-black text-black dark:text-white">
                  Welcome Subtitle / Banner Tagline
                </label>
                <div className="flex items-center gap-1 text-[10px] font-extrabold text-neutral-500">
                  <span>Templates:</span>
                  <button
                    type="button"
                    onClick={() => applyBannerTemplate('Fast & Affordable High-Speed Wi-Fi for everyone.')}
                    className="hover:underline text-amber-600 dark:text-[#ffe17c] cursor-pointer"
                  >
                    Classic
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => applyBannerTemplate('⚡ High-Speed Fiber • Low Ping for Gaming & School!')}
                    className="hover:underline text-amber-600 dark:text-[#ffe17c] cursor-pointer"
                  >
                    Gaming
                  </button>
                </div>
              </div>
              <Input
                type="text"
                value={formData.banner_message}
                onChange={(e) => setFormData({ ...formData, banner_message: e.target.value })}
                placeholder="e.g. Fast & Affordable High-Speed Wi-Fi for everyone."
                required
              />
              <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Tagline shown right beneath the brand title on the captive portal header card.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Announcement Marquee Ticker */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
              <Megaphone className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Live Announcement Marquee Banner (Top Ticker)</span>
            </div>

            {formData.announcement ? (
              <Badge variant="warning">TICKER ACTIVE</Badge>
            ) : (
              <Badge variant="outline">TICKER HIDDEN</Badge>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <label className="block text-xs font-black text-black dark:text-white">
                Scrolling Marquee Message
              </label>
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-neutral-500">
                <span>Quick Templates:</span>
                <button
                  type="button"
                  onClick={() =>
                    applyMarqueeTemplate(
                      '⚡ High-Speed Fiber Internet • Low Ping for Online Gaming & Browsing! • Insert coins or buy vouchers at the counter!'
                    )
                  }
                  className="px-2 py-0.5 rounded border border-black bg-white dark:bg-[#1c241f] text-black dark:text-white hover:bg-[#ffe17c] transition-colors cursor-pointer"
                >
                  Gaming & Coins
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyMarqueeTemplate(
                      '🎟️ Discount vouchers available now at the store counter! Ask the cashier for 1-day and 7-day passes.'
                    )
                  }
                  className="px-2 py-0.5 rounded border border-black bg-white dark:bg-[#1c241f] text-black dark:text-white hover:bg-[#ffe17c] transition-colors cursor-pointer"
                >
                  Counter Vouchers
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, announcement: '' }))}
                  className="px-2 py-0.5 rounded border border-black bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-200 hover:bg-rose-200 transition-colors cursor-pointer"
                  title="Clear text to hide the marquee ticker"
                >
                  Clear (Hide)
                </button>
              </div>
            </div>

            <textarea
              rows={3}
              value={formData.announcement}
              onChange={(e) => setFormData({ ...formData, announcement: e.target.value })}
              placeholder="e.g. ⚡ Fast Fiber Wi-Fi • Low Ping for Gaming & Browsing! • Coins: ₱1, ₱5, ₱10, ₱20 accepted"
              className="w-full rounded-xl border-2 border-black bg-white dark:bg-[#1c241f] p-3 text-xs font-bold text-black dark:text-white shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="mt-1 text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
              Leave empty to automatically hide the top announcement ticker. Text animates continuously from right to left.
            </p>
          </div>
        </div>

        {/* Section 3: Portal Features & Coin Simulator Widget */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] space-y-4 shadow-neo-sm">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-black dark:text-white font-display">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Captive Portal Widgets & Test Features</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Coin Simulator Toggle */}
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Coin Slot Test Simulator Buttons
              </label>
              <select
                value={formData.show_coin_simulator}
                onChange={(e) => setFormData({ ...formData, show_coin_simulator: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="true">Visible (+₱1, +₱5, +₱10 Test Buttons on Portal)</option>
                <option value="false">Hidden (Production Machine — Physical Coins Only)</option>
              </select>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                {formData.show_coin_simulator === 'true'
                  ? 'Simulator buttons appear on the portal so you can test coin drops without a real coin acceptor.'
                  : 'Recommended for live operation so customers cannot simulate free coins.'}
              </p>
            </div>

            {/* Customer Access Domain info */}
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1.5">
                Customer Direct Domain
              </label>
              <div className="p-2 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black text-xs font-mono font-black text-black dark:text-[#ffe17c] flex items-center justify-between shadow-neo-sm">
                <span>http://wifi.local</span>
                <Badge variant="primary">DEFAULT</Badge>
              </div>
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                Resolved by OpenWrt dnsmasq to lead straight to this portal.
              </p>
            </div>
          </div>
        </div>

        {/* Submit & Save Button Bar */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-500">
            <Info className="w-4 h-4" />
            <span>Changes take effect immediately on next portal load or client refresh.</span>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSaving}
            className="gap-2 px-6 font-black shadow-neo"
          >
            <Save className="w-4 h-4" />
            <span>Save UI & Branding</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
