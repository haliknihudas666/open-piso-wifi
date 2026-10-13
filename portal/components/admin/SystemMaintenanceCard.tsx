'use client';

import React, { useState } from 'react';
import { Power, RotateCcw, Trash2, RefreshCw, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function SystemMaintenanceCard() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAction = async (action: string, confirmText: string) => {
    if (!confirm(confirmText)) {
      return;
    }

    setLoadingAction(action);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/system/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Action execution failed');
      }

      setStatusMsg({ type: 'success', text: data.message || 'Action executed successfully!' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Operation failed' });
    } finally {
      setTimeout(() => setLoadingAction(null), 2000);
    }
  };

  const handleDeployRouter = async () => {
    if (!confirm('Deploy latest setup-openwrt.sh configuration and firewall rules to the OpenWrt router (192.168.1.1) now?')) {
      return;
    }

    setLoadingAction('deploy_router');
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/router/deploy', {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Router deployment failed');
      }

      setStatusMsg({ type: 'success', text: data.message || 'OpenWrt router deployed successfully!' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Deployment error' });
    } finally {
      setTimeout(() => setLoadingAction(null), 2000);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Power className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Power & Service Maintenance</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Safe rebooting, service restarts, and cache flushing</p>
          </div>
        </div>
      </CardHeader>

      {statusMsg && (
        <div
          className={`mb-4 flex items-center gap-2.5 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold text-black ${
            statusMsg.type === 'success'
              ? 'bg-[#4ade80]'
              : 'bg-[#ff5f57]'
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Deploy / Update OpenWrt Router */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] flex flex-col justify-between shadow-neo-sm">
          <div>
            <h3 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 mb-1 font-display">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Deploy / Update OpenWrt Router
            </h3>
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] mb-3.5">
              Pushes and applies the latest firewall rules, Wi-Fi configs, and QoS scripts to the OpenWrt router at 192.168.1.1.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDeployRouter}
            isLoading={loadingAction === 'deploy_router'}
            className="w-full text-xs font-black shadow-neo-sm"
          >
            Deploy Router Config
          </Button>
        </div>

        {/* Restart Services */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] flex flex-col justify-between shadow-neo-sm">
          <div>
            <h3 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 mb-1 font-display">
              <RefreshCw className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
              Restart System Services
            </h3>
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] mb-3.5">
              Restarts the Next.js portal and hardware daemon processes without rebooting the OS.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('restart_services', 'Restart portal and daemon background services now?')}
            isLoading={loadingAction === 'restart_services'}
            className="w-full text-xs font-black shadow-neo-sm"
          >
            Restart Services
          </Button>
        </div>

        {/* Flush Active Sessions */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] flex flex-col justify-between shadow-neo-sm">
          <div>
            <h3 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 mb-1 font-display">
              <Trash2 className="w-3.5 h-3.5 text-amber-500" />
              Flush Active Sessions
            </h3>
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] mb-3.5">
              Clears all authorized MAC addresses from OpenWrt firewall and marks sessions expired.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('flush_sessions', 'Flush all active sessions and block all current clients?')}
            isLoading={loadingAction === 'flush_sessions'}
            className="w-full text-xs font-black shadow-neo-sm text-amber-600 dark:text-amber-400"
          >
            Flush Active Sessions
          </Button>
        </div>

        {/* Reboot OpenWrt Router */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] flex flex-col justify-between shadow-neo-sm">
          <div>
            <h3 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 mb-1 font-display">
              <RotateCcw className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Reboot OpenWrt Router
            </h3>
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] mb-3.5">
              Sends a reboot signal to the Ruijie OpenWrt router at 192.168.1.1 via SSH.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('reboot_router', 'Reboot the OpenWrt router now? Connected clients will drop.')}
            isLoading={loadingAction === 'reboot_router'}
            className="w-full text-xs font-black shadow-neo-sm"
          >
            Reboot Router
          </Button>
        </div>

        {/* Reboot Raspberry Pi */}
        <div className="p-4 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] flex flex-col justify-between sm:col-span-2 shadow-neo-sm">
          <div>
            <h3 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 mb-1 font-display">
              <Power className="w-3.5 h-3.5 text-rose-600" />
              Reboot Raspberry Pi
            </h3>
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2] mb-3.5">
              Safely reboots the Raspberry Pi system. The portal will be unreachable for ~45 seconds.
            </p>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() => handleAction('reboot_rpi', 'Reboot the Raspberry Pi now? This will reboot the paywall server.')}
            isLoading={loadingAction === 'reboot_rpi'}
            className="w-full text-xs font-black shadow-neo-sm"
          >
            Reboot Raspberry Pi
          </Button>
        </div>
      </div>
    </Card>
  );
}
