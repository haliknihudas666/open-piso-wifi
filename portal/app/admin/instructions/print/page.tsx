'use client';

import React, { useState, useEffect, Suspense } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  Download,
  Languages,
  Wifi,
  Coins,
  Sparkles,
  Copy,
  Smartphone,
  CheckCircle2,
  FileText,
  LayoutGrid,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { DynamicPortalPhoneMockup } from '@/components/portal/DynamicPortalPhoneMockup';
import {
  PosterConfig,
  PosterLanguage,
  PosterFormat,
  PosterLayout,
  PosterVisualMode,
  DEFAULT_POSTER_CONFIG,
  POSTER_FORMATS,
  getPosterSteps,
  getSessionCodeNotice,
  generatePosterSvg,
  downloadPosterImage,
  downloadPosterSvg,
} from '@/lib/instruction-poster';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function PrintableInstructionsContent() {
  const searchParams = useSearchParams();
  const urlLang = searchParams.get('lang') as PosterLanguage | null;
  const urlFormat = searchParams.get('format') as PosterFormat | null;
  const urlMode = searchParams.get('mode') as PosterVisualMode | null;
  const urlLayout = searchParams.get('layout') as PosterLayout | null;

  const { data: settingsData } = useSWR('/api/admin/settings', fetcher);
  const { data: wifiData } = useSWR('/api/admin/router/wifi', fetcher);

  const [config, setConfig] = useState<PosterConfig>({
    ...DEFAULT_POSTER_CONFIG,
    language: urlLang || 'taglish',
    format: urlFormat || 'a4-portrait',
    layout: urlLayout || 'grid-2col',
    visualMode: urlMode || 'dynamic-phone',
  });

  const [activeSettingsTab, setActiveSettingsTab] = useState<'layout' | 'content' | 'all'>('layout');
  const [isExporting, setIsExporting] = useState<string | null>(null);

  useEffect(() => {
    if (settingsData || wifiData) {
      const ssid2g =
        wifiData?.ssid2g ||
        settingsData?.portal_title ||
        'NiconielletPisoWifi';
      const ssid5g =
        wifiData?.ssid5g ||
        (wifiData?.isUnified ? ssid2g : `${ssid2g}_5G`) ||
        'NiconielletPisoWifi_5G';
      const title = settingsData?.portal_title || 'Niconiellet Piso Wifi';
      const portalIp = settingsData?.portal_ip || '10.0.0.1';

      setConfig((prev) => ({
        ...prev,
        title: title.includes('Piso') ? title : `${title} Piso Wifi`,
        ssid2g,
        ssid5g: wifiData?.isUnified ? ssid2g : ssid5g,
        portalIp,
      }));
    }
  }, [settingsData, wifiData]);


  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async (format: 'jpeg' | 'png') => {
    setIsExporting(format);
    try {
      const svg = generatePosterSvg(config);
      const filename = `${config.title.toLowerCase().replace(/\s+/g, '-')}-${config.language}-${config.visualMode}-${config.layout}-${config.format}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      await downloadPosterImage(svg, filename, format, 2);
    } catch (e: any) {
      alert('Export failed: ' + e.message);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadSvg = () => {
    const svg = generatePosterSvg(config);
    const filename = `${config.title.toLowerCase().replace(/\s+/g, '-')}-${config.language}-${config.visualMode}-${config.layout}-${config.format}.svg`;
    downloadPosterSvg(svg, filename);
  };

  const stepsTaglish = getPosterSteps('taglish', config);
  const stepsEnglish = getPosterSteps('english', config);
  const sessionNotice = getSessionCodeNotice(config.language === 'english' ? 'english' : 'taglish');

  const activeSteps =
    config.language === 'english' ? stepsEnglish : stepsTaglish;

  const ssidDisplay =
    config.ssid2g && config.ssid5g && config.ssid2g !== config.ssid5g
      ? `${config.ssid2g}  •  ${config.ssid5g}`
      : config.ssid2g || config.ssid5g;

  const gallerySteps = [
    { label: 'Portal Standby', state: 'standby' as const },
    { label: 'Insert Coin Active', state: 'active' as const },
    { label: 'Coins Credited', state: 'credited' as const },
    { label: 'Connected Popup', state: 'connected' as const },
    { label: 'Active Session & Code', state: 'session' as const },
  ];  const formatMeta = POSTER_FORMATS[config.format] || POSTER_FORMATS['a4-portrait'];
  const isLandscape = config.format === 'a4-landscape' || config.format === 'tarpaulin-horizontal';
  const isTentCard = config.format === 'tent-card';
  const cols = config.layout === 'vertical-stack' ? 1 : formatMeta.defaultCols;

  return (
    <div className="min-h-screen bg-white text-black print:p-0">
      {/* Floating Non-Printed Controls Toolbar & Options Panel */}
      <div className="max-w-5xl mx-auto my-4 rounded-2xl bg-[#f8f6ee] text-black border-3 border-black shadow-neo overflow-hidden print:hidden">
        {/* Top Header Bar with Navigation & Actions */}
        <div className="p-4 border-b-2 border-black flex flex-wrap items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-white border-2 border-black text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              title="Return to Admin"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-sm sm:text-base font-black text-black font-display flex items-center gap-2">
                <Printer className="w-4 h-4 text-black" />
                <span>Customer Wi-Fi Connection Guide</span>
                <span className="text-xs font-mono font-bold bg-[#ffe17c] px-2 py-0.5 rounded border border-black">
                  {formatMeta.name}
                </span>
              </h1>
              <p className="text-xs text-neutral-600 font-medium">
                {formatMeta.description} · {formatMeta.dimensions}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Download JPEG */}
            <button
              type="button"
              onClick={() => handleDownload('jpeg')}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black border-2 border-black font-black text-xs shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting === 'jpeg' ? 'Saving...' : 'JPEG'}</span>
            </button>

            {/* Download Vector SVG */}
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black border-2 border-black font-black text-xs shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
              title="Download Vector SVG (ideal for tarpaulin printing)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SVG Vector</span>
            </button>

            {/* Direct Print */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black font-black text-xs shadow-neo hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Now</span>
            </button>
          </div>
        </div>

        {/* Options Panel (Clean Tabs) */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Tab Navigation Pill Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black/10 pb-3">
            <div className="inline-flex items-center gap-1.5 bg-neutral-200/70 p-1 rounded-xl border-2 border-black">
              <button
                type="button"
                onClick={() => setActiveSettingsTab('layout')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeSettingsTab === 'layout'
                    ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                    : 'text-neutral-700 hover:bg-white/40'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>1. Format, Sizing & Style</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsTab('content')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeSettingsTab === 'content'
                    ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                    : 'text-neutral-700 hover:bg-white/40'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>2. Wi-Fi & Content Details</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsTab('all')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeSettingsTab === 'all'
                    ? 'bg-black text-white border-2 border-black shadow-neo-sm'
                    : 'text-neutral-600 hover:bg-white/40'
                }`}
              >
                <span>Show All</span>
              </button>
            </div>

            {/* Active Format Pill Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border-2 border-black shadow-neo-sm text-xs font-black text-black">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{formatMeta.badgeText}</span>
            </div>
          </div>

          {/* Tab 1: Format, Sizing & Style */}
          {(activeSettingsTab === 'layout' || activeSettingsTab === 'all') && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* 1. Format & Sizing */}
              <div className="p-3 bg-white border-2 border-black rounded-xl shadow-neo-sm space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-black" />
                    <span>Format & Sizing</span>
                  </span>
                  <span className="text-[10px] font-mono font-black text-emerald-600">
                    {formatMeta.dimensions}
                  </span>
                </label>
                <select
                  value={config.format}
                  onChange={(e) =>
                    setConfig({ ...config, format: e.target.value as PosterFormat })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border-2 border-black bg-[#f8f6ee] text-xs font-bold text-black"
                >
                  <option value="a4-portrait">📄 A4 Paper (Portrait · 210×297mm)</option>
                  <option value="a4-landscape">📄 A4 Paper (Landscape · 297×210mm)</option>
                  <option value="tarpaulin-vertical">🚩 Tarpaulin Vertical (2×3 ft / 24×36 in)</option>
                  <option value="tarpaulin-horizontal">🚩 Tarpaulin Horizontal (4×2 ft / 6×3 ft)</option>
                  <option value="tent-card">🏷️ Table Tent Card / Counter Sticker (5×7 in)</option>
                </select>
              </div>

              {/* 2. Visual Mode Selector */}
              <div className="p-3 bg-white border-2 border-black rounded-xl shadow-neo-sm space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-black" />
                    <span>Visual Style</span>
                  </span>
                  <span className="text-[9px] font-mono text-emerald-600 font-black">
                    {config.visualMode === 'dynamic-phone' ? 'Dynamic' : config.visualMode === 'raw-components' ? 'Raw UI' : 'Vector'}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'dynamic-phone', label: '📱 Phone' },
                    { id: 'raw-components', label: '💻 Raw UI' },
                    { id: 'illustrated', label: '🎨 Vector' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setConfig({ ...config, visualMode: mode.id as PosterVisualMode })}
                      className={`py-1.5 px-1 rounded-lg border-2 text-[10px] font-black transition-all cursor-pointer text-center ${
                        config.visualMode === mode.id
                          ? 'bg-[#ffe17c] text-black border-black shadow-neo-sm'
                          : 'border-transparent text-neutral-600 hover:bg-black/5'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Poster Layout Toggle */}
              <div className="p-3 bg-white border-2 border-black rounded-xl shadow-neo-sm space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5 text-black" />
                    <span>Poster Layout</span>
                  </span>
                  <span className="text-[9px] font-mono text-emerald-600 font-black">
                    {config.layout === 'grid-2col' ? (isLandscape ? '3-Col Grid' : '2-Col Grid') : 'Vertical Stack'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, layout: 'grid-2col' })}
                    className={`py-1.5 px-1 rounded-lg border-2 text-[10px] font-black transition-all cursor-pointer text-center ${
                      config.layout === 'grid-2col'
                        ? 'bg-[#ffe17c] text-black border-black shadow-neo-sm'
                        : 'border-transparent text-neutral-600 hover:bg-black/5'
                    }`}
                  >
                    ⊞ {isLandscape ? 'Grid 3-Col' : 'Grid 2-Col'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, layout: 'vertical-stack' })}
                    className={`py-1.5 px-1 rounded-lg border-2 text-[10px] font-black transition-all cursor-pointer text-center ${
                      config.layout === 'vertical-stack'
                        ? 'bg-[#ffe17c] text-black border-black shadow-neo-sm'
                        : 'border-transparent text-neutral-600 hover:bg-black/5'
                    }`}
                  >
                    ☰ Vertical
                  </button>
                </div>
              </div>

              {/* 4. Language & Accent */}
              <div className="p-3 bg-white border-2 border-black rounded-xl shadow-neo-sm space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-black" />
                    <span>Language / Wika</span>
                  </span>
                  <div className="flex items-center gap-1">
                    {[
                      { color: '#ffe17c', title: 'Yellow' },
                      { color: '#4ade80', title: 'Green' },
                      { color: '#38bdf8', title: 'Cyan' },
                      { color: '#fb923c', title: 'Orange' },
                    ].map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => setConfig({ ...config, accentColor: c.color })}
                        title={c.title}
                        className={`w-3.5 h-3.5 rounded-full border border-black cursor-pointer transition-transform ${
                          config.accentColor === c.color ? 'scale-125 ring-1 ring-black' : ''
                        }`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['taglish', 'english', 'dual'] as PosterLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setConfig({ ...config, language: lang })}
                      className={`py-1.5 px-1 rounded-lg border-2 text-[10px] font-black capitalize transition-all cursor-pointer text-center ${
                        config.language === lang
                          ? 'bg-[#ffe17c] text-black border-black shadow-neo-sm'
                          : 'border-transparent text-neutral-600 hover:bg-black/5'
                      }`}
                    >
                      {lang === 'dual' ? 'Dual' : lang}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Wi-Fi & Content Details */}
          {(activeSettingsTab === 'content' || activeSettingsTab === 'all') && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                    2.4GHz Wi-Fi SSID
                  </label>
                  <Input
                    value={config.ssid2g}
                    onChange={(e) => setConfig({ ...config, ssid2g: e.target.value })}
                    placeholder="2.4GHz SSID"
                    className="text-xs font-mono h-8 bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                    5GHz High-Speed SSID
                  </label>
                  <Input
                    value={config.ssid5g}
                    onChange={(e) => setConfig({ ...config, ssid5g: e.target.value })}
                    placeholder="5GHz SSID"
                    className="text-xs font-mono h-8 bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                    Portal / Machine Title
                  </label>
                  <Input
                    value={config.title}
                    onChange={(e) => setConfig({ ...config, title: e.target.value })}
                    placeholder="e.g. Hudas Piso Wifi"
                    className="text-xs h-8 bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                    Portal IP / Address
                  </label>
                  <Input
                    value={config.portalIp}
                    onChange={(e) => setConfig({ ...config, portalIp: e.target.value })}
                    placeholder="10.0.0.1"
                    className="text-xs font-mono h-8 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                    Rates & Pricing Display
                  </label>
                  <Input
                    value={config.ratesText}
                    onChange={(e) => setConfig({ ...config, ratesText: e.target.value })}
                    placeholder="₱1 = 10 Mins • ₱5 = 1 Hour • ₱10 = 2.5 Hours • ₱20 = 6 Hours"
                    className="text-xs h-8 bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                    Store Note
                  </label>
                  <Input
                    value={config.storeNote}
                    onChange={(e) => setConfig({ ...config, storeNote: e.target.value })}
                    placeholder="Para sa katanungan o vouchers, lumapit lamang sa tindahan."
                    className="text-xs h-8 bg-white"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-black/10">
                <label className="flex items-center gap-2 text-xs font-bold text-black cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.showPhoneGallery}
                    onChange={(e) => setConfig({ ...config, showPhoneGallery: e.target.checked })}
                    className="w-4 h-4 rounded border-2 border-black text-black accent-[#ffe17c]"
                  />
                  <span>Show Phone Flow Gallery</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-black cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.showRates}
                    onChange={(e) => setConfig({ ...config, showRates: e.target.checked })}
                    className="w-4 h-4 rounded border-2 border-black text-black accent-[#ffe17c]"
                  />
                  <span>Show Rates Strip</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-black cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.showSessionCodeTip}
                    onChange={(e) => setConfig({ ...config, showSessionCodeTip: e.target.checked })}
                    className="w-4 h-4 rounded border-2 border-black text-black accent-[#ffe17c]"
                  />
                  <span>Show Session Code Tip</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Printable Sheet View */}
      <div className={`w-full ${formatMeta.containerClass} mx-auto p-4 sm:p-8 print:p-0 print:max-w-none print:w-full transition-all duration-300`}>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                @page {
                  size: ${formatMeta.printSize};
                  margin: ${isTentCard ? '4mm' : '6mm'};
                }
                body {
                  background: #ffffff !important;
                  color: #000000 !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
            `,
          }}
        />
        <div
          className={`border-4 border-black ${formatMeta.borderStyle} rounded-3xl p-5 sm:p-7 bg-[#f7f5ed] relative print:border-none print:rounded-none print:p-1 print:shadow-none`}
          style={{
            backgroundImage:
              'radial-gradient(rgba(0, 0, 0, 0.12) 1.5px, transparent 1.5px)',
            backgroundSize: '20px 20px',
          }}
        >
          {/* Table Tent Card fold guide marker */}
          {isTentCard && (
            <div className="mb-4 py-2 px-4 rounded-xl border-2 border-dashed border-black/40 bg-white/70 text-center font-mono font-black text-xs text-black flex items-center justify-center gap-2 print:block">
              <span>✂ - - -</span>
              <span>FOLD HERE FOR 5×7" ACRYLIC TABLE TENT STAND</span>
              <span>- - - ✂</span>
            </div>
          )}
          {/* Header Hero Banner */}
          <div
            className="p-4 sm:p-5 print:p-2.5 rounded-2xl border-3 border-black shadow-neo mb-4 print:mb-2 relative overflow-hidden"
            style={{ backgroundColor: config.accentColor }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 print:w-10 print:h-10 rounded-2xl bg-white border-2 sm:border-3 border-black shadow-neo-sm flex items-center justify-center shrink-0">
                  <Wifi className="w-7 h-7 sm:w-8 sm:h-8 print:w-6 print:h-6 text-black stroke-[2.5]" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl print:text-lg font-black font-display tracking-tight text-black uppercase leading-tight">
                    {config.title}
                  </h1>
                  <p className="text-xs sm:text-sm print:text-[11px] font-bold text-black/85 mt-0.5">
                    {config.tagline}
                  </p>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-black text-white font-black text-[11px] print:text-[9px] tracking-wider uppercase">
                    <span>
                      {config.language === 'english'
                        ? 'HOW TO CONNECT IN 5 EASY STEPS'
                        : 'PAANO KUMONEKTA SA 5 MADALING HAKBANG'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fast Badges */}
              <div className="bg-white/95 rounded-xl border-2 border-black p-2.5 print:p-1.5 text-[10.5px] print:text-[8px] font-black space-y-1 print:space-y-0.5 shadow-neo-sm shrink-0">
                <div className="flex items-center gap-1.5 text-black">
                  <Sparkles className="w-3.5 h-3.5 print:w-3 print:h-3 text-black" />
                  <span>HIGH-SPEED FIBER WI-FI</span>
                </div>
                <div className="flex items-center gap-1.5 text-black">
                  <Smartphone className="w-3.5 h-3.5 print:w-3 print:h-3 text-black" />
                  <span>LOW PING GAMING</span>
                </div>
                <div className="flex items-center gap-1.5 text-black">
                  <Coins className="w-3.5 h-3.5 print:w-3 print:h-3 text-black" />
                  <span>ACCEPTS ₱1, ₱5, ₱10, ₱20 COINS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rates strip */}
          {config.showRates && (
            <div className="mb-4 print:mb-2 p-2.5 print:p-1.5 rounded-xl bg-white border-2 sm:border-3 border-black shadow-neo flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-black text-white text-[10px] print:text-[8.5px] font-black tracking-widest uppercase">
                  RATES / PRESYO
                </span>
                <span className="text-xs sm:text-sm print:text-[11px] font-extrabold text-black">
                  {config.ratesText}
                </span>
              </div>
              <div className="text-[10px] print:text-[8.5px] font-bold text-neutral-600">
                ⚡ Automatic timer deduction per minute
              </div>
            </div>
          )}

          {/* Optional 5-Screen Phone Flow Gallery (Hidden on print to preserve single-page fit) */}
          {config.showPhoneGallery && (
            <div className="mb-4 p-3.5 rounded-2xl bg-white border-3 border-black shadow-neo print:hidden">
              <div className="flex items-center justify-between mb-2.5 border-b-2 border-black/10 pb-1.5">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-black" />
                  <span className="text-xs font-black uppercase tracking-wider text-black">
                    {config.language === 'english'
                      ? 'Actual Smartphone Captive Portal Flow'
                      : 'Aktwal na Screenshot sa Cellphone (Step-by-Step Flow)'}
                  </span>
                </div>
                <span className="text-[10px] font-black text-neutral-500">Live Captive Portal</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {gallerySteps.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center bg-[#f8f6ee] p-2 rounded-xl border-2 border-black shadow-neo-sm overflow-hidden"
                  >
                    <div className="w-full flex items-center justify-between text-[10px] font-black mb-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-black text-white">#{idx + 1}</span>
                      <span className="truncate text-neutral-700 font-bold">{item.label}</span>
                    </div>

                    <div className="w-full flex justify-center">
                      <DynamicPortalPhoneMockup
                        state={item.state}
                        title={config.title}
                        ssid={ssidDisplay}
                        portalIp={config.portalIp}
                        rateText={config.ratesText.split('•')[0]?.trim() || '₱1 = 10 Minutes'}
                        compact={true}
                        className="w-[110px] max-w-full shadow-none border-2 p-0.5 shrink-0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* LAYOUT A: 2-COLUMN GRID (1 - 2, 3 - 4, 5 - 6)                  */}
          {/* ============================================================== */}
          {config.layout === 'grid-2col' ? (
            <div className={`grid gap-3.5 print:gap-2 ${cols === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3' : cols === 1 ? 'grid-cols-1 print:grid-cols-1' : 'grid-cols-1 md:grid-cols-2 print:grid-cols-2'}`}>
              {activeSteps.map((step, idx) => {
                const enStep = stepsEnglish[idx];
                const isStepTwo = idx === 1;
                const isStepFive = idx === 4;

                const stepPhoneState: 'standby' | 'active' | 'credited' | 'connected' | 'session' =
                  idx === 0
                    ? 'standby'
                    : idx === 1
                      ? 'active'
                      : idx === 2
                        ? 'credited'
                        : idx === 3
                          ? 'connected'
                          : 'session';

                return (
                  <div
                    key={step.stepNum}
                    className={`p-3 sm:p-3.5 print:p-2 rounded-2xl border-3 border-black shadow-neo bg-white relative break-inside-avoid flex flex-col justify-between gap-2.5 ${
                      isStepTwo ? 'bg-amber-50/60' : isStepFive ? 'bg-emerald-50/60' : 'bg-white'
                    }`}
                  >
                    {/* Header: Badge, Title & Subtitle */}
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 print:w-6.5 print:h-6.5 rounded-xl border-2 sm:border-3 border-black shadow-neo-sm flex items-center justify-center font-black text-sm sm:text-base print:text-[11px] shrink-0 ${
                          isStepTwo
                            ? 'bg-[#ffe17c] text-black'
                            : isStepFive
                              ? 'bg-[#4ade80] text-black'
                              : 'bg-black text-white'
                        }`}
                      >
                        {step.stepNum}
                      </div>

                      <div className="space-y-0.5 flex-1 min-w-0">
                        <h3 className="text-xs sm:text-sm print:text-[11.5px] font-black text-black font-display tracking-tight leading-tight">
                          {step.title}
                        </h3>
                        {step.subtitle && (
                          <span className="text-[9.5px] print:text-[8px] font-bold text-neutral-500 uppercase tracking-tight block">
                            • {step.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body: Instructions on Left, Visual Mockup on Right */}
                    <div className="flex flex-row items-center justify-between gap-2 flex-1">
                      <div className="text-[10.5px] sm:text-xs print:text-[8.5px] font-semibold text-neutral-800 space-y-1 flex-1 min-w-0 leading-tight">
                        {step.instructions.map((line, lIdx) => (
                          <p key={lIdx} className="leading-tight">
                            {line}
                          </p>
                        ))}
                        {config.language === 'dual' && enStep && (
                          <div className="pt-0.5 text-[9.5px] print:text-[7.5px] font-medium text-neutral-500 border-t border-black/10 mt-0.5 italic">
                            <span className="font-bold text-neutral-700 not-italic">EN: </span>
                            {enStep.instructions.join(' ')}
                          </div>
                        )}
                      </div>

                      {/* Visual Mockup (Fixed 9:16 smartphone ratio) */}
                      <div className="shrink-0 flex justify-center items-center">
                        {config.visualMode === 'dynamic-phone' ? (
                          <DynamicPortalPhoneMockup
                            state={stepPhoneState}
                            title={config.title}
                            ssid={ssidDisplay}
                            portalIp={config.portalIp}
                            rateText={config.ratesText.split('•')[0]?.trim() || '₱1 = 10 Minutes'}
                            compact={true}
                            className="w-[110px] sm:w-[125px] print:w-[100px] shadow-none border-2 p-0.5 shrink-0 self-center"
                          />
                        ) : config.visualMode === 'raw-components' ? (
                          <div className="w-[115px] sm:w-[130px] print:w-[105px]">
                            {idx === 0 && (
                              <div className="p-2 rounded-xl border-2 border-black bg-white shadow-neo-sm space-y-1">
                                <span className="font-extrabold text-[9.5px] text-black font-mono block truncate">
                                  {ssidDisplay}
                                </span>
                                <div className="p-0.5 rounded bg-neutral-100 border border-black text-[8px] font-mono flex justify-between">
                                  <span>URL:</span>
                                  <span className="font-bold">{config.portalIp}</span>
                                </div>
                              </div>
                            )}
                            {idx === 1 && (
                              <div className="p-2 rounded-xl border-2 border-black bg-white shadow-neo-sm space-y-1 text-center">
                                <div className="py-1 px-1.5 rounded-lg bg-[#ffe17c] border border-black text-black font-black text-[9.5px] flex items-center justify-center gap-1">
                                  <Coins className="w-3 h-3" />
                                  <span>Start Coin</span>
                                </div>
                              </div>
                            )}
                            {idx === 2 && (
                              <div className="p-2 rounded-xl border-2 border-black bg-white shadow-neo-sm text-center space-y-0.5">
                                <span className="text-[7.5px] font-bold text-neutral-500 uppercase block">COINS</span>
                                <div className="text-lg font-black font-mono text-black leading-tight">₱1</div>
                                <div className="py-0.2 px-1 rounded bg-[#ffe17c] border border-black font-black text-[8.5px]">
                                  10 mins
                                </div>
                              </div>
                            )}
                            {idx === 3 && (
                              <div className="p-2 rounded-xl border-2 border-black bg-neutral-100 shadow-neo-sm text-center space-y-1">
                                <div className="py-1.5 px-2 rounded-lg bg-black text-white font-black text-[9.5px] flex items-center justify-center gap-1">
                                  <Sparkles className="w-3 h-3 text-[#ffe17c]" />
                                  <span>Connect ➔</span>
                                </div>
                              </div>
                            )}
                            {idx === 4 && (
                              <div className="p-2 rounded-xl border-2 border-black bg-[#4ade80] shadow-neo-sm text-center space-y-1">
                                <div className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-white border border-black text-[7.5px] font-black">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>ONLINE</span>
                                </div>
                                <div className="py-0.5 px-1 rounded bg-black text-white font-black text-[8.5px]">
                                  Connected!
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-2 rounded-xl border-2 border-black bg-[#f8f6ee] shadow-neo-sm text-center w-[105px]">
                            <Wifi className="w-3.5 h-3.5 text-black mx-auto mb-0.5" />
                            <span className="font-mono text-[8px] font-extrabold truncate block">{ssidDisplay}</span>
                            <span className="text-[8px] font-extrabold bg-[#ffe17c] px-1 py-0.5 rounded border border-black block mt-0.5">
                              {step.highlight}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Card 6: Session Code Reminder / Transfer Time */}
              {config.showSessionCodeTip && (
                <div className="p-3 sm:p-3.5 print:p-2 rounded-2xl border-3 border-black shadow-neo bg-[#c084fc]/15 relative break-inside-avoid flex flex-col justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 print:w-6.5 print:h-6.5 rounded-xl border-2 sm:border-3 border-black shadow-neo-sm flex items-center justify-center font-black text-sm sm:text-base print:text-[11px] shrink-0 bg-[#c084fc] text-black">
                      6
                    </div>

                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-xs sm:text-sm print:text-[11.5px] font-black text-black font-display tracking-tight leading-tight">
                          {config.language === 'english'
                            ? 'Save Session Code!'
                            : 'I-save ang Session Code'}
                        </h3>
                        <span className="text-[8px] font-black px-1 py-0.2 rounded bg-[#c084fc] text-black border border-black uppercase">
                          ⭐ PRO-TIP
                        </span>
                      </div>
                      <span className="text-[9.5px] print:text-[8px] font-bold text-neutral-600 uppercase tracking-tight block">
                        • {config.language === 'english'
                          ? 'TRANSFER & RESUME TIME'
                          : 'MAHALAGANG PAALALA / PAALALA'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-row items-center justify-between gap-2 flex-1">
                    <div className="text-[10.5px] sm:text-xs print:text-[8.5px] font-semibold text-neutral-800 space-y-1 flex-1 min-w-0 leading-tight">
                      <p className="leading-tight">
                        {config.language === 'english'
                          ? 'Always copy or screenshot your SESSION CODE on your screen.'
                          : 'Kopyahin o i-screenshot ang inyong SESSION CODE sa screen.'}
                      </p>
                      <p className="leading-tight">
                        {config.language === 'english'
                          ? 'Switch Wi-Fi (2.4G ⇄ 5G), reboot phone, or transfer to PC:'
                          : 'Kung lumipat ng band (2.4G ⇄ 5G), restart, o ilipat sa PC:'}
                      </p>
                      <p className="leading-tight font-black text-black">
                        {config.language === 'english'
                          ? '✔ Paste code on portal to restore your remaining time!'
                          : '✔ I-paste ang code sa portal para magamit ulit ang oras!'}
                      </p>
                    </div>

                    <div className="shrink-0 flex justify-center items-center">
                      {config.visualMode === 'dynamic-phone' ? (
                        <DynamicPortalPhoneMockup
                          state="session"
                          title={config.title}
                          ssid={ssidDisplay}
                          portalIp={config.portalIp}
                          rateText={config.ratesText}
                          compact={true}
                          className="w-[110px] sm:w-[125px] print:w-[100px] shadow-none border-2 p-0.5 shrink-0 self-center"
                        />
                      ) : (
                        <div className="p-2 rounded-xl bg-white border-2 border-black shadow-neo-sm text-center w-[105px]">
                          <div className="text-[7.5px] font-black uppercase text-neutral-500">
                            SESSION CODE
                          </div>
                          <div className="text-[11px] font-black font-mono tracking-wider text-black my-0.5">
                            PW-GDQLWK
                          </div>
                          <div className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-[#ffe17c] border border-black font-black text-[7.5px] text-black">
                            <Copy className="w-2 h-2" />
                            <span>COPY</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* LAYOUT B: VERTICAL STACK (1 to 5 Stacked)                      */
            /* ============================================================== */
            <>
              <div className="space-y-4">
                {activeSteps.map((step, idx) => {
                  const enStep = stepsEnglish[idx];
                  const isStepTwo = idx === 1;
                  const isStepFive = idx === 4;

                  const stepPhoneState: 'standby' | 'active' | 'credited' | 'connected' | 'session' =
                    idx === 0
                      ? 'standby'
                      : idx === 1
                        ? 'active'
                        : idx === 2
                          ? 'credited'
                          : idx === 3
                            ? 'connected'
                            : 'session';

                  return (
                    <div
                      key={step.stepNum}
                      className={`p-4 sm:p-5 rounded-2xl border-3 border-black shadow-neo bg-white relative break-inside-avoid ${
                        isStepTwo ? 'bg-amber-50/50' : isStepFive ? 'bg-emerald-50/50' : 'bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5 sm:gap-4 flex-1">
                          <div
                            className={`w-11 h-11 sm:w-13 sm:h-13 rounded-2xl border-3 border-black shadow-neo-sm flex items-center justify-center font-black text-lg sm:text-xl shrink-0 ${
                              isStepTwo
                                ? 'bg-[#ffe17c] text-black'
                                : isStepFive
                                  ? 'bg-[#4ade80] text-black'
                                  : 'bg-black text-white'
                            }`}
                          >
                            {step.stepNum}
                          </div>

                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base sm:text-lg font-black text-black font-display tracking-tight">
                                {step.title}
                              </h3>
                              {step.subtitle && (
                                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
                                  • {step.subtitle}
                                </span>
                              )}
                            </div>

                            <div className="text-xs sm:text-sm font-semibold text-neutral-800 space-y-1">
                              {step.instructions.map((line, lIdx) => (
                                <p key={lIdx} className="leading-snug">
                                  {line}
                                </p>
                              ))}
                            </div>

                            {config.language === 'dual' && enStep && (
                              <div className="pt-1 text-[11px] font-medium text-neutral-500 border-t border-black/10 mt-1 italic">
                                <span className="font-bold text-neutral-700 not-italic">EN: </span>
                                {enStep.instructions.join(' ')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="w-full sm:w-auto sm:min-w-[240px] shrink-0 flex justify-center">
                          {config.visualMode === 'dynamic-phone' ? (
                            <DynamicPortalPhoneMockup
                              state={stepPhoneState}
                              title={config.title}
                              ssid={ssidDisplay}
                              portalIp={config.portalIp}
                              rateText={config.ratesText.split('•')[0]?.trim() || '₱1 = 10 Minutes'}
                              compact={false}
                              className="w-[230px] sm:w-[260px]"
                            />
                          ) : (
                            <div className="p-3 rounded-xl border-2 border-black bg-[#f8f6ee] shadow-neo-sm space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Wifi className="w-4 h-4 text-black" />
                                <span className="text-xs font-extrabold text-black font-mono truncate">
                                  {ssidDisplay}
                                </span>
                              </div>
                              <div className="p-1 rounded bg-white border border-black text-[10px] font-mono text-neutral-700 flex items-center justify-between">
                                <span>Action:</span>
                                <span className="font-extrabold text-black bg-[#ffe17c] px-1 rounded">
                                  {step.highlight}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Session Code Notice (Vertical mode banner) */}
              {config.showSessionCodeTip && (
                <div className="mt-6 p-5 sm:p-6 rounded-2xl bg-[#c084fc]/15 border-3 border-black shadow-neo-lg break-inside-avoid">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#c084fc] text-black font-black text-xs uppercase border-2 border-black shadow-neo-sm">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {config.language === 'english'
                            ? '⭐ CRITICAL PRO-TIP: SAVE YOUR TIME'
                            : '⭐ MAHALAGANG PAALALA: I-SAVE ANG ORAS MO'}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-black text-black font-display">
                        {config.language === 'english'
                          ? 'Always Copy or Screenshot your SESSION TRANSFER CODE!'
                          : 'Kopyahin o i-screenshot ang inyong SESSION TRANSFER CODE!'}
                      </h4>

                      <p className="text-xs sm:text-sm font-semibold text-neutral-800 leading-snug">
                        {config.language === 'english'
                          ? 'If you switch between 2.4GHz & 5GHz Wi-Fi, restart your phone, or want to transfer your remaining minutes to another laptop or device — just enter this code under "Voucher or Transfer Code" on the portal to resume your session without losing minutes!'
                          : 'Kung magpalit ka ng Wi-Fi band (2.4G ⇄ 5G), mag-restart ang phone, o ilipat ang natitirang oras sa ibang cellphone o PC — i-paste lang ang code sa "Voucher or Transfer Code" box para magamit ulit ang oras nang hindi nasasayang!'}
                      </p>
                    </div>

                    {config.visualMode === 'dynamic-phone' ? (
                      <DynamicPortalPhoneMockup
                        state="session"
                        title={config.title}
                        ssid={ssidDisplay}
                        portalIp={config.portalIp}
                        rateText={config.ratesText}
                        compact={true}
                        className="w-[180px] sm:w-[200px] shrink-0"
                      />
                    ) : (
                      <div className="p-3 rounded-xl bg-white border-2 border-black shadow-neo text-center shrink-0 w-full sm:w-auto">
                        <div className="text-[9px] font-black uppercase text-neutral-500 tracking-wider">
                          SESSION TRANSFER CODE
                        </div>
                        <div className="text-xl font-black font-mono tracking-widest text-black my-0.5">
                          PW-GDQLWK
                        </div>
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#ffe17c] border border-black font-black text-[10px] text-black">
                          <Copy className="w-3 h-3" />
                          <span>COPY CODE</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-4 print:mt-2.5 pt-3 print:pt-2 border-t-2 border-dashed border-black/30 flex items-center justify-between text-xs print:text-[10px] font-bold text-neutral-600">
            <span>💬 {config.storeNote}</span>
            <span className="font-mono text-neutral-800 font-extrabold">
              SSID: {ssidDisplay}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintableInstructionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center font-bold text-neutral-500">
          Loading printable guide...
        </div>
      }
    >
      <PrintableInstructionsContent />
    </Suspense>
  );
}
