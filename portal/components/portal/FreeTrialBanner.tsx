'use client';

import React, { useState } from 'react';
import { Gift, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDuration } from '@/lib/utils';

interface FreeTrialBannerProps {
  minutes?: number;
  onClaimSuccess: (data: any) => void;
}

export function FreeTrialBanner({ minutes = 5, onClaimSuccess }: FreeTrialBannerProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const formattedTime = formatDuration(minutes);

  const handleClaim = async () => {
    setIsClaiming(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/free-trial', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim trial');
      }

      // Fire captive detection probes immediately
      Promise.allSettled([
        fetch('/hotspot-detect.html', { cache: 'no-store' }),
        fetch('/generate_204', { cache: 'no-store' }),
        fetch('/connecttest.txt', { cache: 'no-store' }),
        fetch('http://captive.apple.com/hotspot-detect.html', { mode: 'no-cors', cache: 'no-store' }),
        fetch('http://connectivitycheck.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' }),
      ]).catch(() => { });

      onClaimSuccess(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error claiming trial');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="relative overflow-hidden p-4 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-left w-full sm:w-auto">
          <div className="p-2.5 rounded-lg bg-black text-white border-2 border-black shadow-neo-sm shrink-0">
            <Gift className="w-5 h-5 text-[#ffe17c]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold font-display leading-tight">Daily Free Wi-Fi Trial</h3>
            </div>
            <p className="text-xs text-neutral-800 font-semibold mt-0.5">
              Get <span className="font-extrabold underline">{formattedTime}</span> of high-speed internet free today!
            </p>
          </div>
        </div>

        <Button
          onClick={handleClaim}
          disabled={isClaiming}
          isLoading={isClaiming}
          variant="dark"
          size="sm"
          className="w-full sm:w-auto shrink-0 gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#ffe17c]" />
          <span>Claim {formattedTime} Free</span>
          <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
        </Button>
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 text-black" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
