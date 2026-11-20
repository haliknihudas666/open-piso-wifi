'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Coins, Archive, History, CheckCircle2, AlertCircle, RefreshCw, X, Scale } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CashCollectionAudit {
  id: string;
  amount: number;
  collectedBy: string;
  createdAt: string;
  expectedAmount: number;
  recordedSales: number;
  startingFloat: number;
  actualCounted: number;
  variance: number;
  leftInDrawer: number;
  netCollected: number;
  remarks: string;
}

const FLOAT_PRESETS = [0, 5, 10, 20];

export function CashBoxManager() {
  const { data, mutate, isValidating } = useSWR('/api/admin/cash-box', fetcher);

  const [isCollecting, setIsCollecting] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectorName, setCollectorName] = useState('Admin');
  const [actualCountedInput, setActualCountedInput] = useState('');
  const [leftInDrawerInput, setLeftInDrawerInput] = useState('0');
  const [notes, setNotes] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const uncollectedCash = data?.uncollectedCash || 0;
  const recordedSales = data?.recordedSales ?? uncollectedCash;
  const drawerFloat = data?.drawerFloat || 0;
  const uncollectedCount = data?.uncollectedCount || 0;
  const allTimeCoinRevenue = data?.allTimeCoinRevenue || 0;
  const lastCollection: CashCollectionAudit | null = data?.lastCollection || null;
  const history: CashCollectionAudit[] = data?.history || [];

  const parsedActual = parseFloat(actualCountedInput);
  const actualCounted = Number.isFinite(parsedActual) && parsedActual >= 0 ? parsedActual : 0;
  const parsedLeft = parseFloat(leftInDrawerInput);
  const leftInDrawer = Number.isFinite(parsedLeft) && parsedLeft >= 0 ? parsedLeft : 0;
  const variance = Number((actualCounted - uncollectedCash).toFixed(2));
  const netCollected = Number(Math.max(0, actualCounted - leftInDrawer).toFixed(2));

  const openCollectModal = () => {
    setActualCountedInput(String(uncollectedCash));
    setLeftInDrawerInput(String(drawerFloat > 0 ? drawerFloat : 0));
    setNotes('');
    setModalError(null);
    setShowCollectModal(true);
  };

  const handleEmptyCashBox = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!Number.isFinite(parsedActual) || parsedActual < 0) {
      setModalError('Enter a valid actual coin count (₱0 or more).');
      return;
    }
    if (!Number.isFinite(parsedLeft) || parsedLeft < 0) {
      setModalError('Coins left in drawer must be ₱0 or more.');
      return;
    }
    if (leftInDrawer > actualCounted) {
      setModalError('Coins left in drawer cannot be more than the actual coins counted.');
      return;
    }

    setIsCollecting(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/cash-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualCounted,
          leftInDrawer,
          collectedBy: collectorName,
          notes,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to record collection');
      }

      setStatusMsg({
        type: 'success',
        text: resData.message || `Recorded cash collection of ${formatCurrency(netCollected)}!`,
      });
      setShowCollectModal(false);
      setNotes('');
      mutate();
    } catch (err: any) {
      setModalError(err.message || 'Collection failed');
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
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
              Track physical coins, audit actual vs recorded counts, and manage drawer float
            </p>
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
        {/* Expected Cash in Machine Box */}
        <div className="p-4 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm relative overflow-hidden">
          <span className="text-xs font-black uppercase tracking-wider block mb-1">
            Cash in Machine Box
          </span>
          <div className="text-3xl font-black font-display tracking-tight">
            {formatCurrency(uncollectedCash)}
          </div>
          <span className="text-[11px] font-bold text-neutral-800 mt-1 block">
            {drawerFloat > 0
              ? `${formatCurrency(drawerFloat)} starter float + ${formatCurrency(recordedSales)} new (${uncollectedCount} drops)`
              : `${uncollectedCount} coin drop events pending collection`}
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
            {lastCollection
              ? `by ${lastCollection.collectedBy} (${formatCurrency(lastCollection.netCollected)} taken${
                  lastCollection.leftInDrawer > 0 ? `, ${formatCurrency(lastCollection.leftInDrawer)} left` : ''
                })`
              : 'All sales in box'}
          </span>
        </div>
      </div>

      {/* Action Button */}
      <div className="mb-6">
        <Button
          onClick={openCollectModal}
          variant="primary"
          disabled={uncollectedCash <= 0}
          className="w-full gap-2 py-3"
        >
          <Archive className="w-4 h-4" />
          <span>Empty Coin Drawer & Audit Count ({formatCurrency(uncollectedCash)})</span>
        </Button>
      </div>

      {/* Audit & Collection Dialog Modal */}
      {showCollectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cash-audit-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black dark:border-[#4a6052] shadow-neo-xl p-5 text-black dark:text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h4 id="cash-audit-dialog-title" className="text-sm font-black font-display uppercase tracking-wide">
                    Coin Drawer Audit & Collection
                  </h4>
                  <p className="text-[11px] text-neutral-600 dark:text-[#b7c6c2]">
                    Compare physical coins counted vs system recorded total
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCollectModal(false)}
                disabled={isCollecting}
                aria-label="Close dialog"
                className="w-8 h-8 rounded-lg border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#111713] flex items-center justify-center shadow-neo-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEmptyCashBox} className="space-y-3.5">
              {/* System Recorded vs Actual Counted */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block">
                    Recorded in System
                  </label>
                  <div className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#1f2822] border-2 border-black text-base font-black font-mono text-black dark:text-[#ffe17c]">
                    {formatCurrency(uncollectedCash)}
                  </div>
                  {drawerFloat > 0 && (
                    <span className="text-[10px] font-semibold text-neutral-500 dark:text-[#b7c6c2] mt-1 block">
                      {formatCurrency(drawerFloat)} float + {formatCurrency(recordedSales)} sales
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="actual-coins-counted"
                    className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block"
                  >
                    Actual Coins Counted (₱)
                  </label>
                  <Input
                    id="actual-coins-counted"
                    type="number"
                    min="0"
                    step="1"
                    value={actualCountedInput}
                    onChange={(e) => setActualCountedInput(e.target.value)}
                    placeholder="e.g. 271"
                    className="font-mono font-black text-base"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Live Variance Indicator */}
              <div
                className={`p-3 rounded-xl border-2 border-black shadow-neo-sm flex items-center justify-between text-xs font-black ${
                  variance === 0
                    ? 'bg-[#4ade80] text-black'
                    : variance < 0
                    ? 'bg-[#ffcfcc] text-black'
                    : 'bg-[#dbeafe] text-black'
                }`}
              >
                <span>Discrepancy (Actual vs Recorded)</span>
                <span className="font-mono text-sm">
                  {variance === 0
                    ? '₱0 (Exact Match)'
                    : variance < 0
                    ? `-${formatCurrency(Math.abs(variance))} (Short)`
                    : `+${formatCurrency(variance)} (Over)`}
                </span>
              </div>

              {/* Coins Left in Drawer (Starter Float) */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#1f2822] border-2 border-black space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="coins-left-drawer"
                    className="text-[11px] font-extrabold text-black dark:text-white"
                  >
                    Coins Left in Drawer (Starter Float)
                  </label>
                  <div className="flex items-center gap-1">
                    {FLOAT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setLeftInDrawerInput(String(preset))}
                        className={`px-2 py-0.5 rounded-md border border-black text-[10px] font-black cursor-pointer transition-colors ${
                          leftInDrawer === preset
                            ? 'bg-[#ffe17c] text-black'
                            : 'bg-[#faf8f3] dark:bg-[#111713] text-neutral-700 dark:text-[#b7c6c2] hover:bg-[#ffe17c]/50'
                        }`}
                      >
                        ₱{preset}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  id="coins-left-drawer"
                  type="number"
                  min="0"
                  max={actualCounted}
                  step="1"
                  value={leftInDrawerInput}
                  onChange={(e) => setLeftInDrawerInput(e.target.value)}
                  placeholder="e.g. 5 (5x ₱1 starter coins)"
                  className="font-mono font-bold"
                />
                <p className="text-[10px] font-semibold text-neutral-600 dark:text-[#b7c6c2]">
                  Coins you put back in the box (e.g., 5 × ₱1). The drawer counter will start at{' '}
                  <strong className="text-black dark:text-[#ffe17c]">{formatCurrency(leftInDrawer)}</strong> for the next
                  cycle.
                </p>
              </div>

              {/* Net Take-Home Summary */}
              <div className="p-3 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider block">
                    Net Cash Collected (Taken)
                  </span>
                  <span className="text-[11px] font-bold text-neutral-800">
                    {formatCurrency(actualCounted)} counted − {formatCurrency(leftInDrawer)} left in box
                  </span>
                </div>
                <span className="text-xl font-black font-mono">{formatCurrency(netCollected)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block">
                    Collected By
                  </label>
                  <Input
                    value={collectorName}
                    onChange={(e) => setCollectorName(e.target.value)}
                    placeholder="e.g. Juan dela Cruz"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1 block">
                    Audit Remarks (Optional)
                  </label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Left 5x ₱1 coins"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCollectModal(false)}
                  disabled={isCollecting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={isCollecting}>
                  Save Audit & Reset Counter
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  <th className="p-3">Recorded / Counted</th>
                  <th className="p-3">Variance</th>
                  <th className="p-3">Left in Box</th>
                  <th className="p-3">Net Taken</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
                {history.map((col) => (
                  <tr key={col.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium">
                    <td className="p-3 font-mono font-bold text-neutral-700 dark:text-[#b7c6c2] whitespace-nowrap">
                      {new Date(col.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-extrabold text-black dark:text-white">{col.collectedBy}</td>
                    <td className="p-3 font-mono whitespace-nowrap">
                      <span className="text-neutral-500 dark:text-neutral-400">{formatCurrency(col.expectedAmount)}</span>
                      <span className="mx-1 text-neutral-400">/</span>
                      <span className="font-black text-black dark:text-white">{formatCurrency(col.actualCounted)}</span>
                    </td>
                    <td className="p-3 font-mono whitespace-nowrap">
                      {col.variance === 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-[#4ade80] text-black border border-black text-[10px] font-black">
                          Exact
                        </span>
                      ) : col.variance < 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-[#ffcfcc] text-black border border-black text-[10px] font-black">
                          -{formatCurrency(Math.abs(col.variance))}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-[#dbeafe] text-black border border-black text-[10px] font-black">
                          +{formatCurrency(col.variance)}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold text-neutral-700 dark:text-[#ffe17c] whitespace-nowrap">
                      {formatCurrency(col.leftInDrawer)}
                    </td>
                    <td className="p-3 font-mono font-black text-black dark:text-[#4ade80] whitespace-nowrap">
                      {formatCurrency(col.netCollected)}
                    </td>
                    <td className="p-3 text-neutral-500 dark:text-neutral-400 text-[11px] truncate max-w-xs">
                      {col.remarks || '—'}
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
