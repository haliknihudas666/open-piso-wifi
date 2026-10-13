'use client';

import React from 'react';
import { Tag, Clock, Flame, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DEFAULT_RATE_TIERS, RateTier } from '@/lib/rates';

interface PricingTiersProps {
  rates?: RateTier[];
  activePulses?: number;
  onSelectTier?: (amount: number) => void;
  isLoading?: boolean;
}

export function PricingTiers({ rates, activePulses = 0, onSelectTier, isLoading }: PricingTiersProps) {
  const isPending = isLoading || !rates;
  const activeRates = rates && rates.length > 0 ? rates : DEFAULT_RATE_TIERS;

  return (
    <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#b7c6c2] text-black border-2 border-black shadow-neo-sm">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold font-display leading-tight text-black dark:text-white">
              Wi-Fi Rates & Plans
            </h2>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Coins stack time automatically</p>
          </div>
        </div>

        {!isPending && onSelectTier && (
          <span className="text-[10px] font-extrabold text-neutral-600 dark:text-[#b7c6c2] uppercase tracking-wider hidden sm:inline">
            Tap to test rate
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {isPending ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="p-3 rounded-xl border-2 border-black/15 dark:border-[#4a6052]/50 bg-black/[0.03] dark:bg-white/[0.03] animate-pulse select-none min-h-[84px] flex flex-col justify-between"
            >
              <div className="h-6 w-12 bg-black/10 dark:bg-white/10 rounded-md" />
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-3.5 h-3.5 rounded-full bg-black/10 dark:bg-white/10 shrink-0" />
                <div className="h-3.5 w-16 bg-black/10 dark:bg-white/10 rounded" />
              </div>
            </div>
          ))
        ) : (
          activeRates.map((rate, index) => {
          const isExactMatch = activePulses === rate.amount;

          return (
            <div
              key={index}
              onClick={() => onSelectTier && onSelectTier(rate.amount)}
              className={`relative p-3 rounded-xl border-2 transition-all select-none ${
                onSelectTier
                  ? 'cursor-pointer hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
                  : ''
              } ${
                isExactMatch
                  ? 'bg-[#ffe17c] text-black border-black shadow-neo'
                  : rate.popular
                  ? 'bg-[#fff7d1] text-black border-black shadow-neo-sm dark:bg-[#253229] dark:text-white dark:border-[#ffe17c]'
                  : 'bg-white dark:bg-[#151c17] text-black dark:text-white border-black dark:border-[#4a6052] shadow-neo-sm'
              }`}
            >
              {isExactMatch ? (
                <Badge variant="primary" className="absolute -top-2.5 right-2 px-1.5 py-0 text-[10px] gap-1 shadow-neo-sm bg-black text-[#ffe17c]">
                  <CheckCircle2 className="w-3 h-3 text-[#ffe17c]" />
                  Active
                </Badge>
              ) : rate.isPromo ? (
                <Badge variant="success" className="absolute -top-2.5 right-2 px-1.5 py-0 text-[10px] gap-1 shadow-neo-sm bg-[#c084fc] text-black border border-black">
                  <Flame className="w-3 h-3 fill-black text-black" />
                  Promo
                </Badge>
              ) : rate.popular ? (
                <Badge variant="warning" className="absolute -top-2.5 right-2 px-1.5 py-0 text-[10px] gap-1 shadow-neo-sm bg-[#ffe17c] text-black">
                  <Flame className="w-3 h-3 fill-black text-black" />
                  Popular
                </Badge>
              ) : null}

              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black font-display tracking-tight ${isExactMatch ? 'text-black' : 'text-black dark:text-white'}`}>
                  ₱{rate.amount}
                </span>
              </div>

              <div className={`mt-1 flex items-center gap-1 text-xs font-extrabold ${
                isExactMatch
                  ? 'text-neutral-900'
                  : rate.popular
                  ? 'text-neutral-900 dark:text-[#ffe17c]'
                  : 'text-neutral-700 dark:text-[#ffe17c]'
              }`}>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{rate.label || `${rate.minutes} Mins`}</span>
              </div>

              {onSelectTier && (
                <div className={`mt-2 pt-1.5 border-t-2 ${isExactMatch ? 'border-black/20' : 'border-black/15 dark:border-white/15'} flex items-center justify-between text-[10px] font-bold ${
                  isExactMatch ? 'text-neutral-700' : 'text-neutral-600 dark:text-[#cbd5e1]'
                }`}>
                  <span>Simulate:</span>
                  <span className={`font-mono font-black ${isExactMatch ? 'text-black' : 'text-black dark:text-[#4ade80]'}`}>
                    +₱{rate.amount}
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}
      </div>
    </Card>
  );
}
