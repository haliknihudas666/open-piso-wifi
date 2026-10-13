'use client';

import React, { useState } from 'react';
import { ShieldAlert, AlertOctagon, RefreshCw, HelpCircle, Ban } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface BannedDeviceCardProps {
  macAddress?: string | null;
  deviceName?: string;
  notes?: string;
  onRefresh?: () => void;
}

export function BannedDeviceCard({
  macAddress,
  deviceName,
  notes,
  onRefresh,
}: BannedDeviceCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  return (
    <Card className="relative overflow-hidden border-2 border-black shadow-neo-lg bg-white dark:bg-[#1f2822]" glow>
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold font-display leading-tight">Device Suspended</h2>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Access Restricted by Admin</p>
          </div>
        </div>

        <Badge variant="danger" className="gap-1">
          <Ban className="w-3.5 h-3.5" />
          BANNED
        </Badge>
      </div>

      {/* Main Alert Box */}
      <div className="my-3 p-4 rounded-xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black shadow-neo-sm space-y-2.5 text-left">
        <div className="flex items-start gap-2.5">
          <AlertOctagon className="w-5 h-5 text-[#ff5f57] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-black dark:text-[#ff5f57]">
              Internet Access Blocked
            </h4>
            <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300 leading-relaxed">
              This device has been blacklisted on the OpenWrt router. Coin insertion and voucher redemption are disabled for this hardware address.
            </p>
          </div>
        </div>

        {/* Device Information & Admin Notes */}
        <div className="pt-2.5 border-t-2 border-black/10 dark:border-white/10 space-y-1.5 text-xs">
          {macAddress && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-neutral-500 dark:text-neutral-400">Device MAC:</span>
              <span className="font-mono font-extrabold bg-[#ffe17c] text-black px-2 py-0.5 rounded border-2 border-black">
                {macAddress.toUpperCase()}
              </span>
            </div>
          )}

          {deviceName && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-neutral-500 dark:text-neutral-400">Device Label:</span>
              <span className="font-bold text-black dark:text-white">{deviceName}</span>
            </div>
          )}

          <div className="mt-2 p-2.5 rounded-lg bg-white dark:bg-[#1f2822] border-2 border-black text-[11px]">
            <span className="font-bold block text-neutral-500 dark:text-neutral-400 mb-0.5">Notice:</span>
            <span className="italic font-medium">
              {notes ? `"${notes}"` : 'Device blacklisted by network administrator for policy enforcement.'}
            </span>
          </div>
        </div>
      </div>

      {/* Resolution & Retry */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-start gap-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 p-2.5 rounded-lg bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black">
          <HelpCircle className="w-4 h-4 shrink-0 text-black dark:text-[#ffe17c] mt-0.5" />
          <span>Contact the Piso Wi-Fi owner or operator to remove this device suspension.</span>
        </div>

        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Checking Status...' : 'Re-Check Device Status'}</span>
        </Button>
      </div>
    </Card>
  );
}
