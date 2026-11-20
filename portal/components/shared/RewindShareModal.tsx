'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, Sparkles, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  AdminRewindData,
  CustomerRewindData,
  REWIND_THEMES,
  RewindThemeId,
  renderAdminRewindCard,
  renderCustomerRewindCard,
  shareOrDownloadRewindCanvas,
} from '@/lib/rewind-card';

type RewindShareModalProps =
  | {
      isOpen: boolean;
      onClose: () => void;
      mode: 'customer';
      data: CustomerRewindData;
    }
  | {
      isOpen: boolean;
      onClose: () => void;
      mode: 'admin';
      data: AdminRewindData;
    };

export function RewindShareModal(props: RewindShareModalProps) {
  const { isOpen, onClose, mode } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [themeId, setThemeId] = useState<RewindThemeId>('electric-lime');
  const [privacyOn, setPrivacyOn] = useState(mode === 'customer');
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    if (mode === 'customer') {
      renderCustomerRewindCard(
        canvasRef.current,
        { ...props.data, hideCode: privacyOn },
        themeId
      );
    } else {
      renderAdminRewindCard(
        canvasRef.current,
        { ...props.data, hideRevenue: privacyOn },
        themeId
      );
    }
  }, [isOpen, mode, props.data, themeId, privacyOn]);

  if (!isOpen) return null;

  const handleExport = async (forceDownload: boolean) => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    setFeedback(null);
    try {
      const filename =
        mode === 'customer'
          ? `openpisowifi-streak-rewind.png`
          : `openpisowifi-operator-rewind.png`;
      const shareTitle =
        mode === 'customer'
          ? `${props.data.portalTitle} — My Streak Rewind`
          : `${props.data.portalTitle} — Operator Rewind`;
      const shareText =
        mode === 'customer'
          ? `I'm on a ${props.data.currentStreak}-day Wi-Fi streak on ${props.data.portalTitle}!`
          : `Check out my ${props.data.portalTitle} hotspot stats — ${props.data.uniqueUsers} customers & ${props.data.allTimeTransactions} drops!`;

      const outcome = await shareOrDownloadRewindCanvas(
        canvasRef.current,
        filename,
        shareTitle,
        shareText,
        forceDownload
      );
      setFeedback(
        outcome === 'shared'
          ? 'Opened share sheet!'
          : 'Saved high-res Rewind PNG to your device!'
      );
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('Could not export image. Try screenshot or Download PNG.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rewind-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#faf8f3] dark:bg-[#161e19] border-2 border-black dark:border-[#4a6052] shadow-neo-xl p-4 sm:p-5 text-black dark:text-white max-h-[94vh] overflow-y-auto space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 id="rewind-modal-title" className="text-sm font-black font-display uppercase tracking-wide">
                {mode === 'customer' ? 'My Streak Rewind' : 'Operator Rewind Card'}
              </h3>
              <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2]">
                Ready for Stories, Facebook, Messenger & TikTok
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Rewind dialog"
            className="w-8 h-8 rounded-lg border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#111713] flex items-center justify-center shadow-neo-sm cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Rendered High-Res Card Preview */}
        <div className="rounded-xl overflow-hidden border-2 border-black shadow-neo bg-black flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-auto max-h-[54vh] object-contain block"
          />
        </div>

        {/* Theme Switcher & Privacy Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {REWIND_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                className={`px-2.5 py-1 rounded-lg border-2 text-[11px] font-black cursor-pointer transition-all flex items-center gap-1.5 ${
                  themeId === t.id
                    ? 'border-black bg-[#ffe17c] text-black shadow-neo-sm'
                    : 'border-black/30 dark:border-[#4a6052] bg-white dark:bg-[#111713] text-neutral-700 dark:text-[#b7c6c2]'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black shrink-0"
                  style={{ backgroundColor: t.accent }}
                />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPrivacyOn(!privacyOn)}
            className="px-2.5 py-1 rounded-lg border-2 border-black bg-white dark:bg-[#111713] text-[11px] font-extrabold flex items-center gap-1 cursor-pointer shadow-neo-sm"
          >
            {privacyOn ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>
              {mode === 'customer'
                ? privacyOn
                  ? 'Code Hidden'
                  : 'Code Visible'
                : privacyOn
                ? 'Revenue Hidden'
                : 'Revenue Visible'}
            </span>
          </button>
        </div>

        {feedback && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4ade80] text-black border-2 border-black text-xs font-black">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => handleExport(false)}
            isLoading={isExporting}
            className="w-full gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Rewind</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => handleExport(true)}
            disabled={isExporting}
            className="w-full gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Save PNG</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
