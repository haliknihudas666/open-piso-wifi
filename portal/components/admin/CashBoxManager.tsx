'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Coins, Archive, History, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function CashBoxManager() {
  const { data, mutate, isValidating } = useSWR('/api/admin/cash-box', fetcher);

  const [isCollecting, setIsCollecting] = useState(false);
  const [showCollectForm, setShowCollectForm] = useState(false);
  const [collectorName, setCollectorName] = useState('Admin');
  const [notes, setNotes] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const uncollectedCash = data?.uncollectedCash || 0;
  const uncollectedCount = data?.uncollectedCount || 0;
  const allTimeCoinRevenue = data?.allTimeCoinRevenue || 0;
  const lastCollection = data?.lastCollection;
  const history = data?.history || [];

  const handleEmptyCashBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uncollectedCash <= 0) {
      alert('The cash box is currently empty (₱0).');
      return;
    }

    setIsCollecting(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/cash-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: uncollectedCash,
          collectedBy: collectorName,
          notes,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to record collection');
      }

      setStatusMsg({ type: 'success', text: `Recorded cash collection of ${formatCurrency(uncollectedCash)}!` });
      setShowCollectForm(false);
      setNotes('');
      mutate();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Collection failed' });
    } finally {
      setIsCollecting(false);
    }
  };

  return (
    <Card className="border-2 border-black shadow-neo">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Cash Box & Physical Coin Audit</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">Track physical coins in machine and collection history</p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => mutate()}
          disabled={isValidating}
          className="h-8 w-8 p-0"
          title="Refresh Cash Box"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      {statusMsg && (
        <div
          className={`mb-4 flex items-center gap-2 p-3 rounded-lg border-2 border-black shadow-neo-sm text-xs font-bold ${
            statusMsg.type === 'success'
              ? 'bg-[#4ade80] text-black'
              : 'bg-[#ff5f57] text-black'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-black" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Uncollected Balance */}
        <div className="p-4 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm relative overflow-hidden">
          <span className="text-xs font-black uppercase tracking-wider block mb-1">
            Cash in Machine Box
          </span>
          <div className="text-3xl font-black font-display tracking-tight">
            {formatCurrency(uncollectedCash)}
          </div>
          <span className="text-[11px] font-bold text-neutral-800 mt-1 block">
            {uncollectedCount} coin drop events pending collection
          </span>
        </div>

        {/* All-Time Coin Sales */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#171e19] text-black dark:text-white border-2 border-black shadow-neo-sm">
          <span className="text-xs font-bold text-neutral-500 dark:text-[#b7c6c2] block mb-1">
            All-Time Coin Drops
          </span>
          <div className="text-2xl font-black font-display">
            {formatCurrency(allTimeCoinRevenue)}
          </div>
          <span className="text-[11px] font-bold text-[#4ade80] mt-1 block">
            Lifetime coin earnings
          </span>
        </div>

        {/* Last Collection Date */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#171e19] text-black dark:text-white border-2 border-black shadow-neo-sm">
          <span className="text-xs font-bold text-neutral-500 dark:text-[#b7c6c2] block mb-1">
            Last Emptied
          </span>
          <div className="text-sm font-extrabold text-black dark:text-white">
            {lastCollection
              ? new Date(lastCollection.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Never collected'}
          </div>
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mt-1 block truncate">
            {lastCollection ? `by ${lastCollection.collectedBy} (${formatCurrency(lastCollection.amount)})` : 'All sales in box'}
          </span>
        </div>
      </div>

      {/* Action Button & Form */}
      <div className="mb-6">
        {!showCollectForm ? (
          <Button
            onClick={() => setShowCollectForm(true)}
            variant="primary"
            disabled={uncollectedCash <= 0}
            className="w-full gap-2 py-3"
          >
            <Archive className="w-4 h-4" />
            <span>Empty Coin Drawer & Record Collection ({formatCurrency(uncollectedCash)})</span>
          </Button>
        ) : (
          <form onSubmit={handleEmptyCashBox} className="p-4 rounded-xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black shadow-neo space-y-3">
            <h4 className="text-xs font-extrabold font-display uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-black dark:text-[#ffe17c]" />
              Confirm Physical Cash Collection
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block">Collected By</label>
                <Input
                  value={collectorName}
                  onChange={(e) => setCollectorName(e.target.value)}
                  placeholder="e.g. Juan dela Cruz"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block">Amount to Collect</label>
                <div className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#1f2822] border-2 border-black text-sm font-black text-black dark:text-[#ffe17c]">
                  {formatCurrency(uncollectedCash)}
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block">Notes / Audit Remarks (Optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Weekly collection, checked coin acceptor"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCollectForm(false)}
                disabled={isCollecting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isCollecting}
              >
                Confirm & Reset Counter
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Collection History Table */}
      <div>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5 mb-2.5">
          <History className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
          Past Cash Collections Audit
        </h4>

        {history.length === 0 ? (
          <div className="p-4 rounded-xl bg-white dark:bg-[#171e19] border-2 border-black text-center text-xs font-bold text-neutral-500">
            No collection audits recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-black shadow-neo-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#b7c6c2] text-black uppercase text-[10px] tracking-wider border-b-2 border-black font-extrabold">
                <tr>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Collected By</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
                {history.map((col: any) => (
                  <tr key={col.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium">
                    <td className="p-3 font-mono font-bold text-neutral-700 dark:text-[#b7c6c2]">
                      {new Date(col.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-extrabold text-black dark:text-white">{col.collectedBy}</td>
                    <td className="p-3 font-mono font-black text-black dark:text-[#4ade80]">
                      {formatCurrency(col.amount)}
                    </td>
                    <td className="p-3 text-neutral-500 dark:text-neutral-400 text-[11px] truncate max-w-xs">
                      {col.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
