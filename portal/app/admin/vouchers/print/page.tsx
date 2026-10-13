'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Printer, Wifi, Ticket } from 'lucide-react';
import { formatCurrency, formatDuration } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function VoucherPrintPage() {
  const { data, isValidating } = useSWR('/api/admin/vouchers', fetcher);
  const [filterUnusedOnly, setFilterUnusedOnly] = useState(true);

  const vouchers: any[] = data?.vouchers || [];
  const displayVouchers = (filterUnusedOnly
    ? vouchers.filter((v) => !v.isUsed)
    : vouchers
  ).filter((v) => !v.isRevoked);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-white text-black p-4 sm:p-8 print:p-0">
      {/* Non-printed Controls Bar */}
      <div className="max-w-5xl mx-auto mb-6 p-4 rounded-xl bg-[#f8f6ee] text-black border-2 border-black flex flex-wrap items-center justify-between gap-4 print:hidden shadow-neo">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="p-2 rounded-lg bg-white border-2 border-black text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            title="Return to Admin"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-base font-extrabold text-black font-display flex items-center gap-2">
              <Ticket className="w-4 h-4 text-black" />
              Printable Voucher Sheet ({displayVouchers.length} Tickets)
            </h1>
            <p className="text-xs text-neutral-600 font-medium">Formatted for standard A4 paper or thermal receipt rolls</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-black font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={filterUnusedOnly}
              onChange={(e) => setFilterUnusedOnly(e.target.checked)}
              className="rounded border-2 border-black text-black focus:ring-black accent-[#ffe17c] w-4 h-4"
            />
            <span>Unused Vouchers Only</span>
          </label>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black font-extrabold text-xs shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Voucher Slips</span>
          </button>
        </div>
      </div>

      {/* Printable Grid */}
      <div className="max-w-5xl mx-auto">
        {displayVouchers.length === 0 ? (
          <div className="text-center py-12 text-slate-500 print:hidden">
            No vouchers available to print. Generate some vouchers first in Admin.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 print:grid-cols-3 print:gap-2">
            {displayVouchers.map((v) => (
              <div
                key={v.id}
                className="p-3 border-2 border-dashed border-black rounded-lg flex flex-col justify-between text-center break-inside-avoid bg-white"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-center gap-1 text-[11px] font-black uppercase tracking-wider border-b border-black/20 pb-1 mb-1.5">
                    <Wifi className="w-3 h-3" />
                    <span>OpenPisoWiFi</span>
                  </div>

                  {/* Price & Duration */}
                  <div className="flex items-center justify-between text-xs font-bold px-1 mb-1">
                    <span className="text-sm font-black">{formatCurrency(v.amountEquivalent)}</span>
                    <span className="bg-black text-white px-1.5 py-0.2 rounded text-[10px] uppercase font-mono">
                      {formatDuration(v.durationMinutes)}
                    </span>
                  </div>

                  {/* Voucher Code Box */}
                  <div className="my-2 p-1.5 bg-slate-100 border border-black/30 rounded">
                    <span className="text-[9px] uppercase tracking-widest font-bold block text-slate-600">
                      Voucher Code
                    </span>
                    <span className="text-base font-black font-mono tracking-widest text-black">
                      {v.code}
                    </span>
                  </div>
                </div>

                {/* Instructions */}
                <div className="border-t border-black/20 pt-1 text-[8.5px] text-slate-600 space-y-0.5 leading-tight">
                  <p>1. Connect to Wi-Fi SSID</p>
                  <p>2. Open browser: <b>wifi.local</b> or <b>10.0.0.1</b></p>
                  <p>3. Enter code above to start</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
