'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap,
  Check,
  Copy,
  Terminal,
  ExternalLink,
  Shield,
  Layers,
  ArrowRight,
  Wifi,
  Coins,
  Cpu,
  RefreshCw,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Star,
  ChevronDown,
  ShoppingBag,
  Cable,
  Flame,
  Radio,
  Server,
  Smartphone,
  Lock,
  Menu,
  X,
} from 'lucide-react';

export default function LandingPage() {
  // --- Dynamic Version State ---
  const [version, setVersion] = useState('v1.0.0');
  const [isLiveVersion, setIsLiveVersion] = useState(false);
  const [versionSource, setVersionSource] = useState('');

  // --- Mobile Navigation Menu State ---
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- Build Switcher State ---
  const [activeBuild, setActiveBuild] = useState<1 | 2 | 3>(1);

  // --- Copy Snippet State ---
  const [isCopied, setIsCopied] = useState(false);

  // --- Live Simulator State ---
  const [simRemainingSeconds, setSimRemainingSeconds] = useState(0);
  const [simTotalCoins, setSimTotalCoins] = useState(0);
  const [simIsPaused, setSimIsPaused] = useState(false);
  const [simLog, setSimLog] = useState('Waiting for coinslot pulse train...');

  // --- 1. Fetch Version from GitHub ---
  useEffect(() => {
    async function loadVersion() {
      const REPO = 'haliknihudas666/open-piso-wifi';
      let detectedVersion: string | null = null;
      let sourceName = '';

      // Try 1: GitHub Releases API
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.tag_name) {
            detectedVersion = data.tag_name;
            sourceName = 'GitHub Releases';
          }
        }
      } catch {
        // Fallback
      }

      // Try 2: GitHub Tags API
      if (!detectedVersion) {
        try {
          const res = await fetch(`https://api.github.com/repos/${REPO}/tags`, {
            headers: { Accept: 'application/vnd.github.v3+json' },
          });
          if (res.ok) {
            const tags = await res.json();
            if (Array.isArray(tags) && tags.length > 0 && tags[0].name) {
              detectedVersion = tags[0].name;
              sourceName = 'GitHub Tags';
            }
          }
        } catch {
          // Fallback
        }
      }

      // Try 3: Raw version.json
      if (!detectedVersion) {
        for (const branch of ['main', 'master']) {
          try {
            const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${branch}/version.json`);
            if (res.ok) {
              const data = await res.json();
              if (data?.version || data?.systemVersion) {
                detectedVersion = data.version || data.systemVersion;
                sourceName = `GitHub Raw (${branch})`;
                break;
              }
            }
          } catch {
            // Next branch
          }
        }
      }

      // Try 4: Local version.json
      if (!detectedVersion) {
        try {
          const res = await fetch('/version.json');
          if (res.ok) {
            const data = await res.json();
            if (data?.version || data?.systemVersion) {
              detectedVersion = data.version || data.systemVersion;
              sourceName = 'Static version.json';
            }
          }
        } catch {
          // Keep default
        }
      }

      if (detectedVersion) {
        const fmt = detectedVersion.startsWith('v') ? detectedVersion : `v${detectedVersion}`;
        setVersion(fmt);
        setIsLiveVersion(true);
        setVersionSource(sourceName);
      }
    }

    loadVersion();
  }, []);

  // --- 2. Simulator Countdown Interval ---
  useEffect(() => {
    if (simIsPaused || simRemainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setSimRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [simIsPaused, simRemainingSeconds]);

  // Format seconds to HH:MM:SS
  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const dropSimCoin = (amount: number, addedMinutes: number) => {
    setSimTotalCoins((prev) => prev + amount);
    setSimRemainingSeconds((prev) => prev + addedMinutes * 60);
    setSimIsPaused(false);
    const pulseCount = amount === 1 ? 1 : amount === 5 ? 5 : amount === 10 ? 10 : 20;
    setSimLog(`[ISR] +₱${amount} detected! Pulse train count: ${pulseCount} (300ms window) → Added: +${addedMinutes}m`);
  };

  const toggleSimPause = () => {
    if (simRemainingSeconds <= 0) return;
    setSimIsPaused((prev) => !prev);
    setSimLog(!simIsPaused
      ? '[SESSION] Timer paused. MAC address disconnected from kernel set.'
      : '[SESSION] Timer resumed. MAC address re-authorized.'
    );
  };

  const resetSim = () => {
    setSimRemainingSeconds(0);
    setSimTotalCoins(0);
    setSimIsPaused(false);
    setSimLog('Waiting for coinslot pulse train...');
  };

  const copyInstallerSnippet = () => {
    navigator.clipboard.writeText('curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash');
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f6f4ea] text-black overflow-x-clip w-full">

      {/* Top Announcement Bar */}
      <aside aria-label="Announcement" className="bg-black text-[#ffe17c] font-mono text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4 border-b-2 border-black flex flex-wrap items-center justify-center gap-1 sm:gap-2 font-bold tracking-wide text-center">
        <span>📢</span>
        <span>
          <strong>{version} RELEASED:</strong>{' '}
          <span className="hidden sm:inline">Multi-Architecture Support + Free Supabase Cloud Fleet Control &amp; ESP32 Satellites!</span>
          <span className="sm:hidden">Multi-Arch + Supabase Fleet!</span>
        </span>
        <a href="#architectures" className="underline hover:text-white ml-1 whitespace-nowrap">
          Builds →
        </a>
      </aside>

      {/* Sticky Top Navbar */}
      <header className="sticky top-0 z-50 bg-[#ffe17c] border-b-2 border-black px-3 sm:px-8 py-2.5 sm:py-3.5 neo-shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black rounded-lg sm:rounded-xl neo-border flex items-center justify-center text-[#ffe17c] neo-shadow-xs font-black text-base sm:text-xl shrink-0">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-black text-lg sm:text-2xl tracking-tight leading-none">OpenPisoWiFi</span>
                <span
                  className="px-1.5 py-0.5 sm:px-2 bg-black text-[#ffe17c] text-[9px] sm:text-[10px] font-black uppercase rounded tracking-wider flex items-center gap-1"
                  title={isLiveVersion ? `Synced live via ${versionSource}` : 'Default release tag'}
                >
                  <span>{version}</span>
                  {isLiveVersion && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live from GitHub" />
                  )}
                </span>
              </div>
              <p className="text-[11px] font-bold text-neutral-800 leading-none mt-1 hidden sm:block">
                Open-Source Hotspot &amp; Kiosk Gateway
              </p>
            </div>
          </div>

          <nav className="hidden xl:flex items-center gap-3.5 2xl:gap-5 font-bold text-xs 2xl:text-sm whitespace-nowrap">
            <a href="#architectures" className="hover:underline">Architectures</a>
            <a href="#simulator" className="hover:underline">Live Simulator</a>
            <a href="#cloud-fleet" className="hover:underline">Cloud Fleet</a>
            <a href="#features" className="hover:underline">Features</a>
            <a href="#compare" className="hover:underline">Comparison</a>
            <Link href="/build-guide" className="hover:underline font-black flex items-center gap-1">
              Build Guide <span className="text-[10px] bg-black text-[#ffe17c] px-1.5 py-0.2 rounded font-mono">NEW</span>
            </Link>
            <Link href="/flasher" className="hover:underline font-black flex items-center gap-1 text-emerald-800">
              ⚡ Web Flasher <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.2 rounded font-mono">USB</span>
            </Link>
            <a href="#contribute" className="hover:underline">Contribute</a>
            <a href="#faq" className="hover:underline">FAQ</a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <a
              href="https://github.com/haliknihudas666/open-piso-wifi"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-white text-black font-black text-xs sm:text-sm neo-border rounded-xl neo-shadow-xs btn-press flex items-center gap-1.5 shrink-0"
            >
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-500" />
              <span className="hidden md:inline">Star on</span>
              <span>GitHub</span>
            </a>
            <a
              href="#quickstart"
              className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-black text-[#ffe17c] font-black text-xs sm:text-sm neo-border rounded-xl neo-shadow-xs btn-press whitespace-nowrap shrink-0"
            >
              <span className="hidden sm:inline">⚡ 1-Click Install</span>
              <span className="sm:hidden">⚡ Install</span>
            </a>
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="xl:hidden w-8 h-8 sm:w-9 sm:h-9 bg-black text-[#ffe17c] rounded-xl neo-border flex items-center justify-center neo-shadow-xs btn-press shrink-0"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <Menu className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Collapsible Navigation Menu */}
        {mobileMenuOpen && (
          <div className="max-w-7xl mx-auto xl:hidden border-t-2 border-black mt-2.5 sm:mt-3.5 pt-3 pb-1 space-y-2">
            <nav className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-black text-xs sm:text-sm">
              <a
                href="#architectures"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>🚀 Architectures &amp; Builds</span>
                <span>→</span>
              </a>
              <a
                href="#simulator"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>● Live Simulator</span>
                <span>→</span>
              </a>
              <a
                href="#cloud-fleet"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>☁️ Supabase Cloud Fleet</span>
                <span>→</span>
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>🛡️ Features &amp; nftables</span>
                <span>→</span>
              </a>
              <a
                href="#compare"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>⚖️ Comparison Matrix</span>
                <span>→</span>
              </a>
              <Link
                href="/build-guide"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-[#ffe17c] neo-border rounded-xl neo-shadow-xs hover:bg-amber-300 flex items-center justify-between font-black"
              >
                <span>🛠️ Complete Build &amp; Wiring Manual</span>
                <span className="text-xs font-mono">PAGE ↗</span>
              </Link>
              <Link
                href="/flasher"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-emerald-100 neo-border rounded-xl neo-shadow-xs hover:bg-emerald-200 flex items-center justify-between font-black"
              >
                <span>⚡ 1-Click ESP32 Web Flasher</span>
                <span className="text-xs font-mono">USB ↗</span>
              </Link>
              <a
                href="#contribute"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>🤝 Contribute &amp; Hardware</span>
                <span>→</span>
              </a>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3.5 py-2.5 bg-white neo-border rounded-xl neo-shadow-xs hover:bg-amber-100 flex items-center justify-between"
              >
                <span>❓ FAQ</span>
                <span>→</span>
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="bg-[#ffe17c] border-b-2 border-black bg-dot-grid py-8 sm:py-20 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 items-center">

          {/* Left Column: Pitch & Installer */}
          <div className="lg:col-span-7 space-y-5 sm:space-y-6">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white neo-border rounded-full neo-shadow-xs text-[10px] sm:text-xs font-black">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>100% FREE &amp; OPEN-SOURCE<span className="hidden sm:inline"> • NO VENDOR LOCK-IN</span></span>
              </div>
              <a
                href="#contribute"
                className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-black text-[#ffe17c] neo-border rounded-full neo-shadow-xs text-[10px] sm:text-xs font-black hover:bg-neutral-800 transition-colors"
              >
                <span>🤝</span>
                <span>OPEN FOR HARDWARE TESTING</span>
              </a>
            </div>

            <h1 className="text-3xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08]">
              Free The Wi-Fi.<br />
              <span className="bg-black text-[#ffe17c] px-2.5 sm:px-3.5 py-1 inline-block -rotate-1 rounded-xl neo-shadow mt-1">
                Own The Revenue.
              </span>
            </h1>

            <p className="text-sm sm:text-xl font-medium text-neutral-800 max-w-xl leading-relaxed">
              The production-grade, MIT-licensed Piso-WiFi operating system. Built with <strong>Next.js</strong>, <strong>Linux nftables</strong> kernel routing, <strong>ESP32 satellite coinslots</strong>, and free <strong>Supabase</strong> multi-branch fleet control.
            </p>

            {/* 1-Click Installer Box */}
            <div className="p-3.5 sm:p-5 bg-black text-white neo-border rounded-2xl neo-shadow-lg space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-neutral-300 font-mono">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate">⚡ 1-Line Installer (Raspberry Pi &amp; Linux)</span>
                </span>
                <span className="text-emerald-400 font-bold shrink-0 ml-2">curl | bash</span>
              </div>
              <div className="flex items-center justify-between bg-neutral-900 border border-neutral-700 p-2 sm:p-3 rounded-xl font-mono text-[11px] sm:text-sm text-amber-300 gap-2">
                <code className="truncate select-all">
                  curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash
                </code>
                <button
                  onClick={copyInstallerSnippet}
                  className="px-2.5 sm:px-3.5 py-1.5 bg-[#ffe17c] text-black font-black text-xs rounded-lg hover:bg-amber-300 transition-colors shrink-0 btn-press flex items-center gap-1"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[10px] sm:text-[11px] text-neutral-400 font-mono leading-tight">
                ✓ Auto-configures GPIO coinslot • Installs systemd daemons • Generates local sqlite DB &amp; JWT keys
              </p>
            </div>

            {/* Metric Badges */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1">
              <div className="p-2.5 sm:p-3.5 bg-white neo-border rounded-xl sm:rounded-2xl neo-shadow-xs text-center sm:text-left">
                <div className="text-xl sm:text-3xl font-black text-emerald-600">₱0.00</div>
                <div className="text-[10px] sm:text-xs font-bold text-neutral-600 mt-0.5 leading-tight">Zero License Fees</div>
              </div>
              <div className="p-2.5 sm:p-3.5 bg-white neo-border rounded-xl sm:rounded-2xl neo-shadow-xs text-center sm:text-left">
                <div className="text-xl sm:text-3xl font-black text-blue-600">&lt;25ms</div>
                <div className="text-[10px] sm:text-xs font-bold text-neutral-600 mt-0.5 leading-tight">Pulse Latency</div>
              </div>
              <div className="p-2.5 sm:p-3.5 bg-white neo-border rounded-xl sm:rounded-2xl neo-shadow-xs text-center sm:text-left">
                <div className="text-xl sm:text-3xl font-black text-amber-600">100%</div>
                <div className="text-[10px] sm:text-xs font-bold text-neutral-600 mt-0.5 leading-tight">Offline Capable</div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Browser Simulator */}
          <div className="lg:col-span-5" id="simulator">
            <div className="bg-white neo-border-3 rounded-3xl neo-shadow-xl overflow-hidden">

              {/* Mock Browser Header */}
              <div className="bg-black text-white p-3.5 flex items-center justify-between border-b-2 border-black">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-black" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840] border border-black" />
                  <span className="text-xs font-mono font-bold text-neutral-300 ml-2">http://10.0.0.1/</span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-black uppercase rounded">
                  ● SIMULATOR
                </span>
              </div>

              {/* Phone View Mockup Content */}
              <div className="p-5 space-y-4 bg-[#f6f4ea]">

                {/* Streak Bonus Banner */}
                <div className="p-3 bg-gradient-to-r from-amber-200 to-orange-200 neo-border rounded-2xl flex items-center justify-between neo-shadow-xs">
                  <div>
                    <div className="text-xs font-black flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                      3-Day Loyalty Streak!
                    </div>
                    <div className="text-[10px] font-bold text-neutral-700">+30 mins bonus time active</div>
                  </div>
                  <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[10px] font-black rounded">VIP TIER</span>
                </div>

                {/* Customer Session Status Card */}
                <div className="bg-white neo-border rounded-2xl p-4 neo-shadow space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Device Session</span>
                      <div className="font-mono text-xs font-bold text-neutral-800">MAC: e4:5f:01:2b:89:14</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-xs font-black rounded-lg ${simRemainingSeconds > 0
                        ? simIsPaused
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-emerald-300 text-emerald-950'
                        : 'bg-neutral-200 text-neutral-700'
                        }`}
                    >
                      {simRemainingSeconds > 0 ? (simIsPaused ? 'Paused' : 'Connected (Online)') : 'Disconnected'}
                    </span>
                  </div>

                  {/* Time Counter Display */}
                  <div className="p-4 bg-neutral-900 text-white rounded-xl text-center space-y-1">
                    <div className="text-[10px] uppercase font-mono tracking-widest text-neutral-400">Time Remaining</div>
                    <div className="font-mono text-3xl sm:text-4xl font-black text-[#ffe17c] tracking-tight">
                      {formatTime(simRemainingSeconds)}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono font-bold">
                      QoS: 10 Mbps Cap Active
                    </div>
                  </div>

                  {/* Simulator Action Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSimPause}
                      disabled={simRemainingSeconds <= 0}
                      className="flex-1 py-2 bg-neutral-100 hover:bg-neutral-200 font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {simIsPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      <span>{simIsPaused ? 'Resume Time' : 'Pause Time'}</span>
                    </button>
                    <button
                      onClick={resetSim}
                      className="py-2 px-3 bg-rose-100 hover:bg-rose-200 font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press text-rose-700 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Coin Drop Triggers */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-black">
                    <span>🪙 DROP VIRTUAL COIN (Hardware Test):</span>
                    <span className="text-neutral-500 font-mono">Total: ₱{simTotalCoins}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => dropSimCoin(1, 15)}
                      className="py-2.5 bg-[#ffe17c] font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press text-center"
                    >
                      +₱1<br /><span className="text-[9px] font-normal font-mono">+15m</span>
                    </button>
                    <button
                      onClick={() => dropSimCoin(5, 75)}
                      className="py-2.5 bg-amber-300 font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press text-center"
                    >
                      +₱5<br /><span className="text-[9px] font-normal font-mono">+1h15m</span>
                    </button>
                    <button
                      onClick={() => dropSimCoin(10, 180)}
                      className="py-2.5 bg-emerald-300 font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press text-center"
                    >
                      +₱10<br /><span className="text-[9px] font-normal font-mono">+3h</span>
                    </button>
                    <button
                      onClick={() => dropSimCoin(20, 480)}
                      className="py-2.5 bg-violet-300 font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press text-center"
                    >
                      +₱20<br /><span className="text-[9px] font-normal font-mono">+8h</span>
                    </button>
                  </div>
                </div>

                {/* Micro Pulse Monitor */}
                <div className="p-2.5 bg-neutral-900 text-neutral-300 rounded-xl font-mono text-[10px] space-y-1">
                  <div className="flex items-center justify-between text-neutral-500 font-bold border-b border-neutral-800 pb-1">
                    <span>PULSE TRAIN MONITOR</span>
                    <span className="text-emerald-400">GPIO 2 (COIN) ACTIVE</span>
                  </div>
                  <div className="text-neutral-300 truncate">
                    {simLog}
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Deployment Architecture Switcher Section */}
      <section id="architectures" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto space-y-10">

          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 bg-[#ffe17c] neo-border rounded-full text-xs font-black uppercase tracking-wider neo-shadow-xs">
              Modular Engineering
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              3 Flexible Deployment Builds
            </h2>
            <p className="text-neutral-600 font-medium text-base">
              Choose the exact architecture that fits your existing hardware. No required proprietary boards.
            </p>
          </div>

          {/* Tab Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-2 sm:gap-3">
            <button
              onClick={() => setActiveBuild(1)}
              className={`w-full sm:w-auto px-4 py-2.5 sm:px-5 sm:py-3 font-black text-xs sm:text-sm neo-border rounded-xl sm:rounded-2xl neo-shadow-sm btn-press flex items-center justify-center gap-2 ${activeBuild === 1 ? 'bg-black text-[#ffe17c]' : 'bg-white text-black'
                }`}
            >
              <span>🚀 Build 1:</span>
              <span>Pi + OpenWrt Gigabit Router</span>
            </button>
            <button
              onClick={() => setActiveBuild(2)}
              className={`w-full sm:w-auto px-4 py-2.5 sm:px-5 sm:py-3 font-black text-xs sm:text-sm neo-border rounded-xl sm:rounded-2xl neo-shadow-sm btn-press flex items-center justify-center gap-2 ${activeBuild === 2 ? 'bg-black text-[#ffe17c]' : 'bg-white text-black'
                }`}
            >
              <span>🔌 Build 2:</span>
              <span>Universal Standalone Pi Gateway</span>
            </button>
            <button
              onClick={() => setActiveBuild(3)}
              className={`w-full sm:w-auto px-4 py-2.5 sm:px-5 sm:py-3 font-black text-xs sm:text-sm neo-border rounded-xl sm:rounded-2xl neo-shadow-sm btn-press flex items-center justify-center gap-2 ${activeBuild === 3 ? 'bg-black text-[#ffe17c]' : 'bg-white text-black'
                }`}
            >
              <span>⚡ Build 3:</span>
              <span>ESP32 Satellite + Direct LAN</span>
            </button>
          </div>

          {/* Build 1 Card */}
          {activeBuild === 1 && (
            <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl sm:rounded-3xl p-5 sm:p-10 neo-shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-2 border-black pb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-black text-xs uppercase rounded">Build 1</span>
                    <h3 className="text-xl sm:text-3xl font-black">Decoupled OpenWrt Gigabit + Raspberry Pi Paywall</h3>
                  </div>
                  <p className="text-neutral-700 text-xs sm:text-sm mt-1">
                    Industrial standard: Any gigabit OpenWrt router (tested and verified on Ruijie RG-EW1200G Pro) paired with a Raspberry Pi 3/4/5.
                  </p>
                </div>
                <span className="px-3.5 py-1.5 bg-emerald-300 neo-border rounded-xl text-xs font-black uppercase neo-shadow-xs shrink-0">
                  ★ Recommended for 100+ Clients
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <h4 className="font-black text-base sm:text-lg">System Topology:</h4>
                  <div className="p-3.5 sm:p-4 bg-white neo-border rounded-2xl neo-shadow-sm space-y-2 font-mono text-[11px] sm:text-xs overflow-x-auto">
                    <div className="flex items-center gap-2 text-neutral-800 whitespace-nowrap">
                      <span className="text-blue-600 font-bold">[ISP Fiber ONU]</span> ──WAN──&gt; <span className="font-bold">OpenWrt Router (192.168.1.1)</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      ├── 📶 Dual-Band Wi-Fi (2.4GHz &amp; 5GHz SSIDs)
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      ├── 🛡️ Kernel nftables: table inet piso_portal (atomic timeouts)
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      └── 🍓 LAN 1 ──Ethernet──&gt; <span className="font-bold">Raspberry Pi (192.168.1.240)</span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-neutral-500 pt-1">
                      Port 80 traffic automatically redirected to Pi :3000 captive paywall.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white neo-border rounded-xl font-bold space-y-1">
                      <span className="text-emerald-600 font-black">✓ Advantage:</span>
                      <p className="text-neutral-600">Gigabit hardware NAT offloading handles 100+ simultaneous bandwidth-heavy users with 0% CPU strain on the Pi.</p>
                    </div>
                    <div className="p-3 bg-white neo-border rounded-xl font-bold space-y-1">
                      <span className="text-amber-600 font-black">✓ Redundancy:</span>
                      <p className="text-neutral-600">If the Pi reboots, already-authorized Wi-Fi clients remain connected with uninterrupted internet access.</p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-black text-white p-4 sm:p-5 rounded-2xl neo-border font-mono text-xs space-y-3">
                  <div className="text-[#ffe17c] font-bold border-b border-neutral-800 pb-2">
                    ⚡ 1-Click Router Configuration Script:
                  </div>
                  <pre className="text-neutral-300 overflow-x-auto p-2 bg-neutral-900 rounded-lg text-[11px] sm:text-xs"><code># From Raspberry Pi terminal:
bash scripts/deploy-router.sh \
--router-ip 192.168.1.1 \
--portal-ip 192.168.1.240</code></pre>
                  <p className="text-[10px] sm:text-[11px] text-neutral-400">
                    Injects non-destructive nftables firewall rules, alias IP <code>10.0.0.1</code>, dnsmasq domain <code>wifi.local</code>, and Dropbear SSH keys.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Build 2 Card */}
          {activeBuild === 2 && (
            <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl sm:rounded-3xl p-5 sm:p-10 neo-shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-2 border-black pb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="px-2.5 py-1 bg-blue-600 text-white font-black text-xs uppercase rounded">Build 2</span>
                    <h3 className="text-xl sm:text-3xl font-black">Universal Standalone Pi Gateway (No OpenWrt Needed)</h3>
                  </div>
                  <p className="text-neutral-700 text-xs sm:text-sm mt-1">
                    All-in-one setup: Raspberry Pi performs NAT routing, DHCP leasing, nftables firewall, and captive paywall.
                  </p>
                </div>
                <span className="px-3.5 py-1.5 bg-blue-300 neo-border rounded-xl text-xs font-black uppercase neo-shadow-xs shrink-0">
                  ★ Plug &amp; Play (Any Access Point)
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <h4 className="font-black text-base sm:text-lg">System Topology:</h4>
                  <div className="p-3.5 sm:p-4 bg-white neo-border rounded-2xl neo-shadow-sm space-y-2 font-mono text-[11px] sm:text-xs overflow-x-auto">
                    <div className="flex items-center gap-2 text-neutral-800 whitespace-nowrap">
                      <span className="text-blue-600 font-bold">[ISP Modem]</span> ──Ethernet──&gt; <span className="font-bold">eth0 (Pi WAN / DHCP)</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      ├── 🍓 Raspberry Pi 4 / 5 (Kernel NAT + nftables + Paywall)
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      └── 🔌 USB3-to-Gigabit LAN (eth1) ──&gt; <span className="font-bold">Any AP (TP-Link, Tenda, Mercusys)</span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-neutral-500 pt-1">
                      Pi runs native dnsmasq DHCP server (10.0.0.10 - 10.0.3.250 /22) and routes packets directly to ISP.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white neo-border rounded-xl font-bold space-y-1">
                      <span className="text-emerald-600 font-black">✓ Zero Flashing:</span>
                      <p className="text-neutral-600">No need to flash custom OpenWrt firmware onto third-party access point routers.</p>
                    </div>
                    <div className="p-3 bg-white neo-border rounded-xl font-bold space-y-1">
                      <span className="text-purple-600 font-black">✓ Any Wi-Fi Brand:</span>
                      <p className="text-neutral-600">Plug any standard home router in AP mode (TP-Link Archer, Tenda, Mercusys).</p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-black text-white p-4 sm:p-5 rounded-2xl neo-border font-mono text-xs space-y-3">
                  <div className="text-[#ffe17c] font-bold border-b border-neutral-800 pb-2">
                    ⚡ Setup Standalone Gateway:
                  </div>
                  <pre className="text-neutral-300 overflow-x-auto p-2 bg-neutral-900 rounded-lg text-[11px] sm:text-xs"><code># Run the gateway setup utility:
sudo bash scripts/setup-pi-gateway.sh \
--wan eth0 \
--lan eth1 \
--subnet 10.0.0.1/22</code></pre>
                  <p className="text-[10px] sm:text-[11px] text-neutral-400">
                    Includes full rollback protection (<code>--rollback</code>) and real-time status diagnostics (<code>--status</code>).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Build 3 Card */}
          {activeBuild === 3 && (
            <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl sm:rounded-3xl p-5 sm:p-10 neo-shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-2 border-black pb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="px-2.5 py-1 bg-amber-400 text-black font-black text-xs uppercase rounded">Build 3</span>
                    <h3 className="text-xl sm:text-3xl font-black">ESP32 Satellite Coinslots + Direct Local LAN</h3>
                  </div>
                  <p className="text-neutral-700 text-xs sm:text-sm mt-1">
                    Ultra-low latency microsecond hardware interrupt bridge. Distribute multiple coin slots over Wi-Fi without long GPIO wiring.
                  </p>
                </div>
                <span className="px-3.5 py-1.5 bg-amber-300 neo-border rounded-xl text-xs font-black uppercase neo-shadow-xs shrink-0">
                  ★ Multi-Coinslot Expansion
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <h4 className="font-black text-base sm:text-lg">System Topology:</h4>
                  <div className="p-3.5 sm:p-4 bg-white neo-border rounded-2xl neo-shadow-sm space-y-2 font-mono text-[11px] sm:text-xs overflow-x-auto">
                    <div className="flex items-center gap-2 text-neutral-800 whitespace-nowrap">
                      <span className="font-bold">ESP32 DevKit (GPIO 18 Interrupt)</span> ──Local Wi-Fi──&gt; <span className="font-bold">OpenWrt / Pi Daemon</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      ├── 📡 Direct LAN HTTP POST /api/coinslots/pulse (Auth via SATELLITE_SECRET)
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      ├── ⚡ Zero Cloud Overhead: Authorizes client in &lt;20ms even if WAN is down
                    </div>
                    <div className="flex items-center gap-2 text-neutral-800 pl-4 sm:pl-6 border-l-2 border-neutral-300 whitespace-nowrap">
                      └── 🔒 Inhibit Gate Lock: Relay pin 19 blocks coin slot when customer isn&apos;t paying
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-neutral-500 pt-1">
                      Allows 10+ independent coin boxes across a whole building sharing a single internet gateway.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white neo-border rounded-xl font-bold space-y-1">
                      <span className="text-emerald-600 font-black">✓ Microsecond Precision:</span>
                      <p className="text-neutral-600">Hardware ISR timers prevent lost coin pulses caused by Linux userspace CPU spikes.</p>
                    </div>
                    <div className="p-3 bg-white neo-border rounded-xl font-bold space-y-1">
                      <span className="text-blue-600 font-black">✓ No Wiring Mess:</span>
                      <p className="text-neutral-600">Place coin boxes 50 meters away near counters without running physical signal wires to the Pi.</p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-black text-white p-4 sm:p-5 rounded-2xl neo-border font-mono text-xs space-y-3">
                  <div className="text-[#ffe17c] font-bold border-b border-neutral-800 pb-2">
                    ⚡ Flash ESP32 Satellite (Arduino IDE / PlatformIO):
                  </div>
                  <pre className="text-neutral-300 overflow-x-auto p-2 bg-neutral-900 rounded-lg text-[11px] sm:text-xs"><code>// firmware/esp32-satellite/esp32-satellite.ino
const char* WIFI_SSID     = &quot;OpenPisoWiFi_Staff&quot;;
const char* DAEMON_URL    = &quot;http://192.168.1.240:4000&quot;;
const char* SHARED_SECRET = &quot;change-me-to-a-secure-secret&quot;;</code></pre>
                  <p className="text-[10px] sm:text-[11px] text-neutral-400">
                    Pre-configured for Allan 1245A / Weiyu selectors with automatic retry buffers during network blips.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* Cloud Fleet & Remote Control Showcase */}
      <section id="cloud-fleet" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-[#ffe17c] bg-dot-grid">
        <div className="max-w-7xl mx-auto space-y-12">

          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 bg-black text-[#ffe17c] neo-border rounded-full text-xs font-black uppercase tracking-wider neo-shadow-xs">
              Central Fleet Command
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Manage 1 or 100 Machines Anywhere
            </h2>
            <p className="text-neutral-800 font-medium text-base">
              Zero monthly subscription fees. Leverage Supabase&apos;s free tier for cloud telemetry and Telegram bots for instant revenue pings.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

            {/* Left: Cloud Dashboard Highlights */}
            <div className="lg:col-span-6 space-y-4">
              <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-4">
                <div className="flex items-center justify-between border-b-2 border-black pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    <h3 className="font-black text-xl">Supabase Cloud Telemetry</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-400 text-black text-xs font-black rounded">FREE TIER COMPLIANT</span>
                </div>

                <ul className="space-y-3 text-sm font-bold text-neutral-800">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-black text-[#ffe17c] flex items-center justify-center text-xs shrink-0 mt-0.5">✓</span>
                    <span><strong>Multi-Branch Vault Sync:</strong> View daily collections, total revenue, and connected client counts from anywhere in the world.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-black text-[#ffe17c] flex items-center justify-center text-xs shrink-0 mt-0.5">✓</span>
                    <span><strong>Remote Command Bus:</strong> Unlock/block coin slots, reboot routers, add customer bonus time, or kick devices remotely.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-black text-[#ffe17c] flex items-center justify-center text-xs shrink-0 mt-0.5">✓</span>
                    <span><strong>Row-Level Security (RLS):</strong> Secure multi-tenant database policies ensure operators only access their own machines.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg bg-black text-[#ffe17c] flex items-center justify-center text-xs shrink-0 mt-0.5">✓</span>
                    <span><strong>Zero-Cost Telegram Notifications:</strong> Instant push messages direct to your phone every time a coin drops or the vault is collected.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right: Mock Telegram & Cloud Terminal Card */}
            <div className="lg:col-span-6 space-y-4">
              <div className="bg-black text-white neo-border-3 rounded-2xl p-6 neo-shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sky-400 text-xl">✈</span>
                    <span className="font-mono text-sm font-bold">@OpenPisoWiFi_Bot (Telegram Notification)</span>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-400">Just now</span>
                </div>

                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 font-mono text-xs text-neutral-200 space-y-2">
                  <div className="text-[#ffe17c] font-black">💰 COIN DEPOSIT CONFIRMED</div>
                  <div className="text-neutral-300">
                    • <strong>Kiosk:</strong> Sari-Sari Store #1 (Pi-4B-01)<br />
                    • <strong>Amount:</strong> +₱10.00 (Pulse count: 10)<br />
                    • <strong>Client MAC:</strong> 4a:92:bc:12:00:8e<br />
                    • <strong>New Expiry:</strong> 2026-10-13 18:30 (+3h 0m)<br />
                    • <strong>Total Today:</strong> ₱1,450.00 (Active: 8 users)
                  </div>
                </div>

                <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-between font-mono text-xs">
                  <span className="text-neutral-400">Cloud Schema Location:</span>
                  <code className="text-amber-300">supabase/schema.sql</code>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto space-y-12">

          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 bg-neutral-100 neo-border rounded-full text-xs font-black uppercase tracking-wider neo-shadow-xs">
              Built For Real-World Reliability
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Engineered Without Compromise
            </h2>
            <p className="text-neutral-600 font-medium text-base">
              From microsecond GPIO polling to high-converting UI components.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <div className="bg-[#f6f4ea] neo-border rounded-2xl p-6 neo-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-black text-[#ffe17c] flex items-center justify-center text-2xl font-black neo-border neo-shadow-xs">
                🛡️
              </div>
              <h3 className="text-xl font-black">Kernel nftables Routing</h3>
              <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                Direct OpenWrt Linux kernel packet filtering with native sets and atomic expiration timers. Zero slow cron scripts or polling loops.
              </p>
            </div>

            <div className="bg-[#f6f4ea] neo-border rounded-2xl p-6 neo-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#ffe17c] text-black flex items-center justify-center text-2xl font-black neo-border neo-shadow-xs">
                🪙
              </div>
              <h3 className="text-xl font-black">Multi-Coin Auto-Aggregation</h3>
              <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                Software pulse-train aggregation (300ms window) accurately distinguishes ₱1, ₱5, ₱10, and ₱20 coins on standard selectors.
              </p>
            </div>

            <div className="bg-[#f6f4ea] neo-border rounded-2xl p-6 neo-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-200 text-black flex items-center justify-center text-2xl font-black neo-border neo-shadow-xs">
                📲
              </div>
              <h3 className="text-xl font-black">Universal CNA Interception</h3>
              <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                Instant automatic login popups on Apple iOS/macOS (<code>hotspot-detect.html</code>), Android (<code>gen_204</code>), and Windows NCSI.
              </p>
            </div>

            <div className="bg-[#f6f4ea] neo-border rounded-2xl p-6 neo-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-200 text-black flex items-center justify-center text-2xl font-black neo-border neo-shadow-xs">
                🎟️
              </div>
              <h3 className="text-xl font-black">Thermal Receipt Batch Studio</h3>
              <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                Generate and print batch voucher codes formatted specifically for 58mm and 80mm ESC/POS thermal receipt printers or A4 paper.
              </p>
            </div>

            <div className="bg-[#f6f4ea] neo-border rounded-2xl p-6 neo-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-violet-200 text-black flex items-center justify-center text-2xl font-black neo-border neo-shadow-xs">
                🔌
              </div>
              <h3 className="text-xl font-black">Visual 40-Pin GPIO Pinout</h3>
              <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                Configure COIN and INHIBIT pins via an interactive 40-pin header diagram in the admin dashboard with reserved pin safety warnings.
              </p>
            </div>

            <div className="bg-[#f6f4ea] neo-border rounded-2xl p-6 neo-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-rose-200 text-black flex items-center justify-center text-2xl font-black neo-border neo-shadow-xs">
                🔄
              </div>
              <h3 className="text-xl font-black">State-Preserving OTA Updates</h3>
              <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                1-Click upgrades pull git releases in under 5 seconds while keeping customer sessions, revenue records, and Wi-Fi credentials intact.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* Competitive Comparison Matrix */}
      <section id="compare" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-[#f6f4ea]">
        <div className="max-w-7xl mx-auto space-y-12">

          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 bg-black text-[#ffe17c] neo-border rounded-full text-xs font-black uppercase tracking-wider neo-shadow-xs">
              Honest Comparison
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              How OpenPisoWiFi Compares
            </h2>
            <p className="text-neutral-700 font-medium text-base">
              Why operators and DIY builders are moving away from closed-source legacy solutions.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-right text-[11px] font-mono text-neutral-500 sm:hidden">
              Scroll table horizontally ➔
            </div>
            <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
              <table className="min-w-[650px] w-full text-left border-collapse bg-white neo-border-3 rounded-2xl overflow-hidden neo-shadow-xl">
                <thead>
                  <tr className="bg-black text-white text-xs sm:text-sm font-mono border-b-2 border-black">
                    <th className="p-3.5 sm:p-5">CAPABILITY / FEATURE</th>
                    <th className="p-3.5 sm:p-5 bg-[#ffe17c] text-black font-black">⚡ OpenPisoWiFi</th>
                    <th className="p-3.5 sm:p-5 text-neutral-300">JuanFi (Legacy)</th>
                    <th className="p-3.5 sm:p-5 text-neutral-300">LPB / Ado (Proprietary)</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-neutral-200 text-xs sm:text-sm font-bold">
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Software License & Pricing</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-emerald-700 font-black">100% Free & Open-Source (MIT)</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Free but Abandoned / Unmaintained</td>
                  <td className="p-4 sm:p-5 text-rose-600">Paid per-machine license fee</td>
                </tr>
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Packet Filtering Engine</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-neutral-900 font-black">Linux nftables (Atomic Sets)</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Legacy iptables chains</td>
                  <td className="p-4 sm:p-5 text-neutral-600">iptables / Proprietary daemon</td>
                </tr>
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Deployment Architectures</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-neutral-900 font-black">3 Builds (Pi+Router, Standalone Pi, ESP32)</td>
                  <td className="p-4 sm:p-5 text-neutral-600">OpenWrt Router only</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Proprietary OrangePi / Pi image only</td>
                </tr>
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Multi-Coinslot Satellites</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-neutral-900 font-black">ESP32 Direct LAN (&lt;25ms)</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Limited / Custom wiring</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Proprietary NodeMCU firmware</td>
                </tr>
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Cloud Fleet Telemetry</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-neutral-900 font-black">Free Supabase + Telegram Bot</td>
                  <td className="p-4 sm:p-5 text-neutral-600">None (Local storage only)</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Proprietary cloud subscription</td>
                </tr>
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Captive Portal Stack</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-neutral-900 font-black">Next.js 16 + Tailwind</td>
                  <td className="p-4 sm:p-5 text-neutral-600">PHP 5 / Legacy HTML</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Encrypted PHP / Node</td>
                </tr>
                <tr className="hover:bg-amber-50">
                  <td className="p-4 sm:p-5">Offline Survivability</td>
                  <td className="p-4 sm:p-5 bg-amber-100/50 text-neutral-900 font-black">100% (Local SQLite + LAN tokens)</td>
                  <td className="p-4 sm:p-5 text-neutral-600">100%</td>
                  <td className="p-4 sm:p-5 text-neutral-600">Partial (License verification checks)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>

      {/* Hardware Bill of Materials, Build Guide & Wiring */}
      <section id="build-guide" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-white scroll-mt-12">
        <div className="max-w-7xl mx-auto space-y-16">

          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="px-3.5 py-1.5 bg-[#ffe17c] neo-border rounded-full text-xs font-black uppercase tracking-wider neo-shadow-xs">
              🛠️ COMPLETE BUILD &amp; HARDWARE MANUAL
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Step-by-Step Build &amp; Wiring Guide
            </h2>
            <p className="text-neutral-700 font-medium text-base sm:text-lg">
              From cloning the code to electrical wiring and testing. Build a commercial-grade kiosk with affordable, off-the-shelf components. Zero proprietary hardware lock-in.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/build-guide"
                className="w-full sm:w-auto px-5 py-3 bg-[#ffe17c] text-black font-black text-xs sm:text-sm neo-border rounded-xl neo-shadow-sm btn-press flex items-center justify-center gap-2"
              >
                <span>📖 Open Dedicated Step-by-Step Manual, Wiring Schematics &amp; Pinout Guide</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Interactive Preferred Setup Selector */}
          <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl sm:rounded-3xl p-5 sm:p-7 neo-shadow space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-black/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-black uppercase tracking-wider text-neutral-600">
                    PREFERRED HARDWARE SETUP
                  </span>
                </div>
                <h3 className="text-lg sm:text-2xl font-black text-black mt-0.5">
                  {activeBuild === 1 && '🚀 Build 1: Decoupled Pi + OpenWrt Gigabit Router'}
                  {activeBuild === 2 && '🔌 Build 2: Universal Standalone Pi Gateway (Any AP)'}
                  {activeBuild === 3 && '⚡ Build 3: ESP32 Satellite Coinslots + Direct Local LAN'}
                </h3>
              </div>
              <p className="text-xs font-bold text-neutral-600 max-w-sm">
                The roadmap and materials below dynamically adjust based on your selected setup:
              </p>
            </div>

            {/* Switcher Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <button
                onClick={() => setActiveBuild(1)}
                className={`p-3 font-black text-xs sm:text-sm neo-border rounded-xl btn-press flex items-center justify-center gap-2 ${
                  activeBuild === 1 ? 'bg-black text-[#ffe17c] neo-shadow-sm' : 'bg-white text-black hover:bg-amber-100'
                }`}
              >
                <span>🚀 Build 1: Pi + Router</span>
              </button>
              <button
                onClick={() => setActiveBuild(2)}
                className={`p-3 font-black text-xs sm:text-sm neo-border rounded-xl btn-press flex items-center justify-center gap-2 ${
                  activeBuild === 2 ? 'bg-black text-[#ffe17c] neo-shadow-sm' : 'bg-white text-black hover:bg-amber-100'
                }`}
              >
                <span>🔌 Build 2: Standalone Pi</span>
              </button>
              <button
                onClick={() => setActiveBuild(3)}
                className={`p-3 font-black text-xs sm:text-sm neo-border rounded-xl btn-press flex items-center justify-center gap-2 ${
                  activeBuild === 3 ? 'bg-black text-[#ffe17c] neo-shadow-sm' : 'bg-white text-black hover:bg-amber-100'
                }`}
              >
                <span>⚡ Build 3: ESP32 Satellite</span>
              </button>
            </div>
          </div>

          {/* Dynamic 4-Phase Step-by-Step Build Roadmap depending on selected build */}
          {activeBuild === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Build 1 - Step 1 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 1</span>
                    <span className="text-2xl">💻</span>
                  </div>
                  <h3 className="text-xl font-black">Clone &amp; Install</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Clone the repo to your Raspberry Pi or Debian/Ubuntu machine and execute the 1-click automated setup script.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
                  <code>git clone https://github.com/haliknihudas666/open-piso-wifi.git<br />sudo bash scripts/install.sh</code>
                </div>
              </div>

              {/* Build 1 - Step 2 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 2</span>
                    <span className="text-2xl">📡</span>
                  </div>
                  <h3 className="text-xl font-black">Provision Router</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Flash OpenWrt on your Ruijie EW1200G Pro, then run our automated router provisioning script from the Pi.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
                  <code>bash scripts/deploy-router.sh --router-ip 192.168.1.1 --portal-ip 192.168.1.240</code>
                </div>
              </div>

              {/* Build 1 - Step 3 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 3</span>
                    <span className="text-2xl">🪙</span>
                  </div>
                  <h3 className="text-xl font-black">Wire Pi GPIO</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Wire 12V coinslot to PSU. Connect pulse signal via 10kΩ inline resistor to Pi GPIO 2 (Pin 3) and inhibit gate to GPIO 3 (Pin 5). No optocoupler needed.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto">
                  <code>GPIO 2 (Pin 3) = Pulse<br />GPIO 3 (Pin 5) = Inhibit</code>
                </div>
              </div>

              {/* Build 1 - Step 4 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 4</span>
                    <span className="text-2xl">⚡</span>
                  </div>
                  <h3 className="text-xl font-black">Test &amp; Deploy</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Open the admin portal, insert test coins, and verify instant token generation and gigabit hardware offloading.
                  </p>
                </div>
                <div className="p-2.5 bg-emerald-100 neo-border rounded-xl font-mono text-[11px] text-emerald-900 font-bold text-center">
                  <code>http://192.168.1.240:3000/admin</code>
                </div>
              </div>
            </div>
          )}

          {activeBuild === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Build 2 - Step 1 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 1</span>
                    <span className="text-2xl">💻</span>
                  </div>
                  <h3 className="text-xl font-black">Clone &amp; Install</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Clone the repo to your Raspberry Pi 4 or 5 and execute the 1-click automated setup script.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
                  <code>git clone https://github.com/haliknihudas666/open-piso-wifi.git<br />sudo bash scripts/install.sh</code>
                </div>
              </div>

              {/* Build 2 - Step 2 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 2</span>
                    <span className="text-2xl">🔌</span>
                  </div>
                  <h3 className="text-xl font-black">Enable Pi Gateway</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Configure the Pi as an all-in-one NAT router, DHCP server (10.0.0.1/22), and captive paywall with zero OpenWrt flashing.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
                  <code>sudo bash scripts/setup-pi-gateway.sh --wan eth0 --lan eth1 --subnet 10.0.0.1/22</code>
                </div>
              </div>

              {/* Build 2 - Step 3 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 3</span>
                    <span className="text-2xl">📶</span>
                  </div>
                  <h3 className="text-xl font-black">Plug Any Access Point</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Connect USB-LAN adapter (eth1) to the WAN port of any standard home Wi-Fi router (TP-Link, Tenda, Mercusys) in AP mode.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto">
                  <code>eth0 = ISP Internet<br />eth1 = Client Access Point</code>
                </div>
              </div>

              {/* Build 2 - Step 4 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 4</span>
                    <span className="text-2xl">🪙</span>
                  </div>
                  <h3 className="text-xl font-black">Wire &amp; Test Live</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Wire coinslot to Pi GPIO 2 (Pin 3) via 10kΩ resistor. Test captive portal redirection and DHCP leasing on clients.
                  </p>
                </div>
                <div className="p-2.5 bg-emerald-100 neo-border rounded-xl font-mono text-[11px] text-emerald-900 font-bold text-center">
                  <code>http://10.0.0.1:3000/admin</code>
                </div>
              </div>
            </div>
          )}

          {activeBuild === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Build 3 - Step 1 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 1</span>
                    <span className="text-2xl">💻</span>
                  </div>
                  <h3 className="text-xl font-black">Setup Central Daemon</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Install Open Piso WiFi server daemon on your local Raspberry Pi, mini PC, or server on the local network.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
                  <code>git clone https://github.com/haliknihudas666/open-piso-wifi.git<br />sudo bash scripts/install.sh</code>
                </div>
              </div>

              {/* Build 3 - Step 2 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 2</span>
                    <span className="text-2xl">🎛️</span>
                  </div>
                  <h3 className="text-xl font-black">Flash ESP32</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Flash <code>firmware/esp32-satellite</code> via Arduino IDE. Configure local Wi-Fi SSID, Daemon IP, and secret token.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto">
                  <code>DAEMON_URL = &quot;http://192.168.1.240:4000&quot;<br />SATELLITE_SECRET = &quot;your-secret&quot;</code>
                </div>
              </div>

              {/* Build 3 - Step 3 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 3</span>
                    <span className="text-2xl">⚡</span>
                  </div>
                  <h3 className="text-xl font-black">Wire ESP32 Pins</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Connect 12V coinslot to ESP32: GPIO 18 hardware ISR interrupt for white pulse line, GPIO 19 relay for gray inhibit line.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-900 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto">
                  <code>ESP32 GPIO 18 = ISR Pulse<br />ESP32 GPIO 19 = Inhibit Lock</code>
                </div>
              </div>

              {/* Build 3 - Step 4 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-black text-[#ffe17c] text-xs font-mono font-black rounded">PHASE 4</span>
                    <span className="text-2xl">📡</span>
                  </div>
                  <h3 className="text-xl font-black">Deploy Wireless Boxes</h3>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">
                    Deploy 1 or more standalone wireless coin boxes across the building. Coins trigger microsecond ISR and instant LAN POST.
                  </p>
                </div>
                <div className="p-2.5 bg-emerald-100 neo-border rounded-xl font-mono text-[11px] text-emerald-900 font-bold text-center">
                  <code>&lt;20ms Latency over LAN</code>
                </div>
              </div>
            </div>
          )}

          {/* Part 2: Curated Bill of Materials (BOM) with Shopee Links */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-4">
              <div>
                <h3 className="text-2xl sm:text-3xl font-black">📦 Bill of Materials & Shopee Purchase Links</h3>
                <p className="text-sm font-bold text-neutral-600 mt-0.5">
                  Verified standard components. Click the orange badges to view direct listings on Shopee.
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-400 text-black font-black text-xs neo-border rounded-lg neo-shadow-xs self-start sm:self-auto">
                ✓ 100% SOLDERLESS COMPATIBLE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* Item 1: ESP32 */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">🎛️</span>
                    <div className="flex items-center gap-1.5">
                      {activeBuild === 3 ? (
                        <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-mono font-black uppercase rounded">
                          ✓ Core for Build 3
                        </span>
                      ) : activeBuild === 1 ? (
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-mono font-bold uppercase rounded">
                          Optional Satellite
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-neutral-200 text-neutral-600 text-[10px] font-mono font-bold uppercase rounded">
                          Not Required
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[10px] font-mono font-black uppercase rounded">Controller</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight">ESP32 DevKit Board</h4>
                    <p className="text-xs font-bold text-neutral-700 mt-1">
                      Microsecond interrupt pulse aggregator. Any 30 or 38-pin variant, Type-C or Micro-USB, CP2102 or CH340 works flawlessly!
                    </p>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t-2 border-black/10">
                  <a
                    href="https://s.shopee.ph/3LRZNrLXF6"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Shopee (International / All Pins)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="https://s.shopee.ph/9zyTKJnBzQ"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Shopee (Local PH Store)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Item 2: Ruijie Reyee EW1200G Pro */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">📡</span>
                    <div className="flex items-center gap-1.5">
                      {activeBuild === 1 ? (
                        <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-mono font-black uppercase rounded">
                          ✓ Core for Build 1
                        </span>
                      ) : activeBuild === 2 ? (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-mono font-bold uppercase rounded">
                          Any AP Works
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-neutral-200 text-neutral-600 text-[10px] font-mono font-bold uppercase rounded">
                          Any LAN AP
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-mono font-black uppercase rounded">Gigabit AP</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight">OpenWrt Gigabit Router</h4>
                    <p className="text-xs font-bold text-neutral-700 mt-1">
                      Tested on Ruijie RG-EW1200G Pro (compatible with any OpenWrt gigabit router). Full Gigabit WAN + 3 Gigabit LAN ports, Dual-Band AC1200 Wi-Fi. Supports 100+ concurrent clients with OpenWrt 25.12.5.
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t-2 border-black/10">
                  <a
                    href="https://s.shopee.ph/gQoE0RlxS"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Buy Ruijie EW1200G Pro on Shopee</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Item 3: Universal Coinslot */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">🪙</span>
                    <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-mono font-black uppercase rounded">Coin Acceptor</span>
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight">Universal Multi-Coinslot</h4>
                    <p className="text-xs font-bold text-neutral-700 mt-1">
                      Intelligent multi-coin recognition pre-programmed for ₱1, ₱5, ₱10, and ₱20 coins (old and new BSP series) with anti-stringing optical sensors.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t-2 border-black/10">
                  <a
                    href="https://s.shopee.ph/AKbJjpgYbD"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Allan Universal Coinslot</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="https://s.shopee.ph/2BFc0soeRA"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Weiyu Universal Coinslot (Alt)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Item 4: 12V Centralized Power Supply */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">⚡</span>
                    <span className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-mono font-black uppercase rounded">Power Supply</span>
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight">12V Centralized Power Supply</h4>
                    <p className="text-xs font-bold text-neutral-700 mt-1">
                      12V 5A / 10A CCTV-grade switching power supply with perforated metal casing. Powers router, coin acceptor, and SBC simultaneously from a single wall plug.
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t-2 border-black/10">
                  <a
                    href="https://s.shopee.ph/4B0gOiQgzp"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Buy 12V Centralized PSU on Shopee</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Item 5: Quick Wire Connector Terminal Blocks */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">🔗</span>
                    <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-mono font-black uppercase rounded">Wiring Blocks</span>
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight">Quick Terminal Block Connectors</h4>
                    <p className="text-xs font-bold text-neutral-700 mt-1">
                      Spring lever wire clamps. No soldering or electrical tape required! Enables clean power splitting, secure connections, and instant swapping.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t-2 border-black/10">
                  <a
                    href="https://s.shopee.ph/30oj0f9bC4"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Quick Connector Block (Option 1)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="https://s.shopee.ph/1BN4pkeSvz"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Quick Connector Block (Option 2)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Item 6: Step-Down Buck & 10kΩ Resistors */}
              <div className="bg-[#f6f4ea] neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">🛡️</span>
                    <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-mono font-black uppercase rounded">Protection</span>
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight">Buck Converter & 10kΩ Resistor</h4>
                    <p className="text-xs font-bold text-neutral-700 mt-1">
                      LM2596 / XL4015 DC-DC Buck converter steps down 12V to 5V 3A for Pi / ESP32. A 10kΩ series resistor inline on the white coin wire safely limits pulse current (no optocoupler required).
                    </p>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t-2 border-black/10">
                  <a
                    href="https://s.shopee.ph/8fT5vZTSBc"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> 12V to 5V Buck Converter (USB)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href="https://s.shopee.ph/905wKEhobz"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> 12V to 5V Buck (Solder / Terminal)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* Part 3: Visual Wiring Diagram & Pinout Schematic */}
          <div className="bg-black text-white neo-border-3 rounded-2xl sm:rounded-3xl p-5 sm:p-10 neo-shadow-xl space-y-6 sm:space-y-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 border-b border-neutral-800 pb-5 sm:pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-xs font-mono font-black uppercase tracking-wider text-[#ffe17c]">CIRCUIT SCHEMATIC</span>
                </div>
                <h3 className="text-xl sm:text-3xl font-black text-white mt-1">Complete System Wiring Blueprint</h3>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] sm:text-xs text-neutral-400">
                <span>Power: 12V DC Centralized</span> • <span>Logic: 3.3V / 5V DC</span>
              </div>
            </div>

            {/* Visual ASCII / Block Schematic */}
            <div className="space-y-2">
              <div className="p-3 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-neutral-300">
                <span className="text-[#ffe17c] font-black">
                  📍 Active Wiring Target ({activeBuild === 1 ? 'Build 1' : activeBuild === 2 ? 'Build 2' : 'Build 3'}):
                </span>
                <span className="text-emerald-400 font-bold">
                  {activeBuild === 3
                    ? 'Connect Coin Signal to ESP32 Pin 18 (ISR) & Inhibit to Pin 19'
                    : 'Connect Coin Signal to Raspberry Pi Pin 3 (GPIO 2) & Inhibit to Pin 5 (GPIO 3)'}
                </span>
              </div>
              <div className="text-right text-[11px] font-mono text-amber-400 sm:hidden">
                Scroll schematic horizontally ➔
              </div>
              <div className="p-3 sm:p-6 bg-neutral-900 border-2 border-neutral-700 rounded-2xl font-mono text-xs sm:text-sm text-neutral-200 overflow-x-auto space-y-4">
                <pre className="leading-relaxed text-neutral-300"><code>{`┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ⚡ CENTRALIZED 12V 5A/10A POWER SUPPLY                          │
│   [ L ] [ N ] [ EARTH ]   │   [ +V  (+12V DC) ]         [ COM  (Ground / GND) ]        │
└─────┬───┬──────┬──────────┴──────────┬─────────────────────────────┬───────────────────┘
      │   │      │                     │                             │
    220V AC MAINS                      ▼                             ▼
                            ┌─────────────────────┐       ┌─────────────────────┐
                            │ QUICK TERMINAL +12V │       │ QUICK TERMINAL GND  │
                            │  (Lever Block 1)    │       │  (Lever Block 2)    │
                            └──┬────────┬───────┬─┘       └──┬────────┬───────┬─┘
                               │        │       │            │        │       │
        ┌──────────────────────┘        │       └────────────┼────────┼───────┼────────┐
        │                               │                    │        │       │        │
        ▼ (+12V)                        ▼ (+12V)             ▼ (GND)  │       ▼ (GND)  │
┌───────────────┐              ┌─────────────────┐ ┌───────────────┐  │  ┌──────────┐  │
│ RUIJIE ROUTER │              │ ALLAN / WEIYU   │ │ BUCK 12V->5V  │  │  │ COMMON   │  │
│ 12V DC JACK   │              │ COINSLOT        │ │ DC CONVERTER  │  │  │ GROUND   │  │
│ (+) Center Pin│              │ Red Wire (+12V) │ │ IN+   /   IN- │◄─┘  │ BUS      │  │
│ (-) Outer Ring│◄─────────────┤ Black Wire (GND)│ └───────┬───────┘     └────┬─────┘  │
└───────────────┘              │                 │         │ (5V Power)       │        │
                               │ White (COIN)──┐ │         │ Direct           │        │
                               │ Gray (INHIBIT)┼┐│         ▼                  │        │
                               └───────────────┘││   ┌───────────┐            │        │
                                                ││   │ 5V DC OUT │            │        │
                                                ││   │ USB-C/PIN2│            │        │
                               ┌────────────────┼┘   └─────┬─────┘            │        │
                               │                │          │                  │        │
                               │ ┌──────────────▼───┐      │                  │        │
                               │ │  10kΩ RESISTOR   │      │                  │        │
                               │ │ [== 10k OHM ==]  │      │                  │        │
                               │ └──────────────┬───┘      │                  │        │
                               │                │          │                  │        │
                               ▼ (Direct)       ▼ (Pulse)  ▼ (5V Power)       ▼ (GND)  │
┌──────────────────────────────────────────────────────────────────────────────────────┴─┐
│  🍓 RASPBERRY PI 3B+/4B/5  OR  🎛️ ESP32 DEVKIT CONTROLLER                               │
│                                                                                        │
│   • Power IN: 5V (Direct from Buck Converter OUT+)  +  GND (Pin 6 Common Ground)       │
│   • GPIO 2 (Physical Pin 3)  OR  ESP32 GPIO 18  ◄── VIA 10kΩ RESISTOR (Coin Pulse)     │
│   • GPIO 3 (Physical Pin 5)  OR  ESP32 GPIO 19  ◄── DIRECT WIRE (Inhibit / Coin Lock)  │
│   • Gigabit eth0 (Static 192.168.1.240) ───────────► Ruijie Router LAN 1 Port         │
└────────────────────────────────────────────────────────────────────────────────────────┘`}</code></pre>
              </div>
            </div>

            {/* Wire Color Code Table & Configuration Switches */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Wire Color Code */}
              <div className="lg:col-span-7 bg-neutral-900 border border-neutral-700 rounded-2xl p-4 sm:p-5 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-[#ffe17c] font-black text-xs sm:text-sm uppercase">🎨 Allan &amp; Weiyu Wire Pinout Color Reference</h4>
                  <span className="text-[10px] text-neutral-400 sm:hidden">Scroll ➔</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[420px] w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-700 text-neutral-400">
                      <th className="py-2">COLOR</th>
                      <th className="py-2">FUNCTION</th>
                      <th className="py-2">DESTINATION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 text-neutral-200">
                    <tr>
                      <td className="py-2 font-bold text-rose-400">🔴 Red</td>
                      <td>+12V DC Power</td>
                      <td>Quick Terminal Block (+12V from Centralized PSU)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-bold text-neutral-400">⚫ Black</td>
                      <td>Ground (GND)</td>
                      <td>Quick Terminal Block (COM/GND from Centralized PSU)</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-bold text-white">⚪ White</td>
                      <td>Coin Pulse Signal</td>
                      <td>10kΩ Resistor → GPIO 2 (Pin 3) or ESP32 GPIO 18</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-bold text-neutral-400">🔘 Gray</td>
                      <td>Inhibit Gate Line</td>
                      <td>Relay / GPIO 3 (Pin 5) or ESP32 GPIO 19 (Blocks insertion)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calibration Switches */}
              <div className="lg:col-span-5 bg-neutral-900 border border-neutral-700 rounded-2xl p-5 space-y-3 font-mono text-xs">
                <h4 className="text-[#ffe17c] font-black text-sm uppercase">⚙️ Coinslot DIP Switch Settings</h4>
                <ul className="space-y-2 text-neutral-300">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">1.</span>
                    <span><strong>Pulse Speed:</strong> Set to <strong>MEDIUM (40ms)</strong>. Fastest (20ms) can jitter; Slow (100ms) delays multi-coin counting.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">2.</span>
                    <span><strong>Signal Mode:</strong> Set toggle to <strong>NO (Normal Open)</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">3.</span>
                    <span><strong>Inhibit Line:</strong> Active HIGH = slot physically locked. Active LOW = customer can insert coin.</span>
                  </li>
                </ul>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* Open for Contribution, Testing & Other Hardware Section */}
      <section id="contribute" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-[#ffe17c] bg-dot-grid scroll-mt-12">
        <div className="max-w-7xl mx-auto space-y-12">

          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-black text-[#ffe17c] neo-border rounded-full text-xs font-mono font-black uppercase tracking-wider neo-shadow-xs">
              <span>🤝</span>
              <span>COMMUNITY-DRIVEN &amp; VENDOR-NEUTRAL</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-black">
              Open For Contributions &amp; Hardware Testing
            </h2>
            <p className="text-neutral-900 font-medium text-base sm:text-lg">
              OpenPisoWiFi is built to eliminate proprietary vendor locks. We actively invite developers, hobbyists, and operators to test on new single-board computers, port alternative OpenWrt routers, and integrate specialized vending hardware.
            </p>
          </div>

          {/* Hardware Expansion Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Pillar 1: Single Board Computers & x86 */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-black rounded-xl neo-border flex items-center justify-center text-2xl text-[#ffe17c] neo-shadow-xs">
                    🖥️
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-black uppercase rounded border border-emerald-400">
                    SBCs &amp; Mini PCs
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-black">Alternative Single-Board Computers</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    While Raspberry Pi 3B+/4B/5 is our primary target, our lightweight Linux daemon and Next.js portal can run on virtually any ARM or x86 board.
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 font-mono text-xs">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl">
                    <span className="font-bold text-emerald-700">✓ Verified &amp; Tested:</span>
                    <p className="text-[11px] text-neutral-800 mt-0.5">Raspberry Pi 3B+, 4B, 5 (Debian 12 Bookworm, DietPi, Ubuntu Server)</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl">
                    <span className="font-bold text-amber-800">🧪 Actively Seeking Testers:</span>
                    <ul className="text-[11px] text-neutral-700 mt-1 list-disc list-inside space-y-0.5">
                      <li><strong>Orange Pi:</strong> Zero 2W, Zero 3, 3B, 5 / 5 Plus</li>
                      <li><strong>Banana Pi &amp; NanoPi:</strong> BPI-M4, NanoPi R2S / R4S</li>
                      <li><strong>x86_64:</strong> Intel N100 mini PCs, HP/Dell thin clients</li>
                      <li><strong>Radxa Rock:</strong> Rock 3A, 4C+, Zero series</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t-2 border-black/10">
                <p className="text-[11px] font-bold text-neutral-600">
                  Got an Orange Pi or thin client sitting on your shelf? Help test GPIO interrupt latency and systemd installation!
                </p>
              </div>
            </div>

            {/* Pillar 2: Alternative Routers & Access Points */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-black rounded-xl neo-border flex items-center justify-center text-2xl text-[#ffe17c] neo-shadow-xs">
                    📡
                  </div>
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[10px] font-mono font-black uppercase rounded border border-blue-400">
                    Routers &amp; APs
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-black">Alternative Routers &amp; Firmware</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    Build 1 uses OpenWrt router offloading for high concurrency. We welcome router configuration profiles and image builders for popular budget gear.
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 font-mono text-xs">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl">
                    <span className="font-bold text-emerald-700">✓ Verified &amp; Tested:</span>
                    <p className="text-[11px] text-neutral-800 mt-0.5">Ruijie Reyee EW1200G Pro (OpenWrt 25.12.5 dual-band Gigabit)</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl">
                    <span className="font-bold text-amber-800">🧪 Actively Seeking Testers:</span>
                    <ul className="text-[11px] text-neutral-700 mt-1 list-disc list-inside space-y-0.5">
                      <li><strong>TP-Link:</strong> Archer C6 / A6, WR840N, WR940N</li>
                      <li><strong>GL.iNet:</strong> Flint, Beryl AX, Opal, Slate AX</li>
                      <li><strong>Mikrotik:</strong> RouterOS hotspot &amp; walled garden rules</li>
                      <li><strong>Ubiquiti:</strong> UniFi Access Points with guest portal redirection</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t-2 border-black/10">
                <p className="text-[11px] font-bold text-neutral-600">
                  Have another OpenWrt-compatible router? Help us create and verify automated UCI provisioning scripts.
                </p>
              </div>
            </div>

            {/* Pillar 3: Payment Hardware & Bill Acceptors */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-black rounded-xl neo-border flex items-center justify-center text-2xl text-[#ffe17c] neo-shadow-xs">
                    🪙
                  </div>
                  <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-[10px] font-mono font-black uppercase rounded border border-purple-400">
                    Payment &amp; Sensors
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-black">Vending Hardware &amp; Bill Acceptors</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    Beyond standard Philippine multi-coin slots, we are expanding support to paper bill validators, automated coin hoppers, and custom pulse devices.
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 font-mono text-xs">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl">
                    <span className="font-bold text-emerald-700">✓ Verified &amp; Tested:</span>
                    <p className="text-[11px] text-neutral-800 mt-0.5">Allan &amp; Weiyu Universal multi-coinslots (1, 5, 10, 20 PHP pulses)</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl">
                    <span className="font-bold text-amber-800">🧪 Actively Seeking Testers:</span>
                    <ul className="text-[11px] text-neutral-700 mt-1 list-disc list-inside space-y-0.5">
                      <li><strong>Paper Bill Acceptors:</strong> ICT P70, L70, TP70, NV9 / NV10</li>
                      <li><strong>Coin Dispensers:</strong> Motorized coin hoppers for change return</li>
                      <li><strong>Display &amp; Audio:</strong> I2C 16x2 / 20x4 LCDs, TM1637 7-segment displays, DFPlayer Mini voice prompts</li>
                      <li><strong>Thermal Printers:</strong> POS receipt voucher printing</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t-2 border-black/10">
                <p className="text-[11px] font-bold text-neutral-600">
                  Building a bill-acceptor kiosk or specialized vending setup? Help us calibrate pulse timing and state handling.
                </p>
              </div>
            </div>

          </div>

          {/* Action Box: How You Can Contribute */}
          <div className="bg-black text-white neo-border-3 rounded-3xl p-6 sm:p-10 neo-shadow-xl space-y-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-black uppercase tracking-wider text-[#ffe17c]">HOW TO CONTRIBUTE</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">Join the Community Effort</h3>
              </div>
              <p className="text-xs font-mono text-neutral-400 max-w-md">
                No contribution is too small. From documenting a test on your own SBC to writing drivers or fixing typos, every PR matters.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <div className="text-lg">🧪</div>
                <div className="font-bold text-[#ffe17c] text-sm">1. Test &amp; Benchmark</div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Flash OpenPisoWiFi on your hardware. Report CPU load, pulse accuracy, or temperature in a GitHub issue.
                </p>
              </div>

              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <div className="text-lg">🛠️</div>
                <div className="font-bold text-[#ffe17c] text-sm">2. Add Hardware Drivers</div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Submit pull requests with GPIO pin mappings, router firewall scripts, or bill acceptor serial drivers.
                </p>
              </div>

              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <div className="text-lg">🎨</div>
                <div className="font-bold text-[#ffe17c] text-sm">3. Portal &amp; Web UX</div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Enhance the customer captive portal themes, add localization (Tagalog, Cebuano, Ilocano), or optimize performance.
                </p>
              </div>

              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <div className="text-lg">📖</div>
                <div className="font-bold text-[#ffe17c] text-sm">4. Wiring &amp; Enclosures</div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  Share your 3D-printed kiosk models, laser-cut acrylic box STLs, and wiring schematics with fellow builders.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center sm:justify-start gap-3 sm:gap-4 pt-2">
              <a
                href="https://github.com/haliknihudas666/open-piso-wifi"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-5 py-3 bg-[#ffe17c] text-black font-black text-sm neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-center gap-2"
              >
                <span>⭐ Star &amp; Fork on GitHub</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/haliknihudas666/open-piso-wifi/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-5 py-3 bg-white text-black font-black text-sm neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-center gap-2"
              >
                <span>📜 Read Contributing Guidelines</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/haliknihudas666/open-piso-wifi/issues"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-5 py-3 bg-neutral-800 text-white font-black text-sm border border-neutral-700 rounded-xl hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
              >
                <span>💬 Submit Hardware Test Report</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

        </div>
      </section>

      {/* Quickstart Terminal Section */}
      <section id="quickstart" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-black text-white">
        <div className="max-w-4xl mx-auto space-y-8">

          <div className="text-center space-y-3">
            <span className="px-3 py-1 bg-[#ffe17c] text-black font-mono text-xs font-black uppercase rounded">
              RAPID INSTALLATION
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Ready In Under 3 Minutes
            </h2>
            <p className="text-neutral-400 font-mono text-xs sm:text-sm">
              Run this single command on a clean Raspberry Pi OS or Ubuntu/Debian Linux installation:
            </p>
          </div>

          <div className="bg-neutral-900 border-2 border-neutral-700 rounded-2xl p-5 sm:p-8 space-y-4 neo-shadow-lg">
            <div className="flex items-center justify-between font-mono text-xs text-neutral-400 border-b border-neutral-800 pb-3">
              <span>bash terminal</span>
              <span className="text-emerald-400">root@raspberrypi:~#</span>
            </div>
            <pre className="font-mono text-xs sm:text-sm text-amber-300 overflow-x-auto p-4 bg-black rounded-xl border border-neutral-800">
              <code>curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash</code>
            </pre>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono text-neutral-400 pt-2">
              <div>✓ Auto-provisions systemd daemons</div>
              <div>✓ Initializes local session DB</div>
              <div>✓ Configures default PIN: <strong>1234</strong></div>
            </div>
          </div>

        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-16 sm:py-24 px-4 sm:px-8 border-b-2 border-black bg-white">
        <div className="max-w-4xl mx-auto space-y-10">

          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-neutral-600 font-medium text-sm">
              Everything you need to know about setting up and running OpenPisoWiFi.
            </p>
          </div>

          <div className="space-y-4">

            <details className="group bg-[#f6f4ea] neo-border rounded-2xl p-5 neo-shadow-xs" open>
              <summary className="font-black text-base cursor-pointer list-none flex items-center justify-between">
                <span>Is OpenPisoWiFi truly 100% free with no monthly subscription?</span>
                <span className="transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-700 font-medium leading-relaxed">
                Yes. OpenPisoWiFi is published under the open-source MIT License. You own 100% of your vending revenue. There are no license activation fees, no per-machine fees, and no recurring subscriptions.
              </p>
            </details>

            <details className="group bg-[#f6f4ea] neo-border rounded-2xl p-5 neo-shadow-xs">
              <summary className="font-black text-base cursor-pointer list-none flex items-center justify-between">
                <span>Do I need internet access for the coinslot to authorize customers?</span>
                <span className="transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-700 font-medium leading-relaxed">
                No! Coin detection, Inhibit unlock, customer session tracking, and kernel firewall authorization happen entirely over the local LAN with &lt;25ms latency. If your ISP modem loses connection, clients can still insert coins and receive their allotted local time immediately.
              </p>
            </details>

            <details className="group bg-[#f6f4ea] neo-border rounded-2xl p-5 neo-shadow-xs">
              <summary className="font-black text-base cursor-pointer list-none flex items-center justify-between">
                <span>Can I use a normal home Wi-Fi router instead of flashing OpenWrt?</span>
                <span className="transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-700 font-medium leading-relaxed">
                Yes! With <strong>Build 2 (Universal Standalone Pi Gateway)</strong>, the Raspberry Pi performs the routing, NAT, and captive paywall itself. You can connect any standard off-the-shelf home router (TP-Link, Tenda, Mercusys) in standard Access Point mode using a USB-to-LAN gigabit adapter.
              </p>
            </details>

            <details className="group bg-[#f6f4ea] neo-border rounded-2xl p-5 neo-shadow-xs">
              <summary className="font-black text-base cursor-pointer list-none flex items-center justify-between">
                <span>How does the Supabase Cloud Fleet management work?</span>
                <span className="transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-700 font-medium leading-relaxed">
                Each machine can optionally sync telemetry (daily sales, coin collections, system health) to your free Supabase PostgreSQL database. You can view all your machines in a unified web portal or receive instant push notifications via Telegram Bot.
              </p>
            </details>

            <details className="group bg-[#f6f4ea] neo-border rounded-2xl p-5 neo-shadow-xs">
              <summary className="font-black text-base cursor-pointer list-none flex items-center justify-between">
                <span>Is the project open for contributions, testing, and other hardware?</span>
                <span className="transition group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-700 font-medium leading-relaxed">
                Yes, absolutely! OpenPisoWiFi is 100% community-driven and vendor-neutral. We actively welcome contributions and community testers for alternative Single Board Computers (Orange Pi, Banana Pi, x86 thin clients / mini PCs), alternative OpenWrt routers (TP-Link, GL.iNet, Mikrotik), and specialized vending hardware (ICT paper bill acceptors, coin hoppers, and custom pulse sensors). Check out our <a href="#contribute" className="font-bold underline text-black">Contribution &amp; Hardware section</a> or jump straight into our <a href="https://github.com/haliknihudas666/open-piso-wifi" target="_blank" rel="noreferrer" className="font-bold underline text-black">GitHub repository</a>!
              </p>
            </details>

          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12 px-4 sm:px-8 font-mono text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">

          <div className="flex items-center justify-center md:justify-start gap-3">
            <div className="w-8 h-8 bg-[#ffe17c] text-black font-black flex items-center justify-center rounded-lg shrink-0">
              ⚡
            </div>
            <div className="text-left">
              <span className="font-black text-sm tracking-tight text-[#ffe17c]">OpenPisoWiFi</span>
              <p className="text-[11px] text-neutral-400">Open-Source Hotspot & Kiosk Gateway • MIT License</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2.5 font-bold text-neutral-300 text-center">
            <a href="#architectures" className="hover:text-[#ffe17c]">Architectures</a>
            <a href="#simulator" className="hover:text-[#ffe17c]">Simulator</a>
            <a href="#cloud-fleet" className="hover:text-[#ffe17c]">Cloud Fleet</a>
            <a href="#build-guide" className="hover:text-[#ffe17c]">Build Guide</a>
            <a href="#compare" className="hover:text-[#ffe17c]">Comparison</a>
            <a href="#contribute" className="hover:text-[#ffe17c]">Contribute &amp; Hardware</a>
            <a href="https://github.com/haliknihudas666/open-piso-wifi" target="_blank" rel="noreferrer" className="hover:text-[#ffe17c]">GitHub Repository</a>
          </div>

          <div className="text-neutral-400 text-center md:text-right space-y-1">
            <p>
              Made with ❤️ by{' '}
              <a
                href="https://nicolei.games/"
                target="_blank"
                rel="noreferrer"
                className="text-[#ffe17c] font-bold underline hover:text-white transition-colors"
              >
                Nicolei Esperida
              </a>
            </p>
            <p className="text-[10px] text-neutral-500">
              For the global open-hardware &amp; DIY community.
            </p>
          </div>

        </div>
      </footer>

    </div>
  );
}
