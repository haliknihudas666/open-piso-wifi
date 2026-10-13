'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingBag,
  ExternalLink,
  Cpu,
  Radio,
  Zap,
  Server,
  Cable,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Copy,
  Check,
  Star,
  ArrowRight,
  Layers,
  Sparkles,
  HelpCircle,
  Menu,
  X,
  Send,
  Smartphone,
  Cloud,
  Globe,
  Database,
} from 'lucide-react';

export default function BuildGuidePage() {
  const [activeBuild, setActiveBuild] = useState<1 | 2 | 3>(1);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const copyToClipboard = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f6f4ea] text-black overflow-x-clip selection:bg-[#ffe17c] selection:text-black font-sans">
      
      {/* Top Banner */}
      <aside aria-label="Announcement" className="bg-black text-[#ffe17c] font-mono text-[11px] sm:text-xs py-2 px-4 border-b-2 border-black flex flex-wrap items-center justify-center gap-2 font-bold text-center">
        <span>🛠️</span>
        <span>
          <strong>OFFICIAL HARDWARE MANUAL:</strong> Step-by-step assembly, solderless wiring, and pinouts for OpenPisoWiFi.
        </span>
        <Link href="/" className="underline hover:text-white ml-1">
          Back to Main Site →
        </Link>
      </aside>

      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-[#ffe17c] border-b-2 border-black px-4 sm:px-8 py-3 neo-shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 bg-black text-[#ffe17c] rounded-xl neo-border neo-shadow-xs btn-press flex items-center gap-1.5 font-black text-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg sm:text-2xl tracking-tight leading-none">
                  Build &amp; Wiring Manual
                </span>
                <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[9px] sm:text-[10px] font-black uppercase rounded tracking-wider">
                  COMPLETE GUIDE
                </span>
              </div>
              <p className="text-[11px] font-bold text-neutral-800 leading-none mt-1 hidden sm:block">
                Open-Source Kiosk Architecture &amp; Circuit Blueprint
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-4 font-bold text-xs whitespace-nowrap">
            <a href="#materials" className="hover:underline">1. Materials (BOM)</a>
            <a href="#pinouts" className="hover:underline">2. Wiring &amp; Pins</a>
            <a href="#software" className="hover:underline">3. Setup Software</a>
            <a href="#cloud" className="hover:underline text-sky-700">4. Cloud &amp; Bots</a>
            <Link href="/flasher" className="hover:underline font-black flex items-center gap-1 text-emerald-800">
              ⚡ Web Flasher <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-mono">USB</span>
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/haliknihudas666/open-piso-wifi"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center gap-1.5"
            >
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden p-2 bg-black text-[#ffe17c] rounded-xl neo-border neo-shadow-xs"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 text-white" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t-2 border-black mt-3 pt-3 pb-2 space-y-2">
            <a
              href="#materials"
              onClick={() => setMobileMenuOpen(false)}
              className="block p-2.5 bg-white neo-border rounded-xl font-bold text-xs hover:bg-amber-100"
            >
              📦 1. Bill of Materials &amp; Shopee Parts
            </a>
            <a
              href="#pinouts"
              onClick={() => setMobileMenuOpen(false)}
              className="block p-2.5 bg-white neo-border rounded-xl font-bold text-xs hover:bg-amber-100"
            >
              🔌 2. Wiring Schematic &amp; GPIO Pins
            </a>
            <a
              href="#software"
              onClick={() => setMobileMenuOpen(false)}
              className="block p-2.5 bg-white neo-border rounded-xl font-bold text-xs hover:bg-amber-100"
            >
              💻 3. Software Installation &amp; Provisioning
            </a>
            <a
              href="#cloud"
              onClick={() => setMobileMenuOpen(false)}
              className="block p-2.5 bg-[#ffe17c] neo-border rounded-xl font-bold text-xs hover:bg-amber-200"
            >
              ☁️ 4. Telegram, Supabase &amp; Cloudflare
            </a>
            <a
              href="#troubleshooting"
              onClick={() => setMobileMenuOpen(false)}
              className="block p-2.5 bg-white neo-border rounded-xl font-bold text-xs hover:bg-amber-100"
            >
              ⚙️ 5. Calibration &amp; Troubleshooting
            </a>
            <Link
              href="/flasher"
              onClick={() => setMobileMenuOpen(false)}
              className="block p-2.5 bg-emerald-100 neo-border rounded-xl font-bold text-xs hover:bg-emerald-200 text-emerald-950"
            >
              ⚡ 1-Click ESP32 Web Flasher (USB)
            </Link>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 border-b-2 border-black bg-[#ffe17c] bg-dot-grid">
        <div className="max-w-5xl mx-auto text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-black text-[#ffe17c] neo-border rounded-full text-xs font-mono font-black uppercase tracking-wider neo-shadow-xs">
            <span>⚡ ZERO PROPRIETARY HARDWARE LOCK-IN</span>
          </div>
          <h1 className="text-3xl sm:text-6xl font-black tracking-tight text-black">
            The Complete Piso Wi-Fi Build Guide
          </h1>
          <p className="text-base sm:text-xl font-medium text-neutral-800 max-w-3xl mx-auto leading-relaxed">
            Everything you need to build an enterprise-grade, high-capacity hotspot kiosk with off-the-shelf commercial hardware. Complete electrical schematics, pinout references, and 1-click provisioning scripts.
          </p>

          {/* Setup Selector Switcher */}
          <div className="pt-4">
            <div className="bg-white neo-border-3 rounded-2xl sm:rounded-3xl p-4 sm:p-6 neo-shadow max-w-3xl mx-auto space-y-4 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-black uppercase text-neutral-600">
                    SELECT YOUR HARDWARE TARGET
                  </span>
                </div>
                <span className="text-xs font-bold text-neutral-500">
                  Adapts wiring &amp; steps below
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => setActiveBuild(1)}
                  className={`p-3.5 font-black text-xs sm:text-sm neo-border rounded-xl btn-press flex flex-col items-center justify-center text-center gap-1 ${
                    activeBuild === 1
                      ? 'bg-black text-[#ffe17c] neo-shadow-sm'
                      : 'bg-[#f6f4ea] text-black hover:bg-amber-100'
                  }`}
                >
                  <span className="text-base">🚀</span>
                  <span>Build 1: Pi + Router</span>
                  <span className="text-[10px] font-normal opacity-80">Decoupled OpenWrt (100+ Clients)</span>
                </button>
                <button
                  onClick={() => setActiveBuild(2)}
                  className={`p-3.5 font-black text-xs sm:text-sm neo-border rounded-xl btn-press flex flex-col items-center justify-center text-center gap-1 ${
                    activeBuild === 2
                      ? 'bg-black text-[#ffe17c] neo-shadow-sm'
                      : 'bg-[#f6f4ea] text-black hover:bg-amber-100'
                  }`}
                >
                  <span className="text-base">🔌</span>
                  <span>Build 2: Standalone Pi</span>
                  <span className="text-[10px] font-normal opacity-80">Universal Gateway (Any AP)</span>
                </button>
                <button
                  onClick={() => setActiveBuild(3)}
                  className={`p-3.5 font-black text-xs sm:text-sm neo-border rounded-xl btn-press flex flex-col items-center justify-center text-center gap-1 ${
                    activeBuild === 3
                      ? 'bg-black text-[#ffe17c] neo-shadow-sm'
                      : 'bg-[#f6f4ea] text-black hover:bg-amber-100'
                  }`}
                >
                  <span className="text-base">⚡</span>
                  <span>Build 3: ESP32 Satellite</span>
                  <span className="text-[10px] font-normal opacity-80">Wireless Coin Boxes over LAN</span>
                </button>
              </div>

              <div className="p-3 bg-amber-50 neo-border rounded-xl text-xs font-bold text-neutral-800 flex items-center gap-2">
                <span className="text-base">💡</span>
                <span>
                  {activeBuild === 1 && (
                    <>
                      <strong>Currently Viewing: Build 1 (Industrial Standard).</strong> OpenWrt router offloads Gigabit NAT routing and captive firewalling. Raspberry Pi handles portal UI, tokens, and billing with 0% CPU strain.
                    </>
                  )}
                  {activeBuild === 2 && (
                    <>
                      <strong>Currently Viewing: Build 2 (Universal Plug &amp; Play).</strong> The Raspberry Pi acts as the full NAT router &amp; DHCP server. You can plug in ANY store-bought Wi-Fi router (TP-Link, Tenda, Mercusys) in AP mode without flashing OpenWrt.
                    </>
                  )}
                  {activeBuild === 3 && (
                    <>
                      <strong>Currently Viewing: Build 3 (ESP32 Satellite Boxes).</strong> Multiple wireless coin acceptors communicate directly with the OpenWrt router over Wi-Fi via microsecond ISR interrupts. Flash &amp; configure in 30 seconds using our browser <Link href="/flasher" className="underline font-black hover:text-amber-800">1-Click ESP32 Web Flasher →</Link>
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-16 space-y-20">

        {/* SECTION 1: BILL OF MATERIALS (BOM) */}
        <section id="materials" className="space-y-8 scroll-mt-20">
          <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-mono text-xs font-black rounded uppercase">
                  SECTION 1
                </span>
                <span className="text-xs font-mono font-bold text-neutral-500 uppercase">Hardware Inventory</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black mt-1">
                📦 Bill of Materials &amp; Shopee Verified Parts
              </h2>
              <p className="text-sm font-bold text-neutral-600 mt-1">
                All components are verified standard off-the-shelf electronics. No proprietary boards required.
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-400 text-black font-black text-xs neo-border rounded-lg neo-shadow-xs self-start sm:self-auto">
              ✓ 100% Solderless Capable
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Part 1: Ruijie Reyee EW1200G Pro */}
            <div className={`bg-white neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4 ${
              activeBuild === 1 ? 'ring-4 ring-black ring-offset-2' : ''
            }`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">📡</span>
                  <div className="flex items-center gap-1.5">
                    {activeBuild === 1 ? (
                      <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-mono font-black uppercase rounded">
                        ✓ Core for Build 1
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-neutral-200 text-neutral-600 text-[10px] font-mono font-bold uppercase rounded">
                        Any AP Works
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-mono font-black uppercase rounded">Router</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black">OpenWrt Gigabit Router</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    Tested and verified on Ruijie Reyee EW1200G Pro (compatible with any OpenWrt gigabit router). Full Gigabit WAN + 3 Gigabit LAN ports, Dual-Band AC1200 Wi-Fi with high-power PA/LNA amplifiers.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-800 space-y-0.5">
                  <div><strong>Voltage:</strong> 12V DC (Center Positive Jack)</div>
                  <div><strong>Clients:</strong> 100+ Concurrent Devices</div>
                  <div><strong>OS:</strong> OpenWrt 25.12.5 (Kernel 6.6)</div>
                </div>
              </div>
              <div className="pt-2 border-t-2 border-black/10">
                <a
                  href="https://s.shopee.ph/gQoE0RlxS"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Buy Ruijie Router on Shopee</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Part 2: ESP32 DevKit */}
            <div className={`bg-white neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4 ${
              activeBuild === 3 ? 'ring-4 ring-black ring-offset-2' : ''
            }`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🎛️</span>
                  <div className="flex items-center gap-1.5">
                    {activeBuild === 3 ? (
                      <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-mono font-black uppercase rounded">
                        ✓ Core for Build 3
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-mono font-bold uppercase rounded">
                        Optional Satellite
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[10px] font-mono font-black uppercase rounded">Controller</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black">ESP32 DevKit Board</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    Dual-core 240MHz SoC with hardware interrupt timers for microsecond coin pulse debouncing. Any 30 or 38-pin version (Type-C or Micro-USB) works.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-800 space-y-0.5">
                  <div><strong>Voltage:</strong> 5V (USB or VIN pin via Buck Converter)</div>
                  <div><strong>Logic Level:</strong> 3.3V DC (White pulse wire needs 10kΩ resistor)</div>
                  <div><strong>Interrupts:</strong> Hardware ISR on GPIO 4 (Zero pulse loss)</div>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t-2 border-black/10">
                <Link
                  href="/flasher"
                  className="w-full py-2.5 px-3 bg-black text-[#ffe17c] font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between hover:bg-neutral-800"
                >
                  <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 fill-[#ffe17c]" /> Open 1-Click ESP32 Web Flasher</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <a
                  href="https://s.shopee.ph/3LRZNrLXF6"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Shopee (All Pins / International)</span>
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

            {/* Part 3: Universal Coinslot */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🪙</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-mono font-black uppercase rounded">
                      ✓ All Builds
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-mono font-black uppercase rounded">Acceptor</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black">Universal Multi-Coinslot</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    Recognizes ₱1, ₱5, ₱10, and ₱20 coins (old &amp; new BSP series). Includes optical anti-stringing sensors and hardware drop inhibit lock line.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-800 space-y-0.5">
                  <div><strong>Voltage:</strong> 12V DC (50mA standby, 350mA pulse)</div>
                  <div><strong>Pulse Output:</strong> 12V Pulse (White wire)</div>
                  <div><strong>Inhibit Line:</strong> Active LOW/HIGH (Gray wire)</div>
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

            {/* Part 4: 12V Centralized Power Supply */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">⚡</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-emerald-400 text-black text-[10px] font-mono font-black uppercase rounded">
                      ✓ All Builds
                    </span>
                    <span className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-mono font-black uppercase rounded">Power</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black">12V Centralized Power Supply</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    12V 5A or 10A CCTV metal switching PSU. Powers router, coin acceptor, and Raspberry Pi from a single 220V plug with no voltage sags.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-800 space-y-0.5">
                  <div><strong>Input:</strong> 110V / 220V AC Mains</div>
                  <div><strong>Output:</strong> 12V DC Regulated (Adjustable ±10%)</div>
                  <div><strong>Safety:</strong> Short-circuit &amp; overload cutoff</div>
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

            {/* Part 5: Quick Lever Terminal Blocks */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🔗</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-purple-400 text-black text-[10px] font-mono font-black uppercase rounded">
                      Solderless
                    </span>
                    <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-mono font-black uppercase rounded">Wiring</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black">Quick Lever Terminal Blocks</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    Reusable spring-lever wire clamps. Eliminate electrical tape and soldering. Makes maintenance, parts replacement, and voltage testing effortless.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-800 space-y-0.5">
                  <div><strong>Gauge:</strong> 28 to 12 AWG solid / stranded</div>
                  <div><strong>Rating:</strong> 250V / 32A</div>
                  <div><strong>Type:</strong> 1-in-multiple-out or 2-in-4-out</div>
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

            {/* Part 6: DC-DC Buck Converter & 10kΩ Resistors */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🛡️</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-rose-400 text-white text-[10px] font-mono font-black uppercase rounded">
                      Isolation
                    </span>
                    <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-mono font-black uppercase rounded">Safety</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black">LM2596 Buck &amp; 10kΩ Resistors</h3>
                  <p className="text-xs font-bold text-neutral-600 mt-1 leading-relaxed">
                    LM2596/XL4015 steps down 12V DC to 5.1V 3A for SBC/ESP32. A 10kΩ resistor connects in series between the coinslot white pulse wire and the GPIO pin for current limiting and gate protection.
                  </p>
                </div>
                <div className="p-2.5 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-800 space-y-0.5">
                  <div><strong>Buck Out:</strong> Tune potentiometer to exactly 5.1V (or use USB model)</div>
                  <div><strong>Coin Resistor:</strong> 10kΩ ¼W resistor inline on signal wire</div>
                  <div><strong>Optocoupler:</strong> Not needed — 10kΩ resistor limits input current</div>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t-2 border-black/10">
                <a
                  href="https://s.shopee.ph/8fT5vZTSBc"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 px-3 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> 12V to 5V Buck Converter (USB Plug-and-Play)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://s.shopee.ph/905wKEhobz"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 px-3 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> 12V to 5V Buck Converter (Solder / Screw Terminal)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

          </div>
        </section>

        {/* SECTION 2: WIRING SCHEMATIC & PINOUT REFERENCE */}
        <section id="pinouts" className="space-y-8 scroll-mt-20">
          <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-mono text-xs font-black rounded uppercase">
                  SECTION 2
                </span>
                <span className="text-xs font-mono font-bold text-neutral-500 uppercase">Electrical Circuit</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black mt-1">
                🔌 Complete Wiring Blueprint &amp; Pinout Reference
              </h2>
              <p className="text-sm font-bold text-neutral-600 mt-1">
                Follow this exact circuit schematic to wire the power supply, coinslot, 10kΩ resistor, and controller.
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-neutral-600 font-bold">
              <span>⚡ 12V Central Rail</span> • <span>🛡️ 3.3V Logic Rail</span>
            </div>
          </div>

          {/* ASCII Schematic Card */}
          <div className="bg-black text-white neo-border-3 rounded-2xl sm:rounded-3xl p-5 sm:p-8 neo-shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-xs font-black text-[#ffe17c] uppercase">
                  MASTER POWER &amp; SIGNAL DISTRIBUTION
                </span>
              </div>
              <div className="text-xs font-mono text-neutral-400">
                Target for {activeBuild === 1 ? 'Build 1' : activeBuild === 2 ? 'Build 2' : 'Build 3'}:{' '}
                <span className="text-emerald-400 font-bold">
                  {activeBuild === 3 ? 'ESP32 DevKit (GPIO 4 / GPIO 5)' : 'Raspberry Pi 40-Pin Header (Pins 3 & 5)'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto p-4 bg-neutral-900 border-2 border-neutral-700 rounded-2xl">
              <pre className="font-mono text-[11px] sm:text-xs leading-relaxed text-neutral-200">
                <code>{`┌────────────────────────────────────────────────────────────────────────────────────────┐
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
│   • GPIO 2 (Physical Pin 3)  OR  ESP32 GPIO 4   ◄── VIA 10kΩ RESISTOR (Coin Pulse)     │
│   • GPIO 3 (Physical Pin 5)  OR  ESP32 GPIO 5   ◄── DIRECT WIRE (Inhibit / Coin Lock)  │
│   • Gigabit eth0 (Static 192.168.1.240) ───────────► Ruijie Router LAN 1 Port         │
└────────────────────────────────────────────────────────────────────────────────────────┘`}</code>
              </pre>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-neutral-300">
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl space-y-1">
                <span className="text-[#ffe17c] font-black">⚠️ Critical Rule #1: Common Ground</span>
                <p className="text-neutral-400 text-[11px]">
                  All negative (COM/GND) wires from the 12V PSU, buck converter output, and coin acceptor MUST connect to the same common Ground bus block.
                </p>
              </div>
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl space-y-1">
                <span className="text-[#ffe17c] font-black">⚠️ Critical Rule #2: 10kΩ Resistor Protection</span>
                <p className="text-neutral-400 text-[11px]">
                  Always place a 10kΩ resistor inline between the coinslot White pulse wire and the Pi (Pin 3 / GPIO 2) or ESP32 (GPIO 4). It limits current to &lt;0.3mA and prevents damage to 3.3V logic gates without needing a bulky optocoupler module.
                </p>
              </div>
            </div>
          </div>

          {/* Wire Color Code & Pinout Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Wire Color Code */}
            <div className="lg:col-span-5 bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-4">
              <div className="flex items-center justify-between border-b-2 border-black pb-3">
                <h3 className="font-black text-lg">🎨 Allan &amp; Weiyu 4-Wire Pinout</h3>
                <span className="text-xs font-mono font-bold text-neutral-500">Coinslot Harness</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b-2 border-black/10 text-neutral-500">
                      <th className="py-2">WIRE</th>
                      <th className="py-2">SIGNAL</th>
                      <th className="py-2">DESTINATION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    <tr>
                      <td className="py-2.5 font-bold text-rose-600">🔴 Red</td>
                      <td>+12V Power</td>
                      <td>+12V Quick Terminal Block</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-neutral-800">⚫ Black</td>
                      <td>Ground (GND)</td>
                      <td>COM / GND Quick Terminal Block</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-blue-600">⚪ White</td>
                      <td>Coin Pulse Signal</td>
                      <td>10kΩ Resistor inline → GPIO 2 (Pin 3) / ESP32 GPIO 4</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-neutral-500">🔘 Gray</td>
                      <td>Drop Inhibit Gate</td>
                      <td>Relay NC / Inhibit Lock Output</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-[#f6f4ea] neo-border rounded-xl space-y-2 text-xs">
                <div className="font-black text-black">Coinslot Calibration Switches:</div>
                <ul className="space-y-1 text-neutral-700 list-disc list-inside">
                  <li><strong>Speed Switch:</strong> Set to <strong>MED (40ms)</strong> for reliable pulse counting.</li>
                  <li><strong>Mode Switch:</strong> Set to <strong>NO (Normally Open)</strong>.</li>
                  <li><strong>Inhibit Line:</strong> Active LOW permits insertion; HIGH rejects coin.</li>
                </ul>
              </div>
            </div>

            {/* Microcontroller Pinout Table */}
            <div className="lg:col-span-7 bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-4">
              <div className="flex items-center justify-between border-b-2 border-black pb-3">
                <h3 className="font-black text-lg">📌 Pinout Mapping Table</h3>
                <span className="text-xs font-mono font-bold text-neutral-500">Pi &amp; ESP32</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b-2 border-black/10 text-neutral-500">
                      <th className="py-2">FUNCTION</th>
                      <th className="py-2">RASPBERRY PI PIN</th>
                      <th className="py-2">ESP32 PIN</th>
                      <th className="py-2">SIGNAL NOTES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    <tr className="bg-amber-50/50">
                      <td className="py-2.5 font-bold">5V Power IN</td>
                      <td>Physical Pin 2 (5V)</td>
                      <td>VIN Pin (5V)</td>
                      <td>Fed from Buck Converter (5.1V tuned)</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold">Ground (GND)</td>
                      <td>Physical Pin 6 (GND)</td>
                      <td>GND Pin</td>
                      <td>Common return to PSU Ground bus</td>
                    </tr>
                    <tr className="bg-emerald-50/50 font-bold">
                      <td className="py-2.5 text-emerald-800">COIN PULSE (ISR)</td>
                      <td>Physical Pin 3 (GPIO 2)</td>
                      <td>GPIO 4 (D4)</td>
                      <td>Microsecond pulse detection interrupt</td>
                    </tr>
                    <tr className="bg-blue-50/50 font-bold">
                      <td className="py-2.5 text-blue-800">INHIBIT GATE</td>
                      <td>Physical Pin 5 (GPIO 3)</td>
                      <td>GPIO 5 (D5)</td>
                      <td>Software lock prevents coin drops when idle</td>
                    </tr>
                    <tr>
                      <td className="py-2.5">Ethernet WAN/LAN</td>
                      <td>eth0 (192.168.1.240)</td>
                      <td>Wi-Fi (Staff AP)</td>
                      <td>Direct link to OpenWrt router LAN port</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3.5 bg-neutral-900 text-neutral-200 rounded-xl font-mono text-xs space-y-1">
                <div className="text-[#ffe17c] font-black">💡 Software Pin Override:</div>
                <p className="text-[11px] text-neutral-300">
                  You can change the assigned pins at any time without recompiling by setting <code>COIN_GPIO_PIN=2</code> and <code>INHIBIT_GPIO_PIN=3</code> inside <code>/opt/open-piso-wifi/daemon/.env</code> or directly inside the Admin portal at <code>:3000/admin</code>.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* SECTION 3: STEP-BY-STEP SOFTWARE INSTALLATION */}
        <section id="software" className="space-y-8 scroll-mt-20">
          <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-mono text-xs font-black rounded uppercase">
                  SECTION 3
                </span>
                <span className="text-xs font-mono font-bold text-neutral-500 uppercase">Provisioning &amp; Scripts</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black mt-1">
                💻 Step-by-Step Software Installation
              </h2>
              <p className="text-sm font-bold text-neutral-600 mt-1">
                Step-by-step terminal instructions tailored for {activeBuild === 1 ? 'Build 1' : activeBuild === 2 ? 'Build 2' : 'Build 3'}.
              </p>
            </div>
            <span className="px-3 py-1 bg-[#ffe17c] text-black font-black text-xs neo-border rounded-lg neo-shadow-xs self-start sm:self-auto">
              Automated 1-Click Scripts
            </span>
          </div>

          {/* BUILD 1 GUIDE */}
          {activeBuild === 1 && (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-100 neo-border-2 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🚀</span>
                  <div>
                    <h3 className="font-black text-sm sm:text-base">Step-by-Step Guide for Build 1 (Pi + OpenWrt Router)</h3>
                    <p className="text-xs text-neutral-700">Commercial deployment: OpenWrt handles high concurrency, Pi serves Next.js portal.</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-black text-xs rounded">ACTIVE</span>
              </div>

              <div className="space-y-4">

                {/* Step 1 */}
                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 1</span>
                    <h4 className="text-lg font-black">Prepare Raspberry Pi OS &amp; Install OpenPisoWiFi</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Flash <strong>Raspberry Pi OS Lite (64-bit)</strong> or Ubuntu Server onto your micro-SD card or NVMe SSD. Boot the Pi, connect via SSH, and run the automated setup installer:
                  </p>
                  <div className="relative">
                    <pre className="p-3 bg-neutral-900 text-amber-300 rounded-xl font-mono text-xs overflow-x-auto">
                      <code>curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash</code>
                    </pre>
                    <button
                      onClick={() => copyToClipboard('curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash', 'b1-step1')}
                      className="absolute right-2 top-2 p-1.5 bg-neutral-800 text-neutral-300 hover:text-white rounded-lg border border-neutral-700 btn-press"
                      title="Copy command"
                    >
                      {copiedCmd === 'b1-step1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    This automatically installs Node.js, Bun, SQLite, systemd service daemons, and builds the Next.js captive paywall.
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 2</span>
                    <h4 className="text-lg font-black">Flash &amp; Provision OpenWrt Router (Tested on Ruijie EW1200G Pro)</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Connect an Ethernet cable from Raspberry Pi <code>eth0</code> to <strong>LAN 1</strong> port on your OpenWrt router (e.g. Ruijie EW1200G Pro). Then execute our automated router deployer:
                  </p>
                  <div className="relative">
                    <pre className="p-3 bg-neutral-900 text-amber-300 rounded-xl font-mono text-xs overflow-x-auto">
                      <code>bash scripts/deploy-router.sh --router-ip 192.168.1.1 --portal-ip 192.168.1.240</code>
                    </pre>
                    <button
                      onClick={() => copyToClipboard('bash scripts/deploy-router.sh --router-ip 192.168.1.1 --portal-ip 192.168.1.240', 'b1-step2')}
                      className="absolute right-2 top-2 p-1.5 bg-neutral-800 text-neutral-300 hover:text-white rounded-lg border border-neutral-700 btn-press"
                      title="Copy command"
                    >
                      {copiedCmd === 'b1-step2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl text-xs space-y-1 font-mono text-neutral-700">
                    <div>✓ Injects kernel nftables rules in <code>/etc/nftables.d/piso_portal.nft</code></div>
                    <div>✓ Sets alias gateway IP <code>10.0.0.1</code> &amp; dnsmasq domain <code>wifi.local</code></div>
                    <div>✓ Configures Dropbear SSH keyless exchange with the Pi daemon</div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 3</span>
                    <h4 className="text-lg font-black">Wire 12V Coinslot to Pi GPIO</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Wire 12V and GND from your centralized power supply into the Allan or Weiyu coinslot. Connect the white pulse line through a <strong>10kΩ resistor</strong> into Pi <strong>Physical Pin 3 (GPIO 2)</strong>, and inhibit to <strong>Physical Pin 5 (GPIO 3)</strong>.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 4</span>
                    <h4 className="text-lg font-black">Verify Live Pulses &amp; Access Admin Console</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Open your web browser and navigate to <code>http://192.168.1.240:3000/admin</code>. Default PIN is <strong>1234</strong>. Drop a ₱1 or ₱5 coin into the slot and observe the real-time pulse monitor increment. Connect your phone to the router Wi-Fi and verify the captive portal displays instantly.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* BUILD 2 GUIDE */}
          {activeBuild === 2 && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-100 neo-border-2 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔌</span>
                  <div>
                    <h3 className="font-black text-sm sm:text-base">Step-by-Step Guide for Build 2 (Universal Standalone Pi Gateway)</h3>
                    <p className="text-xs text-neutral-700">Plug &amp; play: Raspberry Pi acts as router &amp; firewall; any standard store-bought AP works.</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-blue-600 text-white font-black text-xs rounded">ACTIVE</span>
              </div>

              <div className="space-y-4">

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 1</span>
                    <h4 className="text-lg font-black">Install OpenPisoWiFi on Raspberry Pi 4 or 5</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Run the automated installation script on a fresh install of Raspberry Pi OS:
                  </p>
                  <pre className="p-3 bg-neutral-900 text-amber-300 rounded-xl font-mono text-xs overflow-x-auto">
                    <code>curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash</code>
                  </pre>
                </div>

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 2</span>
                    <h4 className="text-lg font-black">Enable Standalone Gateway Routing (Zero Flashing)</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Plug a USB3-to-Gigabit Ethernet adapter into your Pi (this becomes <code>eth1</code> for your client Wi-Fi router). Your built-in <code>eth0</code> connects to your ISP modem. Run:
                  </p>
                  <div className="relative">
                    <pre className="p-3 bg-neutral-900 text-amber-300 rounded-xl font-mono text-xs overflow-x-auto">
                      <code>sudo bash scripts/setup-pi-gateway.sh --wan eth0 --lan eth1 --subnet 10.0.0.1/22</code>
                    </pre>
                    <button
                      onClick={() => copyToClipboard('sudo bash scripts/setup-pi-gateway.sh --wan eth0 --lan eth1 --subnet 10.0.0.1/22', 'b2-step2')}
                      className="absolute right-2 top-2 p-1.5 bg-neutral-800 text-neutral-300 hover:text-white rounded-lg border border-neutral-700 btn-press"
                      title="Copy command"
                    >
                      {copiedCmd === 'b2-step2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-neutral-600 font-mono space-y-1">
                    <div>• <code>eth0</code> gets WAN internet from your ISP modem via DHCP.</div>
                    <div>• <code>eth1</code> becomes static <code>10.0.0.1</code> and runs dnsmasq DHCP leasing 10.0.0.10 - 10.0.3.250.</div>
                    <div>• Native Linux kernel <code>nftables</code> masquerading and captive portal redirection is enabled automatically.</div>
                  </div>
                </div>

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 3</span>
                    <h4 className="text-lg font-black">Connect Any Commercial Home Wi-Fi Router</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Take ANY off-the-shelf home Wi-Fi router (TP-Link, Tenda, Mercusys, D-Link, etc.). Log into its setup page and set its operating mode to <strong>Access Point (AP) / Bridge Mode</strong>. Turn off DHCP on the router so the Pi handles IP leasing. Plug an Ethernet cable from Pi <code>eth1</code> into the WAN/LAN port of the router.
                  </p>
                </div>

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 4</span>
                    <h4 className="text-lg font-black">Wire Coinslot &amp; Launch Admin Portal</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Wire coinslot pulse to Pi GPIO 2 (Pin 3) with a 10kΩ resistor. Open <code>http://10.0.0.1:3000/admin</code> from your phone or browser to customize rates and voucher codes.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* BUILD 3 GUIDE */}
          {activeBuild === 3 && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-100 neo-border-2 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <h3 className="font-black text-sm sm:text-base">Step-by-Step Guide for Build 3 (ESP32 Satellite Coinslots)</h3>
                    <p className="text-xs text-neutral-700">Wireless multi-coinslot expansion across the building with direct local LAN communication.</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-amber-400 text-black font-black text-xs rounded">ACTIVE</span>
              </div>

              <div className="space-y-4">

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 1</span>
                    <h4 className="text-lg font-black">Deploy Central Piso WiFi Daemon Server</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Install OpenPisoWiFi on your central server, Raspberry Pi, or mini-PC on your local LAN:
                  </p>
                  <pre className="p-3 bg-neutral-900 text-amber-300 rounded-xl font-mono text-xs overflow-x-auto">
                    <code>curl -fsSL https://raw.githubusercontent.com/haliknihudas666/open-piso-wifi/main/scripts/install.sh | sudo bash</code>
                  </pre>
                  <p className="text-[11px] text-neutral-600 font-mono">
                    Ensure port <code>4000</code> is accessible on the local network (e.g. <code>http://192.168.1.240:4000</code>).
                  </p>
                </div>

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-black/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 2</span>
                      <h4 className="text-lg font-black">Flash &amp; Configure ESP32 Satellite Firmware</h4>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-100 text-emerald-900 border border-emerald-600 px-2 py-0.5 rounded font-bold">
                      RECOMMENDED: BROWSER FLASHER
                    </span>
                  </div>

                  {/* Method A: Official 1-Click Web Flasher */}
                  <div className="p-4 bg-[#ffe17c] neo-border rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5 text-black">
                        <Zap className="w-4 h-4 fill-black" />
                        <span>Method A: 1-Click ESP32 Web Flasher (Zero Arduino IDE Needed)</span>
                      </span>
                      <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-[9px] font-bold rounded">
                        FASTEST
                      </span>
                    </div>
                    <p className="text-xs text-neutral-800 leading-relaxed font-medium">
                      Plug your ESP32 into a USB port and open our official browser-based flasher. You can flash the firmware in ~30 seconds and configure your <strong>Slot ID</strong>, <strong>Slot Name</strong>, <strong>Secret Token</strong>, and <strong>Wi-Fi credentials</strong> directly from the browser into ESP32 NVS flash!
                    </p>
                    <div className="pt-1">
                      <Link
                        href="/flasher"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-[#ffe17c] font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press hover:bg-neutral-800 cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5 fill-[#ffe17c]" />
                        <span>Launch ESP32 Web Flasher →</span>
                      </Link>
                    </div>
                  </div>

                  {/* Method B: Arduino IDE / PlatformIO */}
                  <div className="space-y-2 pt-2 border-t border-neutral-200">
                    <span className="font-bold text-xs text-neutral-700">
                      Method B: Compile from Source (Arduino IDE / PlatformIO)
                    </span>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      For developers who want to inspect or modify C++ code, open <code>firmware/esp32-satellite/esp32-satellite.ino</code>:
                    </p>
                    <div className="p-3 bg-neutral-900 text-neutral-200 rounded-xl font-mono text-xs space-y-1">
                      <div className="text-neutral-500">// firmware/esp32-satellite/esp32-satellite.ino</div>
                      <div className="text-emerald-400">const char* WIFI_SSID     = &quot;OpenPisoWiFi&quot;;</div>
                      <div className="text-emerald-400">const char* WIFI_PASS     = &quot;&quot;; // (leave empty if open)</div>
                      <div className="text-amber-300">const char* DAEMON_HOST   = &quot;http://10.0.0.1:4000&quot;;</div>
                      <div className="text-amber-300">const char* SATELLITE_SECRET = &quot;generate-a-strong-secret-token&quot;;</div>
                    </div>
                    <p className="text-[11px] text-neutral-600 font-mono">
                      Set board to <strong>ESP32 Dev Module</strong>, connect your USB cable, and click <strong>Upload</strong>.
                    </p>
                  </div>
                </div>

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 3</span>
                    <h4 className="text-lg font-black">Wire Coinslot Directly to ESP32</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Wire 12V power to coinslot. Connect the white pulse line via a 10kΩ series resistor to ESP32 <strong>GPIO 4</strong> (hardware interrupt ISR), and the gray inhibit gate wire to <strong>GPIO 5</strong>. Power the ESP32 via a 5V buck converter from the 12V PSU.
                  </p>
                </div>

                <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-black text-[#ffe17c] font-mono text-xs font-black rounded">STEP 4</span>
                    <h4 className="text-lg font-black">Deploy Wireless Coin Box Anywhere in the Venue</h4>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">
                    Mount the coin box 50 meters away near the front counter or second floor. As soon as a customer drops coins, the hardware interrupt fires within microseconds, sending a direct HTTP POST over LAN in &lt;20ms without relying on cloud or internet stability.
                  </p>
                </div>

              </div>
            </div>
          )}

        </section>

        {/* SECTION 4: CLOUD, TELEGRAM & REMOTE FLEET INTEGRATION */}
        <section id="cloud" className="space-y-8 scroll-mt-20">
          <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-mono text-xs font-black rounded uppercase">
                  SECTION 4
                </span>
                <span className="text-xs font-mono font-bold text-sky-700 uppercase">Cloud &amp; Automation</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black mt-1">
                ☁️ Telegram, Supabase, Vercel &amp; Cloudflare Setup
              </h2>
              <p className="text-sm font-bold text-neutral-600 mt-1">
                100% free remote monitoring stack. Configure Telegram bot alerts directly in the Admin GUI by simply pasting your key — zero terminal commands or <code>.env</code> file edits required.
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-neutral-600 font-bold">
              <span>🤖 Long-Polling Bot</span> • <span>⚡ Supabase PostgreSQL</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Integration 1: Telegram Bot */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b-2 border-black pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <h3 className="text-lg font-black leading-tight">Telegram Bot Remote Push Alerts</h3>
                      <span className="text-[10px] font-mono font-bold text-sky-600 uppercase">Instant Phone Push • Zero .env Editing</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-black rounded border border-emerald-300">
                    100% FREE
                  </span>
                </div>

                <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                  Receive an instant push notification on your phone the millisecond a coin is dropped or the cash box is emptied. Operates via <strong>outbound HTTPS long-polling</strong>, meaning it works 100% seamlessly behind CGNAT, mobile hotspots, and double-NAT without opening firewall ports.
                </p>

                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-amber-50 neo-border rounded-xl space-y-1 text-black">
                    <span className="font-bold text-amber-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Step-by-Step Setup (Takes &lt;60 Seconds):
                    </span>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-neutral-800 pt-1">
                      <li>Open Telegram and message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-bold underline text-sky-700">@BotFather</a>.</li>
                      <li>Send <code>/newbot</code>, name your bot, and copy the <strong>HTTP API Token</strong>.</li>
                      <li>Message <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="font-bold underline text-sky-700">@userinfobot</a> and send <code>/start</code> to copy your numeric <strong>Chat ID</strong>.</li>
                      <li>Open <code>http://10.0.0.1:3000/admin</code> ➔ <strong>Cloud &amp; Satellites</strong>.</li>
                      <li>Paste the <strong>Bot Token</strong> and <strong>Admin Chat ID</strong> into the fields, click <strong>Save &amp; Connect</strong>, then click <strong>Send Test Alert</strong>!</li>
                    </ol>
                  </div>

                  <div className="p-3 bg-neutral-900 border border-neutral-700 rounded-xl space-y-1.5 text-neutral-200">
                    <div className="text-[#ffe17c] font-black text-[11px]">Supported Remote Phone Commands:</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><code>/sales</code> - Live revenue today</div>
                      <div><code>/slots</code> - Hardware health</div>
                      <div><code>/emptybox</code> - Reset audit counter</div>
                      <div><code>/wan</code> - Router latency &amp; ping</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-700 flex items-center justify-between">
                <span>🛡️ Security: Locked strictly to your Admin Chat ID</span>
                <span className="font-bold text-emerald-700">Anti-Spam Filtered</span>
              </div>
            </div>

            {/* Integration 2: Supabase PostgreSQL */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b-2 border-black pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <h3 className="text-lg font-black leading-tight">Supabase PostgreSQL Fleet Sync</h3>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase">Cloud Database • Multi-Branch Telemetry</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-black rounded border border-emerald-300">
                    $0/MO FREE TIER
                  </span>
                </div>

                <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                  Centralize coin revenue, transaction records, voucher logs, and kiosk heartbeats from all your machines across multiple barangays into a single high-performance PostgreSQL cloud database.
                </p>

                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-emerald-50 neo-border rounded-xl space-y-1 text-black">
                    <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-600" />
                      Step-by-Step Setup:
                    </span>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-neutral-800 pt-1">
                      <li>Create a free account at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="font-bold underline text-emerald-700">supabase.com</a>.</li>
                      <li>Create a new project (e.g. <code>openpiso-fleet</code>, Region: Singapore).</li>
                      <li>In <strong>SQL Editor</strong>, paste and run the contents of <code>supabase/schema.sql</code>.</li>
                      <li>Copy your <strong>Project URL</strong> and <strong>API Key</strong> from Settings ➔ API.</li>
                      <li>Paste them into your kiosk <code>/admin/cloud</code> console. Telemetry queues in memory and flushes every 60s!</li>
                    </ol>
                  </div>

                  <div className="p-3 bg-neutral-900 border border-neutral-700 rounded-xl space-y-1.5 text-neutral-200">
                    <div className="text-emerald-400 font-black text-[11px]">Fail-Soft Offline Resilience:</div>
                    <p className="text-[11px] text-neutral-300 leading-relaxed">
                      If the kiosk ISP drops offline, transactions queue in memory safely. The moment connection restores, all buffered coin records automatically flush to Supabase with zero data loss.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-700 flex items-center justify-between">
                <span>📊 Production Tables: <code>piso_machines</code>, <code>piso_transactions</code></span>
                <span className="font-bold text-emerald-700">Row Level Security</span>
              </div>
            </div>

            {/* Integration 3: Vercel Cloud Admin Hosting */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b-2 border-black pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">▲</span>
                    <div>
                      <h3 className="text-lg font-black leading-tight">Vercel Cloud Fleet Dashboard</h3>
                      <span className="text-[10px] font-mono font-bold text-neutral-600 uppercase">24/7 Web App • Global Access</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 text-[10px] font-mono font-black rounded border border-neutral-300">
                    SERVERLESS
                  </span>
                </div>

                <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                  Deploy the OpenPisoWiFi admin portal to Vercel for a public cloud dashboard (<code>https://your-piso.vercel.app</code>) to check daily earnings, transaction logs, and kiosk uptime from any smartphone or laptop worldwide.
                </p>

                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-neutral-50 neo-border rounded-xl space-y-1 text-black">
                    <span className="font-bold text-black flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-neutral-800" />
                      Deployment Steps:
                    </span>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-neutral-800 pt-1">
                      <li>Push your repository fork to GitHub.</li>
                      <li>In <a href="https://vercel.com" target="_blank" rel="noreferrer" className="font-bold underline text-black">vercel.com</a>, click <strong>Add New Project</strong> and import your repo.</li>
                      <li>Set <strong>Root Directory</strong> to <code>portal</code>. Vercel automatically detects Next.js.</li>
                      <li>Add environment variables: <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</li>
                      <li>Click <strong>Deploy</strong>. Open <code>/admin/cloud</code> on your live Vercel URL to monitor all machines!</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-700 flex items-center justify-between">
                <span>⚙️ Preconfigured: <code>portal/vercel.json</code></span>
                <span className="font-bold text-black">Zero Config Next.js</span>
              </div>
            </div>

            {/* Integration 4: Cloudflare Zero-Trust Tunnel */}
            <div className="bg-white neo-border-3 rounded-2xl p-6 sm:p-7 neo-shadow space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b-2 border-black pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🟠</span>
                    <div>
                      <h3 className="text-lg font-black leading-tight">Cloudflare Zero-Trust Tunnel</h3>
                      <span className="text-[10px] font-mono font-bold text-orange-600 uppercase">CGNAT Bypass • Zero Port Forwarding</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-mono font-black rounded border border-orange-300">
                    SECURE ENCLAVE
                  </span>
                </div>

                <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                  Want direct remote web access to your physical Raspberry Pi&apos;s local admin dashboard (<code>http://10.0.0.1:3000/admin</code>) from anywhere on earth without opening ports or risking hacker scans? Use a free Cloudflare Tunnel.
                </p>

                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-orange-50 neo-border rounded-xl space-y-1 text-black">
                    <span className="font-bold text-orange-900 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-orange-600" />
                      3-Step Tunnel Setup:
                    </span>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-neutral-800 pt-1">
                      <li>In <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="font-bold underline text-orange-700">dash.cloudflare.com</a>, open <strong>Zero Trust</strong> ➔ <strong>Networks</strong> ➔ <strong>Tunnels</strong>.</li>
                      <li>Click <strong>Add a Tunnel</strong> (select <code>cloudflared</code>) and name it <code>pisowifi-gateway</code>.</li>
                      <li>Run the single provided curl command on your Raspberry Pi terminal to install the lightweight daemon.</li>
                      <li>Route public hostname (e.g. <code>kiosk1.yourdomain.com</code>) to <code>http://localhost:3000</code>. That&apos;s it!</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-neutral-100 rounded-xl font-mono text-[11px] text-neutral-700 flex items-center justify-between">
                <span>📖 Detailed manual: <code>docs/CLOUD_AND_INTEGRATIONS_GUIDE.md</code></span>
                <span className="font-bold text-orange-700">DDoS Protected</span>
              </div>
            </div>

          </div>
        </section>

        {/* SECTION 5: CALIBRATION & TROUBLESHOOTING */}
        <section id="troubleshooting" className="space-y-8 scroll-mt-20">
          <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black text-[#ffe17c] font-mono text-xs font-black rounded uppercase">
                  SECTION 5
                </span>
                <span className="text-xs font-mono font-bold text-neutral-500 uppercase">Field Diagnostics</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black mt-1">
                ⚙️ Calibration, Testing &amp; Common Troubleshooting
              </h2>
              <p className="text-sm font-bold text-neutral-600 mt-1">
                Solutions to common hardware gotchas encountered by DIY operators.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-black text-black">1. Coin Falls Through or Gets Rejected</h3>
              </div>
              <ul className="text-xs text-neutral-700 space-y-1.5 list-disc list-inside">
                <li><strong>Inhibit Gate Locked:</strong> Ensure the gray inhibit line is not held HIGH. If disconnected on some models, it defaults to locked. In the admin console, verify the inhibit line is UNLOCKED during coin drop windows.</li>
                <li><strong>Voltage Drop:</strong> Measure 12V PSU output with a multimeter under load. If it sags below 11.2V, the optical coin sensors cannot calibrate.</li>
                <li><strong>Dirty Sensor:</strong> Blow compressed air through the coin chute to clear dust.</li>
              </ul>
            </div>

            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-black text-black">2. Phantom Pulses or Double Counting</h3>
              </div>
              <ul className="text-xs text-neutral-700 space-y-1.5 list-disc list-inside">
                <li><strong>Pulse Speed Too Fast:</strong> Switch the coinslot DIP toggle from FAST (20ms) to <strong>MEDIUM (40ms)</strong>. 20ms pulses often produce switch-bounce jitter.</li>
                <li><strong>Missing 10kΩ Resistor:</strong> Direct unbuffered wiring picks up inductive RF noise and overcurrent. Always install a 10kΩ resistor inline on the white signal line.</li>
                <li><strong>Floating Ground:</strong> Ensure 12V COM and 5V GND are tied together at the common bus block.</li>
              </ul>
            </div>

            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
              <div className="flex items-center gap-2 text-amber-600">
                <HelpCircle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-black text-black">3. Captive Portal Doesn&apos;t Pop Up Automatically</h3>
              </div>
              <ul className="text-xs text-neutral-700 space-y-1.5 list-disc list-inside">
                <li><strong>DNS Masquerade:</strong> Verify <code>wifi.local</code> resolves to <code>10.0.0.1</code> on the client phone.</li>
                <li><strong>Firewall Table:</strong> SSH into OpenWrt or Pi and run <code>sudo nft list table inet piso_portal</code> to confirm port 80 redirect rules are loaded.</li>
                <li><strong>Manual Access:</strong> Open browser and navigate directly to <code>http://10.0.0.1:3000</code> or <code>http://wifi.local</code>.</li>
              </ul>
            </div>

            <div className="bg-white neo-border-3 rounded-2xl p-6 neo-shadow space-y-3">
              <div className="flex items-center gap-2 text-amber-600">
                <HelpCircle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-black text-black">4. Router Reboots When Coins Are Inserted</h3>
              </div>
              <ul className="text-xs text-neutral-700 space-y-1.5 list-disc list-inside">
                <li><strong>Power Supply Under-capacity:</strong> When the coin solenoid fires, it draws a 350mA spike. A weak 12V 1A adapter will brown out and reset the router.</li>
                <li><strong>Solution:</strong> Always use the recommended <strong>12V 5A or 10A Centralized Metal PSU</strong>.</li>
              </ul>
            </div>

          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t-2 border-black bg-[#ffe17c] py-10 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="font-black text-xl">OpenPisoWiFi</span>
              <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[10px] font-black uppercase rounded">
                MIT LICENSE
              </span>
            </div>
            <p className="text-xs font-bold text-neutral-800 mt-1">
              Community-driven, vendor-neutral, 100% free hotspot vending operating system.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-black">
            <Link href="/" className="hover:underline">
              ← Return to Home
            </Link>
            <a
              href="https://github.com/haliknihudas666/open-piso-wifi"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
