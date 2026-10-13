'use client';

import React from 'react';
import { DollarSign, Users, Ticket, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

interface StatsOverviewProps {
  stats: {
    todayRevenue: number;
    todayTransactions: number;
    allTimeRevenue: number;
    allTimeTransactions: number;
    activeSessions: number;
    totalVouchers: number;
    unusedVouchers: number;
  };
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const cards = [
    {
      title: "Today's Revenue",
      value: formatCurrency(stats?.todayRevenue || 0),
      subtext: `${stats?.todayTransactions || 0} sales today`,
      icon: DollarSign,
      iconBg: 'bg-[#ffe17c] text-black',
    },
    {
      title: 'Active Sessions',
      value: (stats?.activeSessions || 0).toString(),
      subtext: 'Online devices',
      icon: Users,
      iconBg: 'bg-[#4ade80] text-black',
    },
    {
      title: 'All-Time Revenue',
      value: formatCurrency(stats?.allTimeRevenue || 0),
      subtext: `${stats?.allTimeTransactions || 0} sales logged`,
      icon: TrendingUp,
      iconBg: 'bg-[#c084fc] text-black',
    },
    {
      title: 'Vouchers Available',
      value: (stats?.unusedVouchers || 0).toString(),
      subtext: `Out of ${stats?.totalVouchers || 0} total`,
      icon: Ticket,
      iconBg: 'bg-[#b7c6c2] text-black',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} className="p-4 border-2 border-black shadow-neo">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-neutral-600 dark:text-[#b7c6c2] truncate">
                {card.title}
              </span>
              <div className={`p-1.5 rounded-lg border-2 border-black shadow-neo-sm shrink-0 ${card.iconBg}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black font-display tracking-tight text-black dark:text-white">
              {card.value}
            </div>
            <p className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 truncate">
              {card.subtext}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
