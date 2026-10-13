'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  Wifi,
  Radio,
  Save,
  RefreshCw,
  Smartphone,
  Power,
  CheckCircle2,
  AlertCircle,
  Users,
  Signal,
  Sparkles,
  Router,
  Activity,
  Gauge,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface RouterWifiCardProps {
  initialSettings?: {
    router_ip?: string;
    portal_ip?: string;
    portal_domain?: string;
    router_ssh_port?: string;
    router_ssh_user?: string;
    router_ssh_key_path?: string;
    router_mode?: string;
    speed_limit?: string;
    custom_down_mbps?: string;
    custom_up_mbps?: string;
  };
  onSaveSuccess?: () => void;
}

export function RouterWifiCard({ initialSettings, onSaveSuccess }: RouterWifiCardProps) {
  // -------------------------------------------------------------
  // 1. OPENWRT GATEWAY CONTROLLER STATE
  // -------------------------------------------------------------
  const [gatewayData, setGatewayData] = useState({
    router_ip: initialSettings?.router_ip || '192.168.1.1',
    portal_ip: initialSettings?.portal_ip || '192.168.1.240',
    portal_domain: initialSettings?.portal_domain || 'wifi.local',
    router_ssh_port: initialSettings?.router_ssh_port || '22',
    router_ssh_user: initialSettings?.router_ssh_user || 'root',
    router_ssh_key_path: initialSettings?.router_ssh_key_path || '/root/.ssh/id_rsa',
    router_mode: initialSettings?.router_mode || 'fw4_nftables',
  });

  const [isTestingRouter, setIsTestingRouter] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayMsg, setGatewayMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -------------------------------------------------------------
  // 2. BANDWIDTH SPEED LIMITER & QOS (SQM) STATE
  // -------------------------------------------------------------
  const { data: qosStatus, mutate: mutateQoS } = useSWR('/api/admin/router/qos', fetcher, {
    refreshInterval: 6000,
  });

  const [qosData, setQosData] = useState({
    speed_limit: initialSettings?.speed_limit || '25mbps',
    custom_down_mbps: initialSettings?.custom_down_mbps || '25',
    custom_up_mbps: initialSettings?.custom_up_mbps || '10',
  });

  const [isApplyingQoS, setIsApplyingQoS] = useState(false);
  const [qosMsg, setQosMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync with incoming initialSettings if loaded asynchronously
  useEffect(() => {
    if (initialSettings) {
      setGatewayData((prev) => ({
        router_ip: initialSettings.router_ip ?? prev.router_ip,
        portal_ip: initialSettings.portal_ip ?? prev.portal_ip,
        portal_domain: initialSettings.portal_domain ?? prev.portal_domain,
        router_ssh_port: initialSettings.router_ssh_port ?? prev.router_ssh_port,
        router_ssh_user: initialSettings.router_ssh_user ?? prev.router_ssh_user,
        router_ssh_key_path: initialSettings.router_ssh_key_path ?? prev.router_ssh_key_path,
        router_mode: initialSettings.router_mode ?? prev.router_mode,
      }));
      setQosData((prev) => ({
        speed_limit: initialSettings.speed_limit ?? prev.speed_limit,
        custom_down_mbps: initialSettings.custom_down_mbps ?? prev.custom_down_mbps,
        custom_up_mbps: initialSettings.custom_up_mbps ?? prev.custom_up_mbps,
      }));
    }
  }, [initialSettings]);

  // Handle OpenWrt SSH Test Connection
  const handleTestRouter = async () => {
    setIsTestingRouter(true);
    setTestResult(null);
    try {
      const startTime = performance.now();
      const res = await fetch('/api/admin/router', { method: 'GET' });
      const latencyMs = Math.round(performance.now() - startTime);
      const data = await res.json();

      if (res.ok && data.connected) {
        setTestResult({
          success: true,
          message: `Connected successfully! Router: ${data.hostname || 'OpenWrt'} · Uptime: ${data.uptime || 'Unknown'}`,
          latencyMs,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Could not establish SSH connection to OpenWrt router.',
          latencyMs,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error attempting to reach router endpoint.',
      });
    } finally {
      setIsTestingRouter(false);
    }
  };

  // Handle Save OpenWrt Gateway Controller Settings
  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGateway(true);
    setGatewayMsg(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_ip: gatewayData.router_ip,
          portal_ip: gatewayData.portal_ip,
          portal_domain: gatewayData.portal_domain,
          router_ssh_port: gatewayData.router_ssh_port,
          router_ssh_user: gatewayData.router_ssh_user,
          router_ssh_key_path: gatewayData.router_ssh_key_path,
          router_mode: gatewayData.router_mode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save gateway settings');

      setGatewayMsg({ type: 'success', text: 'OpenWrt gateway & controller settings saved successfully!' });
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      setGatewayMsg({ type: 'error', text: err.message || 'Error saving gateway configuration' });
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Handle Apply Bandwidth Speed Limiter (QoS SQM)
  const handleApplyQoS = async () => {
    setIsApplyingQoS(true);
    setQosMsg(null);

    try {
      let downMbps = 0;
      let upMbps = 0;
      if (qosData.speed_limit === '25mbps') {
        downMbps = 25;
        upMbps = 10;
      } else if (qosData.speed_limit === '50mbps') {
        downMbps = 50;
        upMbps = 20;
      } else if (qosData.speed_limit === '100mbps') {
        downMbps = 100;
        upMbps = 50;
      } else if (qosData.speed_limit === 'custom') {
        downMbps = parseInt(qosData.custom_down_mbps || '25', 10);
        upMbps = parseInt(qosData.custom_up_mbps || '10', 10);
      } else if (qosData.speed_limit === 'unlimited') {
        downMbps = 0;
        upMbps = 0;
      }

      // 1. Apply live to router SQM daemon
      const resQos = await fetch('/api/admin/router/qos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadMbps: downMbps, uploadMbps: upMbps }),
      });
      const qosResData = await resQos.json();
      if (!resQos.ok) throw new Error(qosResData.error || 'Failed to apply speed limit to router');

      // 2. Persist speed limit preference in settings DB
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speed_limit: qosData.speed_limit,
          custom_down_mbps: qosData.custom_down_mbps,
          custom_up_mbps: qosData.custom_up_mbps,
        }),
      });

      setQosMsg({ type: 'success', text: qosResData.message || 'Bandwidth speed limit applied successfully to OpenWrt!' });
      mutateQoS();
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      setQosMsg({ type: 'error', text: err.message || 'Error applying bandwidth speed limit' });
    } finally {
      setIsApplyingQoS(false);
    }
  };

  // -------------------------------------------------------------
  // 3. OPENWRT WI-FI MANAGEMENT STATE
  // -------------------------------------------------------------
  const {
    data: wifiConfig,
    mutate: mutateWifi,
    isValidating: isWifiValidating,
  } = useSWR('/api/admin/router/wifi', fetcher);

  const {
    data: telemetry,
    mutate: mutateTelemetry,
    isValidating: isTelemetryValidating,
  } = useSWR('/api/admin/system/health', fetcher, { refreshInterval: 5000 });

  const {
    data: clientsData,
    mutate: mutateClients,
    isValidating: isClientsValidating,
  } = useSWR('/api/admin/router/clients', fetcher, { refreshInterval: 5000 });

  const connectedClients = clientsData?.clients || [];
  const routerStats = telemetry?.router;

  const [ssid2g, setSsid2g] = useState('');
  const [ssid5g, setSsid5g] = useState('');
  const [channel2g, setChannel2g] = useState('6');
  const [channel5g, setChannel5g] = useState('36');
  const [isUnifiedSsid, setIsUnifiedSsid] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingWifi, setIsSavingWifi] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [wifiMsg, setWifiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync Wi-Fi inputs with live OpenWrt configuration
  useEffect(() => {
    if (wifiConfig && !isDirty) {
      if (wifiConfig.ssid2g) setSsid2g(wifiConfig.ssid2g);
      if (wifiConfig.ssid5g) setSsid5g(wifiConfig.ssid5g);
      if (wifiConfig.channel2g) setChannel2g(wifiConfig.channel2g);
      if (wifiConfig.channel5g) setChannel5g(wifiConfig.channel5g);
      if (wifiConfig.isUnified !== undefined) {
        setIsUnifiedSsid(Boolean(wifiConfig.isUnified));
      } else if (wifiConfig.ssid2g && wifiConfig.ssid2g === wifiConfig.ssid5g) {
        setIsUnifiedSsid(true);
      }
    }
  }, [wifiConfig, isDirty]);

  const refreshAllWifi = () => {
    mutateWifi();
    mutateTelemetry();
    mutateClients();
  };

  const handleSaveWifi = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWifi(true);
    setWifiMsg(null);

    try {
      const res = await fetch('/api/admin/router/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid2g,
          ssid5g: isUnifiedSsid ? ssid2g : ssid5g,
          channel2g,
          channel5g,
          unified: isUnifiedSsid,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update Wi-Fi configuration');
      }

      setWifiMsg({ type: 'success', text: 'Wi-Fi SSIDs and channels applied to OpenWrt router!' });
      setIsDirty(false);
      refreshAllWifi();
    } catch (err: any) {
      setWifiMsg({ type: 'error', text: err.message || 'Error updating Wi-Fi' });
    } finally {
      setIsSavingWifi(false);
    }
  };

  const handleRebootRouter = async () => {
    if (!confirm('Are you sure you want to reboot the OpenWrt router? Connected clients will momentarily disconnect.')) {
      return;
    }

    setIsRebooting(true);
    setWifiMsg(null);

    try {
      const res = await fetch('/api/admin/system/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reboot_router' }),
      });

      const data = await res.json();
      setWifiMsg({ type: 'success', text: data.message || 'Router reboot command dispatched!' });
    } catch (err: any) {
      setWifiMsg({ type: 'error', text: err.message || 'Failed to reboot router' });
    } finally {
      setTimeout(() => setIsRebooting(false), 5000);
    }
  };

  const totalStations = routerStats?.totalClients ?? (routerStats ? ((routerStats.clients2g || 0) + (routerStats.clients5g || 0)) : connectedClients.length);
  const paidUsersCount = connectedClients.filter((c: any) => c.isAuthorized || c.isVip).length;
  const isValidatingWifi = isWifiValidating || isTelemetryValidating || isClientsValidating;

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* CARD 1: OPENWRT GATEWAY CONTROLLER                       */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <Router className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle>OpenWrt Gateway Controller (Tested on Ruijie RG-EW1200G Pro)</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
                OpenWrt gateway IP, domain redirect, SSH authentication, and firewall engine (compatible with any OpenWrt router)
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={isTestingRouter}
            onClick={handleTestRouter}
            className="gap-1.5 text-xs font-extrabold shadow-neo-sm shrink-0"
          >
            <Activity className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
            <span>Test Connection</span>
          </Button>
        </CardHeader>

        {testResult && (
          <div
            className={`flex items-center gap-2.5 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${testResult.success ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
              }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            )}
            <div className="flex-1">
              <span>{testResult.message}</span>
              {testResult.latencyMs !== undefined && (
                <span className="ml-2 font-mono text-[11px] opacity-90">({testResult.latencyMs}ms)</span>
              )}
            </div>
          </div>
        )}

        {gatewayMsg && (
          <div
            className={`flex items-center gap-2 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${gatewayMsg.type === 'success' ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
              }`}
          >
            {gatewayMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            )}
            <span>{gatewayMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveGateway} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                Router IP Address
              </label>
              <Input
                type="text"
                value={gatewayData.router_ip}
                onChange={(e) => setGatewayData({ ...gatewayData, router_ip: e.target.value })}
                required
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                OpenWrt default gateway IP
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                Portal Host IP
              </label>
              <Input
                type="text"
                value={gatewayData.portal_ip}
                onChange={(e) => setGatewayData({ ...gatewayData, portal_ip: e.target.value })}
                required
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                IP where this captive portal runs
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                Local Domain Name
              </label>
              <Input
                type="text"
                value={gatewayData.portal_domain}
                onChange={(e) => setGatewayData({ ...gatewayData, portal_domain: e.target.value })}
                required
              />
              <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                DNS redirect domain (e.g. wifi.local)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                SSH Port
              </label>
              <Input
                type="text"
                value={gatewayData.router_ssh_port}
                onChange={(e) => setGatewayData({ ...gatewayData, router_ssh_port: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                SSH Username
              </label>
              <Input
                type="text"
                value={gatewayData.router_ssh_user}
                onChange={(e) => setGatewayData({ ...gatewayData, router_ssh_user: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                SSH Key Path
              </label>
              <Input
                type="text"
                value={gatewayData.router_ssh_key_path}
                onChange={(e) => setGatewayData({ ...gatewayData, router_ssh_key_path: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-black dark:text-white mb-1">
                Firewall Mode
              </label>
              <select
                value={gatewayData.router_mode}
                onChange={(e) => setGatewayData({ ...gatewayData, router_mode: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="fw4_nftables">fw4 (nftables — OpenWrt 22+)</option>
                <option value="iptables">fw3 (iptables — Legacy)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSavingGateway}
              className="gap-1.5 px-4 font-black text-xs shadow-neo"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Gateway Settings</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* ======================================================== */}
      {/* CARD 2: BANDWIDTH SPEED LIMITER & QOS (OPENWRT SQM)     */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#4ade80] text-black border-2 border-black shadow-neo-sm">
              <Gauge className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle>Bandwidth Speed Limiter & QoS (OpenWrt SQM)</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2]">
                Active traffic shaping and bandwidth throttling per client via OpenWrt Smart Queue Management
              </p>
            </div>
          </div>

          {qosStatus && (
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border-2 border-black shadow-neo-sm flex items-center gap-1 shrink-0 ${qosStatus.enabled ? 'bg-[#4ade80] text-black' : 'bg-[#ffe17c] text-black'
                }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-black" />
              {qosStatus.enabled
                ? `QoS Active (${qosStatus.downMbps}M / ${qosStatus.upMbps}M)`
                : 'QoS Inactive'}
            </span>
          )}
        </CardHeader>

        {qosMsg && (
          <div
            className={`flex items-center gap-2 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${qosMsg.type === 'success' ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
              }`}
          >
            {qosMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            )}
            <span>{qosMsg.text}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <select
                value={qosData.speed_limit}
                onChange={(e) => setQosData({ ...qosData, speed_limit: e.target.value })}
                className="w-full bg-white dark:bg-[#1c241f] border-2 border-black rounded-xl px-3 py-2.5 text-xs text-black dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-black shadow-neo-sm"
              >
                <option value="25mbps">⚡ 25 Mbps Down / 10 Mbps Up (Recommended for 15+ Clients)</option>
                <option value="50mbps">🚀 50 Mbps Down / 20 Mbps Up (Medium Traffic Hotspot)</option>
                <option value="100mbps">💥 100 Mbps Down / 50 Mbps Up (High Speed Fiber)</option>
                <option value="unlimited">🌐 Unlimited (No Hardware Throttling)</option>
                <option value="custom">⚙️ Custom Manual Limit...</option>
              </select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyQoS}
              isLoading={isApplyingQoS}
              className="gap-1.5 px-4 font-black text-xs shrink-0 shadow-neo-sm"
              title="Apply bandwidth limits to router without full page save"
            >
              <Zap className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
              <span>Apply to Router Now</span>
            </Button>
          </div>

          {qosData.speed_limit === 'custom' && (
            <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] grid grid-cols-1 sm:grid-cols-2 gap-3 shadow-neo-sm">
              <div>
                <label className="block text-xs font-black text-black dark:text-white mb-1">
                  Custom Download Limit (Mbps)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={qosData.custom_down_mbps}
                  onChange={(e) => setQosData({ ...qosData, custom_down_mbps: e.target.value })}
                  placeholder="e.g. 25"
                  required
                />
                <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                  Download speed cap per client
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-black dark:text-white mb-1">
                  Custom Upload Limit (Mbps)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={qosData.custom_up_mbps}
                  onChange={(e) => setQosData({ ...qosData, custom_up_mbps: e.target.value })}
                  placeholder="e.g. 10"
                  required
                />
                <p className="mt-1 text-[10px] font-bold text-neutral-600 dark:text-[#b7c6c2]">
                  Upload speed cap per client
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ======================================================== */}
      {/* CARD 3: OPENWRT WI-FI MANAGEMENT & WIRELESS RADIOS       */}
      {/* ======================================================== */}
      <Card className="border-2 border-black dark:border-[#4a6052] shadow-neo space-y-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7dd3fc] text-black border-2 border-black shadow-neo-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <CardTitle>OpenWrt Wi-Fi Management</CardTitle>
              <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">
                Live wireless status, broadcasted SSIDs, and radio channels
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="cyan" className="gap-1.5 py-1 text-xs">
              <Wifi className="w-3.5 h-3.5" />
              <span>{totalStations} Wireless {totalStations === 1 ? 'Station' : 'Stations'}</span>
            </Badge>

            {paidUsersCount > 0 && (
              <Badge variant="success" className="gap-1.5 py-1 text-xs hidden sm:inline-flex">
                <Users className="w-3.5 h-3.5" />
                <span>{paidUsersCount} Paid Online</span>
              </Badge>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={refreshAllWifi}
              disabled={isValidatingWifi}
              className="h-8 w-8 p-0"
              title="Refresh Router Wi-Fi Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidatingWifi ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>

        {wifiMsg && (
          <div
            className={`flex items-center gap-2 p-3 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold ${wifiMsg.type === 'success' ? 'bg-[#4ade80] text-black' : 'bg-[#ff5f57] text-black'
              }`}
          >
            {wifiMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-black" />
            )}
            <span>{wifiMsg.text}</span>
          </div>
        )}

        {/* Connected Clients & Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-xs">
            <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2] mb-1 font-bold">
              <span>2.4GHz Stations</span>
              <Wifi className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-black text-black dark:text-[#ffe17c] font-display text-xl">{routerStats?.clients2g ?? 0}</span>
              <span className="text-[11px] font-bold text-neutral-500">active</span>
            </div>
            <span className="text-[10px] text-neutral-600 dark:text-neutral-400 font-mono font-bold truncate block mt-0.5" title={wifiConfig?.ssid2g || '2.4GHz'}>
              {wifiConfig?.ssid2g || '2.4GHz Radio'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-xs">
            <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2] mb-1 font-bold">
              <span>5GHz Stations</span>
              <Wifi className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-black text-black dark:text-[#ffe17c] font-display text-xl">{routerStats?.clients5g ?? 0}</span>
              <span className="text-[11px] font-bold text-neutral-500">active</span>
            </div>
            <span className="text-[10px] text-neutral-600 dark:text-neutral-400 font-mono font-bold truncate block mt-0.5" title={wifiConfig?.ssid5g || '5GHz'}>
              {wifiConfig?.ssid5g || '5GHz Radio'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-xs">
            <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2] mb-1 font-bold">
              <span>Paid Users</span>
              <Users className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-black text-black dark:text-[#4ade80] font-display text-xl">{paidUsersCount}</span>
              <span className="text-[11px] font-bold text-neutral-500">online</span>
            </div>
            <span className="text-[10px] text-neutral-600 dark:text-neutral-400 font-bold block mt-0.5">
              Active time / VIP
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm text-xs">
            <div className="flex items-center justify-between text-neutral-600 dark:text-[#b7c6c2] mb-1 font-bold">
              <span>DHCP Leases</span>
              <Smartphone className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-black text-black dark:text-[#c084fc] font-display text-xl">{routerStats?.dhcpLeasesCount ?? 0}</span>
              <span className="text-[11px] font-bold text-neutral-500">assigned</span>
            </div>
            <span className="text-[10px] text-neutral-600 dark:text-neutral-400 font-bold block mt-0.5">
              IP Pool Leases
            </span>
          </div>
        </div>

        {/* Connected Clients Live Table */}
        <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm space-y-2.5">
          <div className="flex items-center justify-between text-xs font-black text-black dark:text-white">
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-black dark:text-[#ffe17c]" />
              Live Connected Wi-Fi Stations ({connectedClients.length})
            </span>
            <span className="text-[11px] text-neutral-600 dark:text-[#b7c6c2] font-semibold">Real-time OpenWrt Radios</span>
          </div>

          {connectedClients.length === 0 ? (
            <div className="py-5 text-center text-xs text-neutral-600 dark:text-neutral-400">
              <Wifi className="w-6 h-6 mx-auto mb-2 opacity-50 animate-pulse" />
              <p className="font-bold text-black dark:text-white">No wireless clients currently connected</p>
              <p className="text-[11px] text-neutral-500 mt-1 max-w-md mx-auto">
                When phones or laptops associate with{' '}
                <span className="font-mono font-bold text-black dark:text-[#ffe17c]">{wifiConfig?.ssid2g || '2.4GHz'}</span> or{' '}
                <span className="font-mono font-bold text-black dark:text-[#ffe17c]">{wifiConfig?.ssid5g || '5GHz'}</span>,
                their signal dBm, connection speed, and captive portal status will stream here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10 max-h-56 overflow-y-auto pr-1">
              {connectedClients.map((client: any) => (
                <div key={client.mac} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-black dark:text-white">{client.hostname || 'Wi-Fi Device'}</span>
                      <Badge
                        variant={client.band === '5GHz' ? 'info' : 'warning'}
                        className="text-[9px] py-0 px-1.5 font-mono font-bold"
                      >
                        {client.band || 'Wi-Fi'}
                      </Badge>
                      {client.isVip ? (
                        <Badge variant="purple" className="text-[9px] py-0 px-1.5">
                          VIP
                        </Badge>
                      ) : client.isAuthorized ? (
                        <Badge variant="success" className="text-[9px] py-0 px-1.5">
                          Online
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-black dark:text-white">
                          Guest / Portal
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-600 dark:text-[#b7c6c2] font-mono font-bold">
                      <span>{client.ip || 'No IP yet'}</span>
                      <span>•</span>
                      <span className="text-black dark:text-[#ffe17c]">{client.mac}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    {client.signalDbm !== undefined && (
                      <span
                        className={`text-xs font-mono font-bold flex items-center justify-end gap-1 ${client.signalDbm >= -60
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : client.signalDbm >= -75
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                      >
                        <Signal className="w-3 h-3" />
                        {client.signalDbm} dBm
                      </span>
                    )}
                    {client.rxRateMbps ? (
                      <span className="block text-[10px] text-neutral-500 dark:text-neutral-400 font-mono font-bold">
                        {Math.round(client.rxRateMbps)} Mbps
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSaveWifi} className="space-y-4">
          {/* Unified Dual-Band SSID Switch Card */}
          <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-black dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-black dark:text-[#ffe17c]" />
                  Unified Dual-Band SSID (Single Network Name)
                </span>
                {isUnifiedSsid ? (
                  <Badge variant="success" className="text-[10px] py-0">Unified (Seamless Roaming)</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] py-0">Split SSIDs (2.4G & 5G)</Badge>
                )}
              </div>
              <p className="text-[11px] text-neutral-600 dark:text-[#b7c6c2] font-semibold leading-relaxed">
                Broadcasts the same Wi-Fi name on both 2.4GHz & 5GHz radios. Phones automatically roam to the fastest band without regenerating differing randomized MAC addresses.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextUnified = !isUnifiedSsid;
                setIsUnifiedSsid(nextUnified);
                setIsDirty(true);
                if (nextUnified) {
                  setSsid5g(ssid2g);
                }
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-black shadow-neo-sm transition-colors duration-200 ease-in-out focus:outline-none ${isUnifiedSsid ? 'bg-[#4ade80]' : 'bg-neutral-300 dark:bg-neutral-700'
                }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white border border-black shadow-sm ring-0 transition duration-200 ease-in-out ${isUnifiedSsid ? 'translate-x-5' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>

          {isUnifiedSsid ? (
            /* Unified Single SSID View */
            <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-black dark:text-white flex items-center gap-1.5">
                    <Wifi className="w-4 h-4" />
                    Unified Wi-Fi Network (2.4GHz + 5GHz Combined)
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0">
                    Open (Captive Portal)
                  </Badge>
                </div>

                {/* Live Broadcasted Unified SSID Pill */}
                <div className="flex items-center gap-1.5 text-xs bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm px-2.5 py-1 rounded-lg font-black">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
                  </span>
                  <span className="text-[11px] font-bold">Broadcasting:</span>
                  <span className="font-mono font-black text-xs">
                    {wifiConfig?.ssid2g || 'Fetching...'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-black dark:text-white">Unified SSID Name</label>
                    {wifiConfig?.ssid2g && ssid2g !== wifiConfig.ssid2g && (
                      <button
                        type="button"
                        onClick={() => {
                          setSsid2g(wifiConfig.ssid2g);
                          setSsid5g(wifiConfig.ssid2g);
                          setIsDirty(false);
                        }}
                        className="text-[10px] text-neutral-600 dark:text-[#ffe17c] font-bold underline cursor-pointer"
                      >
                        Reset to broadcasted ({wifiConfig.ssid2g})
                      </button>
                    )}
                  </div>
                  <Input
                    value={ssid2g}
                    onChange={(e) => {
                      setSsid2g(e.target.value);
                      setSsid5g(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder={wifiConfig?.ssid2g || 'e.g. OpenPisoWifi'}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-bold text-black dark:text-white mb-1 block flex items-center gap-1">
                      <Radio className="w-3.5 h-3.5 text-amber-500" />
                      2.4GHz Channel (Long Range)
                    </label>
                    <select
                      value={channel2g}
                      onChange={(e) => {
                        setChannel2g(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                    >
                      <option value="auto">Auto</option>
                      <option value="1">Channel 1 (2412 MHz)</option>
                      <option value="6">Channel 6 (2437 MHz - Recommended)</option>
                      <option value="11">Channel 11 (2462 MHz)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-black dark:text-white mb-1 block flex items-center gap-1">
                      <Radio className="w-3.5 h-3.5 text-blue-500" />
                      5GHz Channel (High Speed)
                    </label>
                    <select
                      value={channel5g}
                      onChange={(e) => {
                        setChannel5g(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                    >
                      <option value="auto">Auto</option>
                      <option value="36">Channel 36 (5180 MHz - Recommended)</option>
                      <option value="40">Channel 40 (5200 MHz)</option>
                      <option value="44">Channel 44 (5220 MHz)</option>
                      <option value="48">Channel 48 (5240 MHz)</option>
                      <option value="149">Channel 149 (5745 MHz)</option>
                      <option value="153">Channel 153 (5765 MHz)</option>
                      <option value="157">Channel 157 (5785 MHz)</option>
                      <option value="161">Channel 161 (5805 MHz)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Split SSIDs View (Independent 2.4GHz & 5GHz) */
            <>
              {/* 2.4GHz Wi-Fi settings */}
              <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-black dark:text-white flex items-center gap-1.5">
                      <Wifi className="w-4 h-4 text-amber-500" />
                      2.4GHz Wi-Fi Radio (Long Range)
                    </span>
                    <Badge variant="warning" className="text-[10px] py-0">
                      Channel {wifiConfig?.channel2g || channel2g}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {wifiConfig?.encryption2g === 'none' ? 'Open (Captive Portal)' : wifiConfig?.encryption2g || 'Open'}
                    </Badge>
                  </div>

                  {/* Live Broadcasted SSID Pill */}
                  <div className="flex items-center gap-1.5 text-xs bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm px-2.5 py-1 rounded-lg font-black">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
                    </span>
                    <span className="text-[11px] font-bold">Broadcasting:</span>
                    <span className="font-mono font-black text-xs">
                      {wifiConfig?.ssid2g || 'Fetching...'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-black dark:text-white">SSID Name</label>
                      {wifiConfig?.ssid2g && ssid2g !== wifiConfig.ssid2g && (
                        <button
                          type="button"
                          onClick={() => {
                            setSsid2g(wifiConfig.ssid2g);
                            setIsDirty(false);
                          }}
                          className="text-[10px] text-neutral-600 dark:text-[#ffe17c] font-bold underline cursor-pointer"
                        >
                          Reset to broadcasted ({wifiConfig.ssid2g})
                        </button>
                      )}
                    </div>
                    <Input
                      value={ssid2g}
                      onChange={(e) => {
                        setSsid2g(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder={wifiConfig?.ssid2g || 'e.g. OpenPisoWifi'}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-black dark:text-white mb-1 block">Channel</label>
                    <select
                      value={channel2g}
                      onChange={(e) => {
                        setChannel2g(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                    >
                      <option value="auto">Auto</option>
                      <option value="1">Channel 1 (2412 MHz)</option>
                      <option value="6">Channel 6 (2437 MHz - Recommended)</option>
                      <option value="11">Channel 11 (2462 MHz)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 5GHz Wi-Fi settings */}
              <div className="p-3.5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] shadow-neo-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-black dark:text-white flex items-center gap-1.5">
                      <Wifi className="w-4 h-4 text-blue-500" />
                      5GHz Wi-Fi Radio (High Speed)
                    </span>
                    <Badge variant="info" className="text-[10px] py-0">
                      Channel {wifiConfig?.channel5g || channel5g}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {wifiConfig?.encryption5g === 'none' ? 'Open (Captive Portal)' : wifiConfig?.encryption5g || 'Open'}
                    </Badge>
                  </div>

                  {/* Live Broadcasted SSID Pill */}
                  <div className="flex items-center gap-1.5 text-xs bg-[#7dd3fc] text-black border-2 border-black shadow-neo-sm px-2.5 py-1 rounded-lg font-black">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
                    </span>
                    <span className="text-[11px] font-bold">Broadcasting:</span>
                    <span className="font-mono font-black text-xs">
                      {wifiConfig?.ssid5g || 'Fetching...'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-black dark:text-white">SSID Name</label>
                      {wifiConfig?.ssid5g && ssid5g !== wifiConfig.ssid5g && (
                        <button
                          type="button"
                          onClick={() => {
                            setSsid5g(wifiConfig.ssid5g);
                            setIsDirty(false);
                          }}
                          className="text-[10px] text-neutral-600 dark:text-[#ffe17c] font-bold underline cursor-pointer"
                        >
                          Reset to broadcasted ({wifiConfig.ssid5g})
                        </button>
                      )}
                    </div>
                    <Input
                      value={ssid5g}
                      onChange={(e) => {
                        setSsid5g(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder={wifiConfig?.ssid5g || 'e.g. OpenPisoWifi_5G'}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-black dark:text-white mb-1 block">Channel</label>
                    <select
                      value={channel5g}
                      onChange={(e) => {
                        setChannel5g(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
                    >
                      <option value="auto">Auto</option>
                      <option value="36">Channel 36 (5180 MHz - Recommended)</option>
                      <option value="40">Channel 40 (5200 MHz)</option>
                      <option value="44">Channel 44 (5220 MHz)</option>
                      <option value="48">Channel 48 (5240 MHz)</option>
                      <option value="149">Channel 149 (5745 MHz)</option>
                      <option value="153">Channel 153 (5765 MHz)</option>
                      <option value="157">Channel 157 (5785 MHz)</option>
                      <option value="161">Channel 161 (5805 MHz)</option>
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Wi-Fi Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleRebootRouter}
              isLoading={isRebooting}
            >
              <Power className="w-3.5 h-3.5 mr-1.5" />
              <span>Reboot OpenWrt Router</span>
            </Button>

            <Button type="submit" variant="primary" isLoading={isSavingWifi} className="gap-1.5 shadow-neo">
              <Save className="w-4 h-4" />
              <span>Apply & Broadcast Wi-Fi</span>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
