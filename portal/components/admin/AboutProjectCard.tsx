'use client';

import React from 'react';
import {
  Heart,
  Globe,
  Gamepad2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Layers,
  Code2,
  Terminal,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  GitBranch,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

function GithubIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function AboutProjectCard() {
  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <Card className="border-2 border-black dark:border-[#4a6052] bg-[#ffe17c] dark:bg-[#1f2923] shadow-neo">
        <div className="p-6 sm:p-8 space-y-4 text-black dark:text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🪙</span>
              <div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">OpenPisoWiFi</h2>
                <p className="text-xs font-mono font-bold text-neutral-800 dark:text-neutral-300">
                  Open-Source Hotspot Vending Operating System
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-white/80 dark:bg-black/40 text-black dark:text-white font-mono font-bold text-xs">
                MIT License
              </Badge>
              <Badge variant="success" className="font-mono font-bold text-xs">
                v1.0.0
              </Badge>
            </div>
          </div>

          <p className="text-sm font-medium leading-relaxed max-w-3xl text-neutral-900 dark:text-neutral-200">
            A 100% free, community-driven hotspot vending machine operating system designed to liberate operators from proprietary hardware lock-ins, paid software licenses, and recurring vendor fees. Built with modern web technologies, zero-latency Linux kernel <code>nftables</code> packet control, and support for multi-architecture setups.
          </p>

          <div className="pt-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 bg-black text-[#ffe17c] rounded-lg font-bold">Free Forever</span>
            <span className="px-2.5 py-1 bg-white dark:bg-neutral-800 border-2 border-black rounded-lg font-bold">Zero Machine Royalties</span>
            <span className="px-2.5 py-1 bg-white dark:bg-neutral-800 border-2 border-black rounded-lg font-bold">Community Powered</span>
          </div>
        </div>
      </Card>

      {/* Grid: 4 Core Resource Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Card 1: Official Project Site */}
        <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo p-0 overflow-hidden flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="p-4 sm:p-5 border-b-2 border-black dark:border-[#4a6052] bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <Globe className="w-5 h-5 text-emerald-600 shrink-0" />
              <h3 className="text-base font-extrabold tracking-tight truncate">OpenPisoWiFi Project Site</h3>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">Documentation</Badge>
          </div>
          <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
              Explore the official interactive website with complete hardware shopping lists (Shopee verified parts), ASCII wiring diagrams, multi-architecture guides, and live demos.
            </p>
            <div className="pt-2">
              <a
                href="https://openpisowifi.nicolei.games/"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-[#ffe17c] hover:bg-[#ffd850] text-black font-extrabold text-xs neo-border rounded-xl shadow-neo-sm btn-press flex items-center justify-center gap-2"
              >
                <span>Visit openpisowifi.nicolei.games</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </Card>

        {/* Card 2: Creator Website */}
        <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo p-0 overflow-hidden flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="p-4 sm:p-5 border-b-2 border-black dark:border-[#4a6052] bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <Gamepad2 className="w-5 h-5 text-indigo-600 shrink-0" />
              <h3 className="text-base font-extrabold tracking-tight truncate">Nicolei Games</h3>
            </div>
            <Badge variant="purple" className="font-mono text-[10px] shrink-0">Creator</Badge>
          </div>
          <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
              Created and maintained with love by <strong>Nicolei Esperida</strong>. Independent game developer, software engineer, and maker dedicated to crafting high-quality open-source tools and indie games.
            </p>
            <div className="pt-2">
              <a
                href="https://nicolei.games/"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-white dark:bg-neutral-800 text-black dark:text-white hover:bg-neutral-100 font-extrabold text-xs neo-border rounded-xl shadow-neo-sm btn-press flex items-center justify-center gap-2"
              >
                <span>Visit Nicolei Games (nicolei.games)</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </Card>

        {/* Card 3: GitHub Repository */}
        <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo p-0 overflow-hidden flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="p-4 sm:p-5 border-b-2 border-black dark:border-[#4a6052] bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <GithubIcon className="w-5 h-5 text-neutral-900 dark:text-white shrink-0" />
              <h3 className="text-base font-extrabold tracking-tight truncate">GitHub Source Code</h3>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">Public Repo</Badge>
          </div>
          <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
              Review the entire codebase, star the repository, inspect daemon interrupt routines, or submit pull requests. The project welcomes driver contributions for new SBCs, routers, and ESP32 extensions.
            </p>
            <div className="pt-2">
              <a
                href="https://github.com/haliknihudas666/open-piso-wifi"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-black text-white hover:bg-neutral-800 font-extrabold text-xs neo-border rounded-xl shadow-neo-sm btn-press flex items-center justify-center gap-2"
              >
                <span>Star on GitHub</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </Card>

        {/* Card 4: Questions & Issue Logging */}
        <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo p-0 overflow-hidden flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="p-4 sm:p-5 border-b-2 border-black dark:border-[#4a6052] bg-rose-50 dark:bg-rose-950/20 flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <MessageSquare className="w-5 h-5 text-rose-600 shrink-0" />
              <h3 className="text-base font-extrabold tracking-tight truncate">Community Support &amp; Issues</h3>
            </div>
            <Badge variant="danger" className="font-mono text-[10px] shrink-0">Bug Reports</Badge>
          </div>
          <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
              Ran into a hardware gotcha, have an idea for a feature, or encountering an issue with your build? Open a ticket on GitHub Issues to collaborate with the maintainers and fellow kiosk operators.
            </p>
            <div className="pt-2">
              <a
                href="https://github.com/haliknihudas666/open-piso-wifi/issues"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs neo-border rounded-xl shadow-neo-sm btn-press flex items-center justify-center gap-2"
              >
                <span>Log an Issue / Ask Question</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </Card>

      </div>

      {/* Community Callout & Contribution Banner */}
      <Card className="border-2 border-black dark:border-[#4a6052] bg-neutral-50 dark:bg-neutral-900 shadow-neo">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-extrabold text-sm sm:text-base text-black dark:text-white">
              Open for Community Testing &amp; Hardware Contributions
            </h3>
          </div>
          <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
            OpenPisoWiFi is actively seeking testers for alternative Single Board Computers (Orange Pi Zero 3, Banana Pi, Radxa Rock, Intel N100 mini PCs) and alternative router hardware. If you have tested a new hardware configuration or written a driver, please submit a pull request or share your findings on our GitHub issue board!
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-mono text-neutral-600 dark:text-neutral-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Raspberry Pi 3B+/4B/5 Verified
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Ruijie OpenWrt Verified
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> ESP32 Multi-Coinslot Verified
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
