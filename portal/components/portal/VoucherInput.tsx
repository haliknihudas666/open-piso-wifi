'use client';

import React, { useState } from 'react';
import { Ticket, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface VoucherInputProps {
  onRedeemSuccess: (data: any) => void;
  isConnected?: boolean;
  macHint?: string;
}

export function VoucherInput({ onRedeemSuccess, isConnected = false, macHint }: VoucherInputProps) {
  const [voucherCode, setVoucherCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) {
      setErrorMsg('Please enter a voucher code.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucherCode: voucherCode.trim().toUpperCase(),
          macHint,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to redeem voucher.');
      }

      setSuccessMsg(result.message || 'Voucher redeemed successfully!');
      setVoucherCode('');
      
      // Immediately trigger captive probes
      fetch('/hotspot-detect.html', { cache: 'no-store' }).catch(() => {});
      fetch('/generate_204', { cache: 'no-store' }).catch(() => {});

      onRedeemSuccess(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error redeeming voucher code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-[#b7c6c2] text-black border-2 border-black shadow-neo-sm">
          <Ticket className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-extrabold font-display leading-tight text-black dark:text-white">
            Voucher or Transfer Code
          </h2>
          <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Enter prepaid ticket or session transfer code</p>
        </div>
      </div>

      <form onSubmit={handleRedeem} className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. VOUCH or PW-XXXXXX"
            value={voucherCode}
            onChange={(e) => {
              setVoucherCode(e.target.value.toUpperCase());
              setErrorMsg(null);
            }}
            maxLength={18}
            className="uppercase tracking-wider font-mono text-center text-base sm:text-lg font-black bg-white dark:bg-[#111713] text-black dark:text-white border-2 border-black dark:border-[#4a6052]"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            disabled={!voucherCode.trim()}
            className="shrink-0 px-4 sm:px-5 gap-1.5"
          >
            <span>{isConnected ? 'Extend' : 'Connect'}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Switching Wi-Fi (2.4G ⇄ 5G) or devices? Paste your Session Transfer Code here.
        </p>

        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#4ade80] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            <span>{successMsg}</span>
          </div>
        )}
      </form>
    </Card>
  );
}
