'use client';

import React, { useState } from 'react';
import {
  Flame,
  Award,
  Sparkles,
  Copy,
  CheckCircle2,
  ChevronRight,
  Zap,
  Info,
  Trophy,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDuration } from '@/lib/utils';
import { LoyaltyCustomerStatus, LoyaltyMilestone } from '@/lib/loyalty';

interface LoyaltyStreakCardProps {
  loyalty?: LoyaltyCustomerStatus | null;
  sessionCode?: string | null;
  onCodeCopied?: () => void;
}

export function LoyaltyStreakCard({
  loyalty,
  sessionCode,
  onCodeCopied,
}: LoyaltyStreakCardProps) {
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // If loyalty system is disabled in settings, don't show the card
  if (loyalty && loyalty.enabled === false) {
    return null;
  }

  const effectiveCode = sessionCode || loyalty?.sessionCode || '';
  const currentStreak = loyalty?.currentStreak || 0;
  const creditedToday = loyalty?.creditedToday || false;
  const nextMilestone = loyalty?.nextMilestone;
  const allMilestones = loyalty?.allMilestones || [];

  const handleCopy = () => {
    if (!effectiveCode) return;
    navigator.clipboard?.writeText(effectiveCode).catch(() => { });
    setCopied(true);
    if (onCodeCopied) onCodeCopied();
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate progress percent to next milestone
  let progressPercent = 0;
  if (nextMilestone) {
    const targetDays = nextMilestone.days;
    progressPercent = Math.min(100, Math.round((currentStreak / targetDays) * 100));
  }

  return (
    <div className="rounded-2xl border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#1a231d] shadow-neo p-4 space-y-3.5 transition-all">
      {/* Top Header: Title, Flame badge, and Session Code */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 border-2 border-black flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Flame className="w-5 h-5 fill-orange-500 text-orange-600 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white">
                Daily Streak
              </span>
              <button
                type="button"
                onClick={() => setShowInfo(!showInfo)}
                className="text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
                title="How streaks work"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 dark:text-[#b7c6c2] block">
              Credit every day to earn free hours
            </span>
          </div>
        </div>

        {/* Customer Session Code Pill */}
        {effectiveCode && (
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-black/40 px-2 py-1 rounded-lg border-2 border-black">
            <div className="text-right">
              <span className="text-[9px] font-extrabold uppercase text-neutral-500 dark:text-neutral-400 block leading-none">
                Your Code
              </span>
              <span className="font-mono text-xs font-black text-black dark:text-[#ffe17c]">
                {effectiveCode}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors cursor-pointer"
              title="Copy session code"
            >
              {copied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Info Popover Accordion */}
      {showInfo && (
        <div className="p-3 rounded-xl bg-[#fffde6] dark:bg-black/40 border-2 border-black text-xs font-medium space-y-1.5 animate-in fade-in">
          <p className="font-bold text-black dark:text-[#ffe17c]">
            🔥 How the Daily Streak works:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 text-[11px] space-y-0.5">
            <li>Insert coins or use a voucher every day to build your streak.</li>
            <li>Hit milestone days (e.g. 3-day or 7-day streak) to get <strong>automatic bonus free hours</strong>!</li>
            <li>Your streak is tracked by your <strong>Session Code</strong>. Save or screenshot it!</li>
          </ul>
        </div>
      )}

      {/* Main Streak Counter & Status */}
      <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#171e19] border-2 border-black dark:border-[#4a6052] flex items-center justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#b7c6c2] block">
            Current Flame
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-2xl font-black font-mono text-black dark:text-[#ffe17c]">
              {currentStreak}
            </span>
            <span className="text-sm font-bold text-black dark:text-white">
              {currentStreak === 1 ? 'Day Streak' : 'Days Streak'}
            </span>
          </div>
        </div>

        {/* Status indicator */}
        <div className="text-right">
          {creditedToday ? (
            <Badge variant="success" className="gap-1 py-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Credited Today!</span>
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1 py-1 animate-pulse">
              <Zap className="w-3 h-3 text-orange-600 fill-orange-600" />
              <span>Credit Today</span>
            </Badge>
          )}
          <span className="text-[10px] font-semibold text-neutral-500 dark:text-[#b7c6c2] block mt-1">
            {creditedToday ? 'Streak safe for tomorrow' : 'Insert coin to keep streak'}
          </span>
        </div>
      </div>

      {/* Progress to Next Milestone */}
      {nextMilestone ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-black dark:text-white flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Next: {nextMilestone.rewardName}</span>
            </span>
            <span className="font-mono font-bold text-neutral-500 dark:text-[#b7c6c2]">
              {currentStreak}/{nextMilestone.days} days
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-neutral-200 dark:bg-black/50 rounded-full border-2 border-black overflow-hidden p-0.5">
            <div
              className="h-full bg-[#ffe17c] dark:bg-[#ffe17c] rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, progressPercent)}%` }}
            />
          </div>

          <p className="text-[11px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
            {nextMilestone.daysRemaining === 1
              ? `🎯 Just 1 more day to unlock +${formatDuration(nextMilestone.bonusMinutes)} free time!`
              : `🎯 ${nextMilestone.daysRemaining} more daily credits to unlock +${formatDuration(nextMilestone.bonusMinutes)} free time!`}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#4ade80]/10 border-2 border-black text-xs font-bold text-[#4ade80]">
          <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Champion! You've unlocked all streak tiers! Keep credit daily to stay on top!</span>
        </div>
      )}

      {/* Milestone Checkpoints Roadmap */}
      {allMilestones.length > 0 && (
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#b7c6c2] block mb-2">
            Reward Roadmap
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {allMilestones.map((m) => {
              const isAchieved = currentStreak >= m.days;
              const isCurrentTarget = nextMilestone?.days === m.days;

              return (
                <div
                  key={m.days}
                  className={`p-2 rounded-xl border-2 transition-all text-center ${isAchieved
                      ? 'border-black bg-[#4ade80]/20 text-black dark:text-white'
                      : isCurrentTarget
                        ? 'border-black bg-[#ffe17c] text-black shadow-neo-sm'
                        : 'border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-[#171e19] text-neutral-500 opacity-70'
                    }`}
                >
                  <div className="text-[10px] font-black uppercase">
                    {isAchieved ? '✓ Day ' + m.days : 'Day ' + m.days}
                  </div>
                  <div className="font-mono font-black text-xs mt-0.5">
                    +{formatDuration(m.bonusMinutes)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
