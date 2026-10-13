'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { GitBranch, Download, RefreshCw, CheckCircle2, AlertCircle, Terminal, Sparkles, ChevronDown, ChevronUp, ShieldCheck, Globe, Cpu, Box } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SystemUpdateCard() {
  const { data: versionData, mutate: mutateVersion, isValidating } = useSWR(
    '/api/admin/system/version',
    fetcher
  );

  const { data: updateState, mutate: mutateUpdateState } = useSWR(
    '/api/admin/system/update',
    fetcher,
    { refreshInterval: 2000 }
  );

  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerType, setTriggerType] = useState<'normal' | 'force' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  const isUpdating = updateState?.status === 'updating';
  const hasUpdate = !!versionData?.updateAvailable;

  const handleTriggerUpdate = async (force: boolean = false) => {
    const confirmPrompt = force
      ? `Force re-download and re-install the latest release bundle?\n\n• Re-downloads and replaces system binaries with fresh copies from GitHub Releases\n• All database records (dev.db), vouchers, sales, and settings will be safely preserved\n• OpenWrt router firewall rules & services will be refreshed\n\nProceed with Force Re-install?`
      : hasUpdate
      ? `Update system to ${versionData?.latestVersion} now?\n\n• Pre-built bundle will be downloaded instantly (no client-side builds)\n• Your database, settings, and vouchers will be preserved\n• OpenWrt router will be updated without disconnecting active Wi-Fi users`
      : `Run normal system update check now? If the system is already up to date, it will exit cleanly without modifying files.`;

    if (!confirm(confirmPrompt)) {
      return;
    }

    setIsTriggering(true);
    setTriggerType(force ? 'force' : 'normal');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/system/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start update');
      }
      mutateUpdateState();
    } catch (err: any) {
      setErrorMsg(err.message || 'Update request failed');
    } finally {
      setIsTriggering(false);
      setTriggerType(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>System & OTA Releases</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Pre-compiled GitHub Releases with zero client-side building</p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            mutateVersion();
            mutateUpdateState();
          }}
          disabled={isValidating || isUpdating}
          className="h-8 w-8 p-0 shadow-neo-sm"
          title="Check for Updates"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-[#ff5f57] border-2 border-black text-black text-xs font-bold shadow-neo-sm">
          <AlertCircle className="w-4 h-4 shrink-0 text-black" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Version Status Summary: System Core, Web Portal, Hardware Daemon, and GitHub Releases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* Card 1: System Release (Root package.json) */}
        <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold text-neutral-700 dark:text-[#b7c6c2] flex items-center gap-1">
              <Box className="w-3 h-3 text-black dark:text-[#ffe17c]" />
              System Release
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#ffe17c] text-black border border-black">
              root
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-black dark:text-white">
            <Badge variant="primary" className="font-mono text-[11px] px-2 py-0.5">
              {versionData?.systemVersion || versionData?.currentVersion || '...'}
            </Badge>
            <span className="text-neutral-500 font-sans font-bold text-[10px]">
              ({versionData?.currentCommit || 'dev'})
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold mt-1 truncate">
            {versionData?.commitDate ? new Date(versionData.commitDate).toLocaleDateString() : 'Release Build'}
          </p>
        </div>

        {/* Card 2: Web Portal Service */}
        <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold text-neutral-700 dark:text-[#b7c6c2] flex items-center gap-1">
              <Globe className="w-3 h-3 text-black dark:text-[#ffe17c]" />
              Web Portal
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-200 text-black border border-black">
              :3000
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
            <Badge variant="purple" className="font-mono text-[11px] px-2 py-0.5">
              {versionData?.portalVersion || versionData?.systemVersion || '...'}
            </Badge>
            <span className="text-neutral-500 font-sans font-bold text-[10px]">
              Next.js 16
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold mt-1 truncate">
            Captive Paywall & Admin
          </p>
        </div>

        {/* Card 3: Hardware Daemon Service */}
        <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold text-neutral-700 dark:text-[#b7c6c2] flex items-center gap-1">
              <Cpu className="w-3 h-3 text-black dark:text-[#ffe17c]" />
              Hardware Daemon
            </span>
            <Badge variant={versionData?.daemonOnline ? 'success' : 'warning'} className="text-[9px] py-0 px-1 font-black">
              {versionData?.daemonOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
            <span className="px-2 py-0.5 rounded-md border-2 border-black dark:border-[#4a6052] text-[11px] font-mono font-black text-black dark:text-[#ffe17c]">
              {versionData?.daemonVersion || versionData?.systemVersion || '...'}
            </span>
            <span className="text-neutral-500 font-sans font-bold text-[10px]">
              Port 4000
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold mt-1 truncate">
            GPIO & Router SSH Controller
          </p>
        </div>

        {/* Card 4: GitHub Update Status */}
        <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold text-neutral-700 dark:text-[#b7c6c2]">Update Status</span>
            <span className="text-[9px] font-mono font-bold text-neutral-500">Node {versionData?.nodeVersion?.replace(/^v/, '') || process.version}</span>
          </div>
          <div>
            {hasUpdate ? (
              <Badge variant="warning" className="gap-1 text-[11px] font-black">
                <Sparkles className="w-3 h-3 text-black" />
                New: {versionData?.latestVersion}
              </Badge>
            ) : (
              <Badge variant="success" className="gap-1 text-[11px] font-black">
                <CheckCircle2 className="w-3 h-3 text-black" />
                Up to Date ({versionData?.latestVersion || 'synced'})
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold mt-1 truncate">
            {versionData?.platform || 'Linux'}
          </p>
        </div>
      </div>

      {/* Safety & Preservation Notice */}
      <div className="mb-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#4ade80] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
        <ShieldCheck className="w-4 h-4 shrink-0 text-black" />
        <span>
          <strong>State-Preserving Updater:</strong> Database records (vouchers, sales), configuration (.env), and router MAC tables are automatically preserved.
        </span>
      </div>

      {/* Release Notes Changelog (If present) */}
      {versionData?.releaseNotes && (
        <div className="mb-4 rounded-xl border-2 border-black dark:border-[#4a6052] bg-white dark:bg-[#1c241f] shadow-neo-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowChangelog(!showChangelog)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-black text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              What's New in {versionData.latestVersion}
            </span>
            {showChangelog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showChangelog && (
            <div className="px-3 py-2.5 text-xs text-neutral-800 dark:text-neutral-200 border-t-2 border-black/10 dark:border-white/10 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans font-medium leading-relaxed">
              {versionData.releaseNotes}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons: Normal Update vs Force Re-install */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
        <div className="text-xs">
          <p className="font-extrabold text-black dark:text-white">
            {hasUpdate
              ? `New release available: ${versionData?.latestVersion}`
              : `System is running latest version: ${versionData?.systemVersion || 'v1.1.0'}`}
          </p>
          <p className="text-neutral-600 dark:text-[#b7c6c2] text-[11px] font-bold mt-0.5">
            {hasUpdate
              ? 'Click Normal Update to download and apply changes with zero Wi-Fi downtime.'
              : 'Use Normal Update to check for releases, or Force Re-install to repair/refresh system files.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Normal Update Button */}
          <Button
            onClick={() => handleTriggerUpdate(false)}
            disabled={isUpdating || isTriggering}
            isLoading={isTriggering && triggerType === 'normal'}
            variant="primary"
            className="font-black gap-1.5 shadow-neo-sm text-xs h-9 px-3.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isUpdating && triggerType !== 'force'
                ? 'Applying Update...'
                : hasUpdate
                ? `Update to ${versionData?.latestVersion}`
                : 'Normal Update'}
            </span>
          </Button>

          {/* Force Re-install Button */}
          <Button
            onClick={() => handleTriggerUpdate(true)}
            disabled={isUpdating || isTriggering}
            isLoading={isTriggering && triggerType === 'force'}
            variant="outline"
            className="font-black text-xs h-9 px-3 gap-1.5 shadow-neo-sm"
            title="Re-download and overwrite system binaries even if version is current"
          >
            <RefreshCw className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
            <span>Force Re-install</span>
          </Button>
        </div>
      </div>

      {/* Live Console Update Logs */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-black text-black dark:text-white">
            <Terminal className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
            Live Update Console
          </span>
          {updateState?.status && (
            <span className="text-[11px] uppercase tracking-wider font-mono font-black text-neutral-700 dark:text-[#b7c6c2]">
              Status: <span className="text-black dark:text-[#ffe17c]">{updateState.status}</span>
            </span>
          )}
        </div>

        <div className="p-3.5 rounded-xl bg-black border-2 border-black dark:border-[#4a6052] shadow-neo-sm font-mono text-[11px] text-[#4ade80] h-44 overflow-y-auto space-y-1">
          {updateState?.logs && updateState.logs.length > 0 ? (
            updateState.logs.map((log: string, idx: number) => (
              <div key={idx} className="leading-relaxed">
                {log}
              </div>
            ))
          ) : (
            <div className="text-neutral-500 italic font-medium">No active update running. Click Update to view live progress.</div>
          )}
        </div>
      </div>
    </Card>
  );
}

