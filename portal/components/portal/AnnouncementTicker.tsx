'use client';

import React from 'react';
import { Megaphone } from 'lucide-react';

interface AnnouncementTickerProps {
  text?: string;
}

export function AnnouncementTicker({ text }: AnnouncementTickerProps) {
  if (!text) return null;

  return (
    <div className="w-full overflow-hidden bg-[#ffe17c] text-black border-2 border-black rounded-xl px-3 py-2 text-xs shadow-neo-sm">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-md bg-black text-[#ffe17c] text-[10px] font-black uppercase tracking-wider">
          <Megaphone className="w-3 h-3 text-[#ffe17c]" />
          NEWS
        </span>
        <div className="overflow-hidden whitespace-nowrap w-full">
          <p className="inline-block animate-marquee text-black font-extrabold text-[12px] tracking-wide">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
