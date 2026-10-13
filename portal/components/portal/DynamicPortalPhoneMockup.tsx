'use client';

import React from 'react';
import {
  Wifi,
  ChevronLeft,
  ChevronRight,
  X,
  Coins,
  Sparkles,
  CheckCircle2,
  Copy,
  Clock,
  ArrowRight,
} from 'lucide-react';

export interface DynamicPortalPhoneMockupProps {
  state?: 'standby' | 'active' | 'credited' | 'connected' | 'session';
  title?: string;
  ssid?: string;
  portalIp?: string;
  rateText?: string;
  compact?: boolean;
  aspectRatio?: '9:16' | '16:9';
  className?: string;
}

export function DynamicPortalPhoneMockup({
  state = 'standby',
  title = 'Niconiellet Piso Wifi',
  ssid,
  portalIp = '10.0.0.1',
  rateText = '₱1 = 10 Minutes',
  compact = false,
  aspectRatio = '9:16',
  className = '',
}: DynamicPortalPhoneMockupProps) {
  const displayTitle = title || ssid || 'Niconiellet Piso Wifi';
  const displaySsid = ssid || 'NiconielletPisoWifi';

  return (
    <div
      className={`${
        aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'
      } rounded-[22px] sm:rounded-[26px] border-3 sm:border-4 border-black bg-black p-1 sm:p-1.5 shadow-neo select-none font-sans relative overflow-hidden flex flex-col shrink-0 ${
        compact ? 'max-w-[210px]' : 'max-w-[280px]'
      } ${className}`}
    >
      {/* Phone Outer Notch & Speaker */}
      <div
        className={`absolute top-1.5 sm:top-2 left-1/2 -translate-x-1/2 bg-black rounded-full z-30 flex items-center justify-center ${
          compact ? 'w-8 h-1.5' : 'w-12 h-2.5'
        }`}
      >
        <div className="w-4 sm:w-6 h-0.5 sm:h-1 bg-neutral-800 rounded-full" />
      </div>

      {/* Screen Container - Fixed 9:16 / No Scrollbars */}
      <div className="rounded-[16px] sm:rounded-[20px] bg-[#f6f4ea] text-black overflow-hidden flex-1 flex flex-col justify-between relative border border-black/30">
        {/* iOS / Android Status Bar */}
        <div
          className={`bg-[#f6f4ea] px-2.5 pt-2 pb-0.5 flex items-center justify-between font-black text-black border-b border-black/5 ${
            compact ? 'text-[7.5px]' : 'text-[10px]'
          }`}
        >
          <span>8:14</span>
          <div className="flex items-center gap-1.5">
            <Wifi className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-black stroke-[2.5]`} />
            <span className={`${compact ? 'text-[7.5px]' : 'text-[9px]'} font-mono font-bold`}>
              5G
            </span>
            <div
              className={`${
                compact ? 'w-3 h-1.5' : 'w-3.5 h-2'
              } rounded-xs border border-black p-0.5 flex items-center`}
            >
              <div className="w-full h-full bg-black rounded-[0.5px]" />
            </div>
          </div>
        </div>

        {/* Captive Portal Top Browser Header Bar */}
        <div
          className={`bg-[#242b26] text-white px-2 py-1 border-b-2 border-black flex items-center justify-between gap-1 shadow-sm shrink-0 ${
            compact ? 'text-[7.5px]' : 'text-[9px]'
          }`}
        >
          <div className="flex items-center gap-0.5 text-neutral-400">
            <ChevronLeft className={`${compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'}`} />
            <ChevronRight className={`${compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'}`} />
          </div>

          <div className="flex flex-col items-center min-w-0 text-center flex-1 px-0.5">
            <span
              className={`${
                compact ? 'text-[6px]' : 'text-[7.5px]'
              } text-neutral-400 truncate font-mono`}
            >
              Not Secure — {portalIp}
            </span>
            <span
              className={`${
                compact ? 'text-[7.5px] max-w-[85px]' : 'text-[9.5px] max-w-[130px]'
              } font-bold text-white truncate`}
            >
              {displayTitle}
            </span>
          </div>

          <div
            className={`${
              compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'
            } rounded-full bg-neutral-700 flex items-center justify-center text-neutral-300 shrink-0`}
          >
            <X className={`${compact ? 'w-2 h-2' : 'w-3 h-3'}`} />
          </div>
        </div>

        {/* Focused Non-Scrollable Content Body */}
        <div className={`flex-1 flex flex-col justify-between overflow-hidden ${compact ? 'p-1 gap-1' : 'p-2.5 gap-2'}`}>
          {/* Mini Portal Header */}
          <div className="p-1.5 sm:p-2 rounded-xl bg-white border-2 border-black shadow-neo-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className={`${
                    compact ? 'w-4 h-4' : 'w-5 h-5'
                  } rounded-md bg-[#ffe17c] border border-black flex items-center justify-center shrink-0`}
                >
                  <Wifi className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-black stroke-[2.5]`} />
                </div>
                <span
                  className={`font-black text-black truncate tracking-tight ${
                    compact ? 'text-[9px]' : 'text-[11px]'
                  }`}
                >
                  {displayTitle}
                </span>
              </div>
              <span
                className={`px-1.5 py-0.2 rounded bg-black text-[#ffe17c] font-black shrink-0 font-mono ${
                  compact ? 'text-[7px]' : 'text-[8px]'
                }`}
              >
                ONLINE
              </span>
            </div>
            <div
              className={`flex items-center justify-between font-mono text-neutral-600 border-t border-black/10 pt-0.5 ${
                compact ? 'text-[7px]' : 'text-[8.5px]'
              }`}
            >
              <span className="truncate max-w-[120px] font-bold text-black flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                {displaySsid}
              </span>
              <span className="font-extrabold text-neutral-700 shrink-0">{portalIp}</span>
            </div>
          </div>

          {/* Focused Step View */}
          {state === 'standby' && (
            <div
              className={`rounded-xl bg-white border-2 border-black shadow-neo-xs space-y-1.5 sm:space-y-2 ${
                compact ? 'p-1.5' : 'p-2.5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Coins className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-black`} />
                  <span className={`font-black text-black ${compact ? 'text-[9px]' : 'text-[10.5px]'}`}>
                    Coin Slot Acceptor
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded bg-neutral-200 border border-black font-black text-neutral-700 ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  ● STANDBY
                </span>
              </div>

              {/* Big Yellow Start Insert Coin Button */}
              <div
                className={`w-full rounded-xl bg-[#ffe17c] border-2 border-black shadow-neo-xs flex items-center justify-center gap-1.5 text-black font-black ${
                  compact ? 'py-1.5 px-2 text-[10px]' : 'py-2 px-3 text-xs'
                }`}
              >
                <Coins className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill-black/20`} />
                <span>Start Insert Coin</span>
              </div>

              <p
                className={`text-neutral-600 font-semibold text-center leading-tight ${
                  compact ? 'text-[7.5px]' : 'text-[9px]'
                }`}
              >
                Pindutin para mag-hulog ng barya
              </p>

              <div
                className={`pt-1 border-t border-black/10 flex items-center justify-between font-bold text-neutral-700 ${
                  compact ? 'text-[7px]' : 'text-[8.5px]'
                }`}
              >
                <span>Rates:</span>
                <span className="font-extrabold text-black font-mono truncate max-w-[120px]">
                  {rateText}
                </span>
              </div>
            </div>
          )}

          {state === 'active' && (
            <div
              className={`rounded-xl bg-white border-2 border-black shadow-neo-xs space-y-1.5 sm:space-y-2 ${
                compact ? 'p-1.5' : 'p-2.5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Coins className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-black`} />
                  <span className={`font-black text-black ${compact ? 'text-[9px]' : 'text-[10.5px]'}`}>
                    Coin Slot Acceptor
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded bg-[#4ade80] border border-black font-black text-black flex items-center gap-0.5 ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  <span className="w-1 h-1 rounded-full bg-black animate-ping" />
                  ACTIVE (29s)
                </span>
              </div>

              {/* Drop Coin Callout Box */}
              <div
                className={`rounded-xl bg-[#fffde6] border-2 border-dashed border-black text-center space-y-0.5 ${
                  compact ? 'p-1.5' : 'p-2'
                }`}
              >
                <div
                  className={`font-bold text-neutral-500 uppercase tracking-wider ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  Hulog na ng barya!
                </div>
                <div
                  className={`font-black font-mono text-black leading-none ${
                    compact ? 'text-lg' : 'text-2xl'
                  }`}
                >
                  ₱0.00
                </div>
                <div
                  className={`font-extrabold text-emerald-800 ${
                    compact ? 'text-[8px]' : 'text-[9.5px]'
                  }`}
                >
                  🪙 ₱1 • ₱5 • ₱10 • ₱20 Coins
                </div>
              </div>

              {/* Countdown bar */}
              <div className="space-y-0.5">
                <div
                  className={`flex justify-between font-bold text-neutral-600 ${
                    compact ? 'text-[6.5px]' : 'text-[8px]'
                  }`}
                >
                  <span>Coin slot timer</span>
                  <span className="font-mono text-black font-extrabold">29s left</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-neutral-200 border border-black overflow-hidden">
                  <div className="h-full bg-[#4ade80] w-[92%]" />
                </div>
              </div>
            </div>
          )}

          {state === 'credited' && (
            <div
              className={`rounded-xl bg-white border-2 border-black shadow-neo-xs space-y-1.5 sm:space-y-2 ${
                compact ? 'p-1.5' : 'p-2.5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Coins className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-black`} />
                  <span className={`font-black text-black ${compact ? 'text-[9px]' : 'text-[10.5px]'}`}>
                    Coin Slot Acceptor
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded bg-[#4ade80] border border-black font-black text-black flex items-center gap-0.5 ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  ✓ DETECTED
                </span>
              </div>

              {/* Amount and Time Credited */}
              <div
                className={`rounded-xl bg-[#e6fbf0] border-2 border-black text-center space-y-1 ${
                  compact ? 'p-1.5' : 'p-2'
                }`}
              >
                <div
                  className={`font-bold text-neutral-600 uppercase tracking-wider ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  TOTAL COINS INSERTED
                </div>
                <div
                  className={`font-black font-mono text-black leading-none ${
                    compact ? 'text-lg' : 'text-2xl'
                  }`}
                >
                  ₱5.00
                </div>
                <div
                  className={`inline-block rounded-md bg-[#ffe17c] border border-black font-black text-black ${
                    compact ? 'px-1.5 py-0.2 text-[8px]' : 'px-2 py-0.5 text-[9.5px]'
                  }`}
                >
                  ⚡ Internet Time: 1 Hour
                </div>
              </div>

              <p
                className={`text-neutral-600 font-semibold text-center leading-tight ${
                  compact ? 'text-[7px]' : 'text-[8.5px]'
                }`}
              >
                Hulog pa para dagdag oras, o pindutin ang Connect
              </p>
            </div>
          )}

          {state === 'connected' && (
            <div
              className={`rounded-xl bg-white border-2 border-black shadow-neo-xs space-y-1.5 sm:space-y-2 ${
                compact ? 'p-1.5' : 'p-2.5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-black text-black ${compact ? 'text-[9px]' : 'text-[10.5px]'}`}>
                  Ready to Connect
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded bg-[#ffe17c] border border-black font-black text-black ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  ₱5.00 (1 Hr)
                </span>
              </div>

              <div
                className={`rounded-lg bg-neutral-100 border border-black text-center ${
                  compact ? 'p-1' : 'p-1.5'
                }`}
              >
                <div
                  className={`text-neutral-500 font-bold uppercase ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  Credited Time
                </div>
                <div
                  className={`font-black text-black font-mono ${
                    compact ? 'text-xs' : 'text-sm'
                  }`}
                >
                  01 Hour : 00 Mins
                </div>
              </div>

              {/* Prominent CONNECT NOW Button */}
              <div
                className={`w-full rounded-xl bg-black text-white border-2 border-black shadow-neo-xs flex items-center justify-center gap-1.5 font-black ${
                  compact ? 'py-1.5 px-2 text-[10px]' : 'py-2 px-3 text-xs'
                }`}
              >
                <Sparkles className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-[#ffe17c]`} />
                <span>Connect Now ➔</span>
              </div>

              <p
                className={`text-neutral-500 font-semibold text-center ${
                  compact ? 'text-[6.5px]' : 'text-[8px]'
                }`}
              >
                Pindutin para simulan ang internet
              </p>
            </div>
          )}

          {state === 'session' && (
            <div
              className={`rounded-xl bg-white border-2 border-black shadow-neo-xs space-y-1 sm:space-y-1.5 ${
                compact ? 'p-1.5' : 'p-2'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`inline-flex items-center gap-1 rounded-full bg-[#4ade80] border border-black font-black text-black ${
                    compact ? 'px-1.5 py-0.2 text-[7.5px]' : 'px-2 py-0.5 text-[8.5px]'
                  }`}
                >
                  <CheckCircle2 className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-black`} />
                  <span>CONNECTED</span>
                </div>
                <span
                  className={`font-bold text-neutral-500 ${
                    compact ? 'text-[7px]' : 'text-[8px]'
                  }`}
                >
                  00:59:45
                </span>
              </div>

              {/* Session Transfer Code Notice Box */}
              <div
                className={`rounded-xl bg-[#fffde6] border-2 border-black space-y-0.5 ${
                  compact ? 'p-1' : 'p-1.5'
                }`}
              >
                <div
                  className={`flex items-center justify-between font-black text-neutral-600 uppercase ${
                    compact ? 'text-[6.5px]' : 'text-[7.5px]'
                  }`}
                >
                  <span>SESSION CODE (KOWDIGO)</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                    <Copy className="w-2.5 h-2.5" />
                    Copy
                  </span>
                </div>
                <div
                  className={`rounded-md bg-black text-[#ffe17c] font-mono font-black tracking-wider text-center border border-black ${
                    compact ? 'py-0.5 text-[9.5px]' : 'py-1 text-[11px]'
                  }`}
                >
                  PW-GDQLWK
                </div>
                <div
                  className={`text-neutral-600 font-medium text-center ${
                    compact ? 'text-[6.5px]' : 'text-[7.5px]'
                  }`}
                >
                  I-save ito para malipat sa ibang cellphone
                </div>
              </div>

              {/* Start Browsing Button */}
              <div
                className={`w-full rounded-lg bg-[#4ade80] text-black border-2 border-black shadow-neo-xs flex items-center justify-center gap-1 font-black ${
                  compact ? 'py-1 px-1.5 text-[9px]' : 'py-1.5 px-2 text-[10.5px]'
                }`}
              >
                <span>Start Browsing (Open Web) ➔</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
