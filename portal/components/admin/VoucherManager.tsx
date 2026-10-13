'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Ticket,
  Plus,
  Copy,
  Check,
  Printer,
  Sparkles,
  Layers,
  Ban,
  Trash2,
  RotateCcw,
  Search,
  AlertTriangle,
  X,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDuration, formatCurrency } from '@/lib/utils';

export interface VoucherItem {
  id: string;
  code: string;
  durationMinutes: number;
  amountEquivalent: number;
  isUsed: boolean;
  isRevoked?: boolean;
  revokedAt?: string;
  usedAt?: string;
  usedByMac?: string;
  createdAt: string;
}

interface VoucherManagerProps {
  vouchers: VoucherItem[];
  onVouchersUpdated: () => void;
}

export function VoucherManager({ vouchers, onVouchersUpdated }: VoucherManagerProps) {
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [amountEquivalent, setAmountEquivalent] = useState(5);
  const [quantity, setQuantity] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCount, setBulkCount] = useState(20);
  const [filterUsed, setFilterUsed] = useState<'all' | 'unused' | 'used' | 'revoked'>('unused');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: 'revoke' | 'delete' | 'purge_revoked';
    voucher?: VoucherItem;
  } | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationMinutes: Number(durationMinutes),
          amountEquivalent: Number(amountEquivalent),
          quantity: Number(quantity),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: `Generated ${data.count} voucher code(s) successfully!` });
        onVouchersUpdated();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to generate vouchers.' });
      }
    } catch (err) {
      console.error('Failed to generate vouchers:', err);
      setFeedbackMsg({ type: 'error', text: 'Error contacting voucher server.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/vouchers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: bulkCount,
          durationMinutes: Number(durationMinutes),
          amountEquivalent: Number(amountEquivalent),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowBulkModal(false);
        setFeedbackMsg({ type: 'success', text: data.message || `Generated ${bulkCount} vouchers successfully!` });
        onVouchersUpdated();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Bulk generation failed.' });
      }
    } catch (err) {
      console.error('Failed to bulk generate vouchers:', err);
      setFeedbackMsg({ type: 'error', text: 'Error generating bulk vouchers.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Revoke voucher handler
  const handleRevoke = async (voucher: VoucherItem) => {
    setActionLoadingId(`revoke_${voucher.id}`);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/vouchers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: voucher.id,
          action: 'revoke',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: data.message || `Voucher ${voucher.code} revoked successfully.` });
        onVouchersUpdated();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to revoke voucher.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error revoking voucher.' });
    } finally {
      setActionLoadingId(null);
      setConfirmModal(null);
    }
  };

  // Restore voucher handler
  const handleRestore = async (voucher: VoucherItem) => {
    setActionLoadingId(`restore_${voucher.id}`);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/vouchers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: voucher.id,
          action: 'restore',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: data.message || `Voucher ${voucher.code} restored to active.` });
        onVouchersUpdated();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to restore voucher.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error restoring voucher.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete single voucher handler
  const handleDelete = async (voucher: VoucherItem) => {
    setActionLoadingId(`delete_${voucher.id}`);
    setFeedbackMsg(null);

    try {
      const res = await fetch(`/api/admin/vouchers?id=${encodeURIComponent(voucher.id)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: data.message || `Voucher ${voucher.code} deleted permanently.` });
        onVouchersUpdated();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to delete voucher.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error deleting voucher.' });
    } finally {
      setActionLoadingId(null);
      setConfirmModal(null);
    }
  };

  // Purge all revoked vouchers handler
  const handlePurgeRevoked = async () => {
    setActionLoadingId('purge_revoked');
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/admin/vouchers?scope=revoked', {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: data.message || 'All revoked vouchers purged successfully.' });
        onVouchersUpdated();
      } else {
        setFeedbackMsg({ type: 'error', text: data.error || 'Failed to purge revoked vouchers.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error purging vouchers.' });
    } finally {
      setActionLoadingId(null);
      setConfirmModal(null);
    }
  };

  // Filter & Search
  const counts = useMemo(() => {
    const unused = vouchers.filter((v) => !v.isUsed && !v.isRevoked).length;
    const used = vouchers.filter((v) => v.isUsed && !v.isRevoked).length;
    const revoked = vouchers.filter((v) => v.isRevoked).length;
    const all = vouchers.length;
    return { unused, used, revoked, all };
  }, [vouchers]);

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      // Tab filter
      if (filterUsed === 'unused' && (v.isUsed || v.isRevoked)) return false;
      if (filterUsed === 'used' && (!v.isUsed || v.isRevoked)) return false;
      if (filterUsed === 'revoked' && !v.isRevoked) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchCode = v.code.toLowerCase().includes(q);
        const matchMac = (v.usedByMac || '').toLowerCase().includes(q);
        const matchPrice = v.amountEquivalent.toString().includes(q);
        const matchDuration = v.durationMinutes.toString().includes(q);
        return matchCode || matchMac || matchPrice || matchDuration;
      }

      return true;
    });
  }, [vouchers, filterUsed, searchQuery]);

  return (
    <Card className="border-2 border-black shadow-neo">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Voucher Code Management</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
              Generate, print, revoke, or delete prepaid voucher codes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {counts.revoked > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmModal({ open: true, type: 'purge_revoked' })}
              className="gap-1.5 text-xs text-red-600 hover:text-red-700"
              title="Clean up all revoked vouchers"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Purge Revoked</span>
              <span>({counts.revoked})</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBulkModal(true)}
            className="gap-1.5"
          >
            <Layers className="w-4 h-4" />
            <span>Bulk Batch</span>
          </Button>

          <Link
            href="/admin/vouchers/print"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] text-xs font-extrabold transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print Slips</span>
          </Link>
        </div>
      </CardHeader>

      {/* Feedback Alert */}
      {feedbackMsg && (
        <div
          className={`mx-4 sm:mx-6 mb-4 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold flex items-center justify-between gap-2 ${
            feedbackMsg.type === 'success' ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="p-1 rounded hover:bg-black/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bulk Generator Modal */}
      {showBulkModal && (
        <form
          onSubmit={handleBulkGenerate}
          className="mx-4 sm:mx-6 p-4 rounded-xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black shadow-neo space-y-3 mb-6"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-black dark:text-[#ffe17c]" />
              Generate Bulk Batch for Printing
            </h4>
            <Badge variant="primary">BATCH MODE</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1">Quantity</label>
              <select
                value={bulkCount}
                onChange={(e) => setBulkCount(Number(e.target.value))}
                className="w-full bg-white dark:bg-[#1f2822] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value={10}>10 Vouchers</option>
                <option value={25}>25 Vouchers</option>
                <option value={50}>50 Vouchers</option>
                <option value={100}>100 Vouchers</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1">
                Duration (Minutes)
              </label>
              <Input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                required
              />
              <span className="text-[10px] font-bold text-neutral-500 mt-1 block">
                {formatDuration(durationMinutes)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1">Price (₱)</label>
              <Input
                type="number"
                min={0}
                value={amountEquivalent}
                onChange={(e) => setAmountEquivalent(Number(e.target.value))}
              />
              <span className="text-[10px] font-bold text-neutral-500 mt-1 block">
                {formatCurrency(amountEquivalent)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowBulkModal(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isGenerating}
            >
              Generate {bulkCount} Batch Codes
            </Button>
          </div>
        </form>
      )}

      {/* Generator Form */}
      <form
        onSubmit={handleGenerate}
        className="mx-4 sm:mx-6 p-4 rounded-xl bg-[#faf8f3] dark:bg-[#171e19] border-2 border-black shadow-neo-sm mb-6"
      >
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-black dark:text-white mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-black dark:text-[#ffe17c]" />
          Quick Voucher Generator
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1">
              Duration (Minutes)
            </label>
            <Input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              required
            />
            <span className="text-[10px] font-bold text-neutral-500 mt-1 block">
              {formatDuration(durationMinutes)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1">Price (₱)</label>
            <Input
              type="number"
              min={0}
              value={amountEquivalent}
              onChange={(e) => setAmountEquivalent(Number(e.target.value))}
            />
            <span className="text-[10px] font-bold text-neutral-500 mt-1 block">Accounting price</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] mb-1">
              Quantity (Max 50)
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
            <span className="text-[10px] font-bold text-neutral-500 mt-1 block">Number of codes</span>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" size="md" isLoading={isGenerating} className="gap-2">
            <Plus className="w-4 h-4" />
            <span>Generate {quantity} Voucher{quantity > 1 ? 's' : ''}</span>
          </Button>
        </div>
      </form>

      {/* Filter Tabs & Search Bar */}
      <div className="px-4 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-[#171e19] p-1 rounded-xl border-2 border-black shadow-neo-sm text-xs">
          <button
            type="button"
            onClick={() => setFilterUsed('unused')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterUsed === 'unused'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Unused ({counts.unused})
          </button>
          <button
            type="button"
            onClick={() => setFilterUsed('used')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterUsed === 'used'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Redeemed ({counts.used})
          </button>
          <button
            type="button"
            onClick={() => setFilterUsed('revoked')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterUsed === 'revoked'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Revoked ({counts.revoked})
          </button>
          <button
            type="button"
            onClick={() => setFilterUsed('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterUsed === 'all'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            All ({counts.all})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <Input
            placeholder="Search code or MAC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs font-semibold bg-white dark:bg-[#171e19]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black dark:hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Voucher List Table */}
      <div className="mx-4 sm:mx-6 mb-6 overflow-x-auto rounded-xl border-2 border-black shadow-neo-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#ffe17c] text-black font-extrabold border-b-2 border-black uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-3">Voucher Code</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Price</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
            {filteredVouchers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-neutral-500 font-bold">
                  {searchQuery
                    ? `No vouchers match "${searchQuery}".`
                    : 'No vouchers match the selected filter.'}
                </td>
              </tr>
            ) : (
              filteredVouchers.map((v) => {
                const isRevoking = actionLoadingId === `revoke_${v.id}`;
                const isRestoring = actionLoadingId === `restore_${v.id}`;
                const isDeleting = actionLoadingId === `delete_${v.id}`;

                return (
                  <tr
                    key={v.id}
                    className={`hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium ${
                      v.isRevoked ? 'bg-red-500/5 opacity-80' : ''
                    }`}
                  >
                    <td className="p-3">
                      <div className="font-mono font-extrabold text-sm tracking-wider text-black dark:text-[#ffe17c] flex items-center gap-1.5">
                        <span className={v.isRevoked ? 'line-through text-neutral-500' : ''}>{v.code}</span>
                      </div>
                      {v.usedByMac && (
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                          Used by: {v.usedByMac}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-bold text-neutral-700 dark:text-neutral-300">
                      {formatDuration(v.durationMinutes)}
                    </td>
                    <td className="p-3 font-extrabold text-black dark:text-[#4ade80]">
                      ₱{v.amountEquivalent}
                    </td>
                    <td className="p-3">
                      {v.isRevoked ? (
                        <Badge variant="danger">
                          REVOKED
                        </Badge>
                      ) : v.isUsed ? (
                        <Badge variant="outline" className="opacity-60">
                          Redeemed
                        </Badge>
                      ) : (
                        <Badge variant="success">Unused</Badge>
                      )}
                    </td>
                    <td className="p-3 text-neutral-500 font-medium whitespace-nowrap">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Copy Code */}
                        <Button
                          onClick={() => handleCopy(v.code)}
                          variant="outline"
                          size="sm"
                          className="px-2 py-1 text-[11px] h-7 gap-1"
                          title="Copy voucher code"
                        >
                          {copiedCode === v.code ? (
                            <>
                              <Check className="w-3 h-3 text-[#28c840]" />
                              <span className="text-[#28c840] hidden sm:inline">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span className="hidden sm:inline">Copy</span>
                            </>
                          )}
                        </Button>

                        {/* Revoke Button (for active/unused vouchers) */}
                        {!v.isRevoked && (
                          <Button
                            onClick={() => setConfirmModal({ open: true, type: 'revoke', voucher: v })}
                            variant="outline"
                            size="sm"
                            disabled={isRevoking}
                            isLoading={isRevoking}
                            className="px-2 py-1 text-[11px] h-7 gap-1 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            title="Revoke voucher code"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Revoke</span>
                          </Button>
                        )}

                        {/* Restore Button (for revoked vouchers that were not redeemed) */}
                        {v.isRevoked && !v.isUsed && (
                          <Button
                            onClick={() => handleRestore(v)}
                            variant="outline"
                            size="sm"
                            disabled={isRestoring}
                            isLoading={isRestoring}
                            className="px-2 py-1 text-[11px] h-7 gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            title="Restore voucher code to active"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </Button>
                        )}

                        {/* Delete Button (permanent deletion) */}
                        <Button
                          onClick={() => setConfirmModal({ open: true, type: 'delete', voucher: v })}
                          variant="outline"
                          size="sm"
                          disabled={isDeleting}
                          isLoading={isDeleting}
                          className="px-2 py-1 text-[11px] h-7 gap-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Permanently delete voucher"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#faf8f3] dark:bg-[#171e19] border-3 border-black rounded-2xl shadow-neo p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
                <AlertTriangle className="w-5 h-5 text-black" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-black dark:text-white">
                  {confirmModal.type === 'revoke' && 'Revoke Voucher Code'}
                  {confirmModal.type === 'delete' && 'Delete Voucher'}
                  {confirmModal.type === 'purge_revoked' && 'Purge All Revoked Vouchers'}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                  {confirmModal.type === 'revoke' && 'Invalidate and block redemption'}
                  {confirmModal.type === 'delete' && 'Permanent deletion from database'}
                  {confirmModal.type === 'purge_revoked' && 'Bulk cleanup of revoked codes'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-[#1f2822] rounded-xl border-2 border-black text-xs space-y-2">
              {confirmModal.type === 'revoke' && confirmModal.voucher && (
                <>
                  <p className="font-medium text-black dark:text-white">
                    Are you sure you want to revoke voucher code{' '}
                    <span className="font-mono font-black text-sm bg-[#ffe17c] text-black px-1.5 py-0.5 rounded border border-black">
                      {confirmModal.voucher.code}
                    </span>
                    ?
                  </p>
                  {confirmModal.voucher.isUsed ? (
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-bold">
                      Warning: This voucher has already been redeemed by a device. Revoking it will immediately terminate their active Wi-Fi session.
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-500 font-medium">
                      This voucher will become invalid and cannot be redeemed at the captive portal.
                    </p>
                  )}
                </>
              )}

              {confirmModal.type === 'delete' && confirmModal.voucher && (
                <p className="font-medium text-black dark:text-white">
                  Permanently delete voucher{' '}
                  <span className="font-mono font-black text-sm bg-[#ffe17c] text-black px-1.5 py-0.5 rounded border border-black">
                    {confirmModal.voucher.code}
                  </span>
                  ? This action cannot be undone.
                </p>
              )}

              {confirmModal.type === 'purge_revoked' && (
                <p className="font-medium text-black dark:text-white">
                  Permanently delete all <span className="font-extrabold text-red-600">{counts.revoked}</span> revoked voucher(s)? This will clean up the voucher table permanently.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>

              {confirmModal.type === 'revoke' && confirmModal.voucher && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleRevoke(confirmModal.voucher!)}
                  isLoading={actionLoadingId === `revoke_${confirmModal.voucher.id}`}
                  className="bg-[#ff5f57] hover:bg-[#ff4238] text-black"
                >
                  Yes, Revoke Code
                </Button>
              )}

              {confirmModal.type === 'delete' && confirmModal.voucher && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleDelete(confirmModal.voucher!)}
                  isLoading={actionLoadingId === `delete_${confirmModal.voucher.id}`}
                  className="bg-[#ff5f57] hover:bg-[#ff4238] text-black"
                >
                  Yes, Delete Permanently
                </Button>
              )}

              {confirmModal.type === 'purge_revoked' && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handlePurgeRevoked}
                  isLoading={actionLoadingId === 'purge_revoked'}
                  className="bg-[#ff5f57] hover:bg-[#ff4238] text-black"
                >
                  Yes, Purge All Revoked
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
