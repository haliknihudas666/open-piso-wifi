'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Flame,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Award,
  Users,
  Trophy,
  RotateCcw,
  Search,
  Sparkles,
  Zap,
  Edit2,
  HelpCircle,
  Copy,
  ExternalLink,
  Coins,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatDuration } from '@/lib/utils';
import { LoyaltyMilestone } from '@/lib/loyalty';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface LoyaltyConfigCardProps {
  onSaveSuccess?: () => void;
}

const PRESET_DURATIONS = [
  { label: '30 Mins', minutes: 30 },
  { label: '1 Hour', minutes: 60 },
  { label: '2 Hours', minutes: 120 },
  { label: '4 Hours', minutes: 240 },
  { label: '6 Hours', minutes: 360 },
  { label: '12 Hours', minutes: 720 },
  { label: '24 Hours', minutes: 1440 },
];

export function LoyaltyConfigCard({ onSaveSuccess }: LoyaltyConfigCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data, mutate, isLoading } = useSWR(
    `/api/admin/loyalty?search=${encodeURIComponent(searchQuery)}&page=${page}&limit=20`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Local state for configuration editing
  const [enabled, setEnabled] = useState<boolean>(true);
  const [minAmount, setMinAmount] = useState<number>(1);
  const [milestones, setMilestones] = useState<LoyaltyMilestone[]>([]);
  const [isConfigInitialized, setIsConfigInitialized] = useState(false);

  // Sync initial config from server
  React.useEffect(() => {
    if (data?.config && !isConfigInitialized) {
      setEnabled(data.config.enabled);
      setMinAmount(data.config.minAmount || 1);
      setMilestones(data.config.milestones || []);
      setIsConfigInitialized(true);
    }
  }, [data?.config, isConfigInitialized]);

  // Form for adding a new milestone
  const [newDays, setNewDays] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // State for manual adjustments
  const [adjustModalSession, setAdjustModalSession] = useState<string | null>(null);
  const [adjustStreakValue, setAdjustStreakValue] = useState<string>('1');

  // Status feedback
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleAddMilestone = () => {
    const days = parseInt(newDays, 10);
    const bonusMinutes = parseInt(newMinutes, 10);

    if (isNaN(days) || days <= 0 || isNaN(bonusMinutes) || bonusMinutes <= 0) {
      setErrorMsg('Please enter valid days and bonus minutes.');
      return;
    }

    if (milestones.some((m) => m.days === days)) {
      setErrorMsg(`A milestone for a ${days}-day streak already exists.`);
      return;
    }

    const defaultTitle = `${days}-Day Streak (+${formatDuration(bonusMinutes)})`;
    const newTier: LoyaltyMilestone = {
      days,
      bonusMinutes,
      rewardName: newTitle.trim() || defaultTitle,
    };

    const updated = [...milestones, newTier].sort((a, b) => a.days - b.days);
    setMilestones(updated);
    setNewDays('');
    setNewMinutes('');
    setNewTitle('');
    setShowAddModal(false);
    setErrorMsg(null);
  };

  const handleDeleteMilestone = (days: number) => {
    setMilestones(milestones.filter((m) => m.days !== days));
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_config',
          enabled,
          minAmount,
          milestones,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save configuration');

      setSuccessMsg('Loyalty & Daily Streak settings successfully saved!');
      mutate();
      if (onSaveSuccess) onSaveSuccess();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetStreak = async (sessionCode: string) => {
    if (!confirm(`Are you sure you want to reset the streak for session ${sessionCode} to 0?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_streak', sessionCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      mutate();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdjustStreak = async () => {
    if (!adjustModalSession) return;
    const streakNum = parseInt(adjustStreakValue, 10);
    if (isNaN(streakNum) || streakNum < 0) return;

    try {
      const res = await fetch('/api/admin/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjust_streak',
          sessionCode: adjustModalSession,
          streak: streakNum,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAdjustModalSession(null);
      mutate();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const stats = data?.stats || {
    totalCustomers: 0,
    activeStreakersCount: 0,
    highestStreak: 0,
    totalBonusMinutes: 0,
    totalClaimsCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-[#4ade80]/20 border-2 border-black dark:border-[#4ade80] flex items-center gap-3 font-bold text-black dark:text-[#4ade80] shadow-neo-sm animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#ff5f57]/20 border-2 border-black dark:border-[#ff5f57] flex items-center gap-3 font-bold text-black dark:text-[#ff5f57] shadow-neo-sm animate-in fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Top Telemetry Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#1a231d] border-2 border-black shadow-neo">
          <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2]">
            <span className="text-xs font-black uppercase tracking-wider">Active Streaks</span>
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500 animate-pulse" />
          </div>
          <div className="mt-2 text-3xl font-black font-mono text-black dark:text-[#ffe17c]">
            {stats.activeStreakersCount}
          </div>
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Credited today or yesterday
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#1a231d] border-2 border-black shadow-neo">
          <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2]">
            <span className="text-xs font-black uppercase tracking-wider">Highest Streak</span>
            <Trophy className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2 text-3xl font-black font-mono text-black dark:text-white">
            {stats.highestStreak} <span className="text-base font-normal">days</span>
          </div>
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Top customer record
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#1a231d] border-2 border-black shadow-neo">
          <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2]">
            <span className="text-xs font-black uppercase tracking-wider">Bonus Time Won</span>
            <Sparkles className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="mt-2 text-3xl font-black font-mono text-black dark:text-[#4ade80]">
            {Math.round((stats.totalBonusMinutes / 60) * 10) / 10} <span className="text-base font-normal">hrs</span>
          </div>
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            {stats.totalBonusMinutes} total free minutes
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#1a231d] border-2 border-black shadow-neo">
          <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2]">
            <span className="text-xs font-black uppercase tracking-wider">Total Customers</span>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-2 text-3xl font-black font-mono text-black dark:text-white">
            {stats.totalCustomers}
          </div>
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Tracked by Session Code
          </span>
        </div>
      </div>

      {/* Main Configuration Card */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flame className="w-6 h-6 text-orange-500 fill-orange-500" />
                <span>Customer Loyalty & Daily Streaks</span>
              </CardTitle>
              <p className="mt-1 text-xs text-neutral-600 dark:text-[#b7c6c2]">
                Incentivize daily customer returns! When regular customers credit their Wi-Fi every day, hitting streak targets unlocks automatic bonus time. Tracked automatically per device via their Session Code.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSaveConfig}
              isLoading={isSaving}
              className="shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>Save Configuration</span>
            </Button>
          </div>
        </CardHeader>

        <div className="p-6 space-y-6">
          {/* General Loyalty Settings */}
          <div className="p-5 rounded-xl bg-neutral-50 dark:bg-[#171e19] border-2 border-black dark:border-[#4a6052] space-y-4">
            {/* Master Enable/Disable Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b-2 border-black/10 dark:border-white/10">
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border-2 border-black transition-colors shrink-0 shadow-neo-sm ${
                    enabled ? 'bg-[#4ade80] text-black' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
                  }`}
                >
                  <Flame className={`w-5 h-5 ${enabled ? 'fill-black' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-black dark:text-white">
                      Enable Daily Streak System
                    </span>
                    <Badge variant={enabled ? 'success' : 'outline'} className="text-[10px] py-0 px-2">
                      {enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-600 dark:text-[#b7c6c2]">
                    Activate automated daily streak counting and bonus reward payouts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                <span className="text-xs font-extrabold text-neutral-500 dark:text-[#b7c6c2]">
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label="Toggle Daily Streak System"
                  onClick={() => setEnabled(!enabled)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full border-2 border-black shadow-neo-sm transition-colors cursor-pointer focus:outline-none ${
                    enabled ? 'bg-[#4ade80]' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white border-2 border-black shadow-sm transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Min Credit Requirement */}
            <div className={`transition-opacity duration-200 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <label className="text-sm font-black text-black dark:text-white">
                      Minimum Daily Credit (₱)
                    </label>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
                    Minimum coin or voucher amount required for today&apos;s transaction to count towards streak.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-[#111713] p-1 rounded-xl border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
                    {[1, 5, 10, 20].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMinAmount(preset)}
                        className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                          minAmount === preset
                            ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                            : 'text-neutral-600 dark:text-[#b7c6c2] hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                      >
                        ₱{preset}
                      </button>
                    ))}
                  </div>

                  {/* Input field with Peso prefix */}
                  <div className="relative flex items-center">
                    <span className="absolute left-3 font-mono font-black text-sm text-black dark:text-white pointer-events-none z-10">
                      ₱
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={minAmount}
                      onChange={(e) => setMinAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-24 pl-7 pr-3 py-1.5 text-center font-mono font-black text-sm bg-white dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] rounded-xl text-black dark:text-white focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                    />
                  </div>
                </div>
              </div>

              <p className="mt-2 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                💡 <span className="underline decoration-dotted">Recommended: ₱1</span> so any coin or voucher insert qualifies for that day&apos;s streak.
              </p>
            </div>
          </div>

          {/* Configurable Milestones Editor */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-extrabold text-black dark:text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <span>Streak Milestones & Rewards</span>
                </h3>
                <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
                  Configure what rewards customers unlock when they hit consecutive daily streaks.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span>Add Milestone Tier</span>
              </Button>
            </div>

            {/* Milestones Cards / Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {milestones.length === 0 ? (
                <div className="col-span-full p-8 text-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
                  <Flame className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400">
                    No streak milestones configured yet.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setMilestones([
                        { days: 3, bonusMinutes: 60, rewardName: '3-Day Streak (1 Free Hour)' },
                        { days: 7, bonusMinutes: 360, rewardName: '7-Day Streak (6 Free Hours)' },
                      ]);
                    }}
                    className="mt-3"
                  >
                    Load Default Milestones (3-Day & 7-Day)
                  </Button>
                </div>
              ) : (
                milestones.map((m) => (
                  <div
                    key={m.days}
                    className="p-4 rounded-xl bg-white dark:bg-[#171e19] border-2 border-black dark:border-[#4a6052] shadow-neo-sm relative flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="warning" className="flex items-center gap-1 text-xs">
                          <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                          <span>{m.days}-Day Streak</span>
                        </Badge>
                        <button
                          type="button"
                          onClick={() => handleDeleteMilestone(m.days)}
                          className="p-1 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="Delete Milestone"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-2">
                        <span className="text-2xl font-black font-mono text-black dark:text-[#4ade80]">
                          +{formatDuration(m.bonusMinutes)}
                        </span>
                        <span className="text-xs font-extrabold text-neutral-500 dark:text-neutral-400 block">
                          FREE BONUS TIME
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-bold text-neutral-700 dark:text-[#b7c6c2] line-clamp-2">
                        {m.rewardName}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] font-mono text-neutral-500">
                      <span>Target: Day {m.days}</span>
                      <span>{m.bonusMinutes} mins</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Customer Streaks Leaderboard Table */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span>Customer Loyalty Streaks Leaderboard</span>
              </CardTitle>
              <p className="mt-1 text-xs text-neutral-600 dark:text-[#b7c6c2]">
                Real-time tracking of customer devices, their current daily streak, and total free bonus rewards earned.
              </p>
            </div>

            {/* Search Box */}
            <div className="flex items-center gap-2 w-full md:w-72">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  type="text"
                  placeholder="Search code / MAC..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#ffe17c] text-black font-extrabold border-b-2 border-black uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3">Session Code</th>
                <th className="p-3">Current Streak</th>
                <th className="p-3">Highest Record</th>
                <th className="p-3">Device / Hostname</th>
                <th className="p-3">Last Active Date</th>
                <th className="p-3">Total Credits</th>
                <th className="p-3">Bonus Won</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
              {!data?.records || data.records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-500 font-bold">
                    {isLoading ? 'Loading customer streaks...' : 'No loyalty customer records found.'}
                  </td>
                </tr>
              ) : (
                data.records.map((r: any) => (
                  <tr
                    key={r.id}
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium"
                  >
                    {/* Session Code */}
                    <td className="p-3 font-mono font-extrabold text-black dark:text-[#ffe17c]">
                      <div className="flex items-center gap-1.5">
                        <span>{r.sessionCode}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(r.sessionCode)}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                          title="Copy session code"
                        >
                          {copiedCode === r.sessionCode ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-neutral-400" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Current Streak */}
                    <td className="p-3">
                      {r.effectiveStreak > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="warning" className="flex items-center gap-1">
                            <Flame className="w-3 h-3 text-orange-600 fill-orange-600" />
                            <span>{r.effectiveStreak} Days</span>
                          </Badge>
                          {r.creditedToday && (
                            <span className="text-[10px] font-extrabold text-[#4ade80]" title="Credited today">
                              ✓ Today
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-neutral-500">
                          0 Days
                        </Badge>
                      )}
                    </td>

                    {/* Highest Streak */}
                    <td className="p-3 font-mono font-bold text-neutral-700 dark:text-neutral-300">
                      {r.highestStreak > 0 ? `🏆 ${r.highestStreak}d` : '—'}
                    </td>

                    {/* Device / MAC */}
                    <td className="p-3 text-neutral-600 dark:text-[#b7c6c2]">
                      <div className="font-bold text-black dark:text-white truncate max-w-[140px]">
                        {r.deviceName || 'Customer Device'}
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400 block truncate max-w-[140px]">
                        {r.macAddress || '—'}
                      </span>
                    </td>

                    {/* Last Active Date */}
                    <td className="p-3 text-neutral-600 dark:text-[#b7c6c2] font-mono text-[11px]">
                      {r.lastCreditDate ? (
                        <div>
                          <span>{r.lastCreditDate}</span>
                          {!r.isStreakAlive && (
                            <span className="block text-[10px] text-red-500 font-sans font-bold">
                              Streak broken
                            </span>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Total Credits */}
                    <td className="p-3 font-mono font-bold text-black dark:text-white">
                      {r.totalCredits}x
                      <span className="text-[10px] text-neutral-400 block">₱{r.totalAmountSpent}</span>
                    </td>

                    {/* Bonus Time Won */}
                    <td className="p-3 font-mono font-bold text-[#4ade80]">
                      {r.totalBonusMinutes > 0 ? `+${formatDuration(r.totalBonusMinutes)}` : '—'}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAdjustModalSession(r.sessionCode);
                            setAdjustStreakValue(String(r.effectiveStreak || 1));
                          }}
                          className="px-2 py-1 text-[11px]"
                          title="Adjust Streak"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Adjust</span>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetStreak(r.sessionCode)}
                          className="px-2 py-1 text-[11px] text-red-500 hover:text-red-700"
                          title="Reset Streak"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="p-4 border-t-2 border-black dark:border-[#4a6052] flex items-center justify-between text-xs">
            <span className="font-bold text-neutral-500">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal: Add Milestone Tier */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#1a231d] border-2 border-black rounded-2xl shadow-neo p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black font-display text-black dark:text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
                <span>Add Streak Milestone Tier</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-black dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
              Set how many consecutive daily credits unlock this tier and how many free bonus minutes are awarded.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-extrabold uppercase text-neutral-600 dark:text-neutral-300 block mb-1">
                  Consecutive Streak Days Target
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="e.g. 3, 7, 14, 30"
                    value={newDays}
                    onChange={(e) => setNewDays(e.target.value)}
                    className="font-mono font-bold"
                  />
                  <span className="text-xs font-bold text-neutral-500">Days</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold uppercase text-neutral-600 dark:text-neutral-300 block mb-1">
                  Bonus Reward Time (Minutes)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="10000"
                  placeholder="e.g. 60 (1 hr) or 360 (6 hrs)"
                  value={newMinutes}
                  onChange={(e) => setNewMinutes(e.target.value)}
                  className="font-mono font-bold mb-2"
                />

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_DURATIONS.map((preset) => (
                    <button
                      key={preset.minutes}
                      type="button"
                      onClick={() => {
                        setNewMinutes(String(preset.minutes));
                        if (!newTitle) {
                          setNewTitle(`${newDays ? `${newDays}-Day Streak` : 'Streak Bonus'} (+${preset.label})`);
                        }
                      }}
                      className="px-2 py-1 text-[11px] font-bold rounded-md border border-black bg-neutral-100 dark:bg-neutral-800 hover:bg-[#ffe17c] hover:text-black transition-colors cursor-pointer"
                    >
                      +{preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold uppercase text-neutral-600 dark:text-neutral-300 block mb-1">
                  Reward Title / Celebration Name
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 3-Day Streak (1 Free Hour)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={handleAddMilestone}>
                <Plus className="w-4 h-4" />
                <span>Add Tier</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adjust Customer Streak */}
      {adjustModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#1a231d] border-2 border-black rounded-2xl shadow-neo p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-black text-black dark:text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-orange-500" />
              <span>Adjust Streak for {adjustModalSession}</span>
            </h3>

            <div>
              <label className="text-xs font-bold text-neutral-500 block mb-1">
                Set Current Streak (Days):
              </label>
              <Input
                type="number"
                min="0"
                max="365"
                value={adjustStreakValue}
                onChange={(e) => setAdjustStreakValue(e.target.value)}
                className="font-mono font-bold text-center text-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdjustModalSession(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={handleAdjustStreak}>
                Save Streak
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
