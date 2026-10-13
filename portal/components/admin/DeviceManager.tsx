'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Shield,
  Crown,
  Ban,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Smartphone,
  Wifi,
  Search,
  ChevronDown,
  ChevronUp,
  Radio,
  Signal,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function DeviceManager() {
  const { data, mutate, isValidating: isDevicesLoading } = useSWR('/api/admin/devices', fetcher);
  const { data: syncStatusData, mutate: mutateSyncStatus } = useSWR('/api/admin/devices/sync', fetcher, {
    refreshInterval: 6000,
  });
  const {
    data: clientsData,
    mutate: mutateClients,
    isValidating: isClientsLoading,
  } = useSWR('/api/admin/router/clients', fetcher, {
    refreshInterval: 6000,
  });

  const devices: any[] = data?.devices || [];
  const detectedClients: any[] = clientsData?.clients || [];
  const routerWhitelist: string[] = syncStatusData?.routerStatus?.whitelist || [];
  const routerBlacklist: string[] = syncStatusData?.routerStatus?.blacklist || [];

  // Filtering & UI State
  const [filter, setFilter] = useState<'ALL' | 'WHITELIST' | 'BLACKLIST' | 'ONLINE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetectedStrip, setShowDetectedStrip] = useState(true);

  // Form State
  const [entryMode, setEntryMode] = useState<'SELECT' | 'CUSTOM'>('SELECT');
  const [selectedClientMac, setSelectedClientMac] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'WHITELIST' | 'BLACKLIST'>('WHITELIST');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fast Lookup Maps
  const rulesMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of devices) {
      map.set(d.macAddress.toLowerCase(), d);
    }
    return map;
  }, [devices]);

  const clientsMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of detectedClients) {
      map.set(c.mac.toLowerCase(), c);
    }
    return map;
  }, [detectedClients]);

  // Handle selecting a device from detected clients
  const handleSelectClient = (mac: string) => {
    setSelectedClientMac(mac);
    setMacAddress(mac);

    const client = clientsMap.get(mac.toLowerCase());
    if (client) {
      const existing = rulesMap.get(mac.toLowerCase());
      if (existing) {
        setName(existing.name);
        setType(existing.type);
        setNotes(existing.notes || '');
      } else {
        const cleanHost = (client.hostname || '')
          .replace(/^Mobile Device \(Private MAC\)$/i, '')
          .replace(/^Ethernet \/ LAN Device$/i, '')
          .trim();
        setName(cleanHost || (client.ip ? `Device (${client.ip})` : 'Wi-Fi Device'));
      }
    }
  };

  // Quick 1-click action from detected cards
  const handleQuickAdd = (client: any, targetType: 'WHITELIST' | 'BLACKLIST') => {
    setSelectedClientMac(client.mac);
    setMacAddress(client.mac);
    setType(targetType);
    setEntryMode('SELECT');

    const existing = rulesMap.get(client.mac.toLowerCase());
    if (existing) {
      setName(existing.name);
      setNotes(existing.notes || '');
    } else {
      const cleanHost = (client.hostname || '')
        .replace(/^Mobile Device \(Private MAC\)$/i, '')
        .replace(/^Ethernet \/ LAN Device$/i, '')
        .trim();
      setName(cleanHost || (client.ip ? `Device (${client.ip})` : 'Wi-Fi Device'));
      setNotes(targetType === 'WHITELIST' ? 'VIP access' : 'Restricted client');
    }

    setShowAddModal(true);
  };

  const handleSyncToRouter = async () => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/devices/sync', { method: 'POST' });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to sync to OpenWrt');
      setStatusMsg({ type: 'success', text: resData.message || 'All device rules synced to OpenWrt!' });
      mutate();
      mutateSyncStatus();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error syncing rules' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMsg(null);

    let cleanMac = macAddress.trim();
    // Normalize format if user entered without colons: AABBCCDDEEFF -> AA:BB:CC:DD:EE:FF
    if (/^[0-9a-fA-F]{12}$/.test(cleanMac)) {
      cleanMac = cleanMac.match(/.{1,2}/g)?.join(':') || cleanMac;
    }

    if (!cleanMac || cleanMac.length < 11) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF)' });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          macAddress: cleanMac,
          name: name.trim() || 'Device',
          type,
          notes: notes.trim(),
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to add device rule');
      }

      setStatusMsg({
        type: 'success',
        text: resData.message || 'Device rule saved and applied to OpenWrt!',
      });
      setShowAddModal(false);
      setMacAddress('');
      setSelectedClientMac('');
      setName('');
      setNotes('');
      mutate();
      mutateSyncStatus();
      mutateClients();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error saving rule' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDevice = async (id: string, mac: string) => {
    if (!confirm(`Delete rule for ${mac}?`)) return;

    try {
      const res = await fetch(`/api/admin/devices?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete rule');
      mutate();
      mutateSyncStatus();
      mutateClients();
    } catch (err: any) {
      alert(err.message || 'Error deleting rule');
    }
  };

  // Filter & Search rules
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const macLower = d.macAddress.toLowerCase();
      const isOnline = clientsMap.has(macLower);

      if (filter === 'WHITELIST' && d.type !== 'WHITELIST') return false;
      if (filter === 'BLACKLIST' && d.type !== 'BLACKLIST') return false;
      if (filter === 'ONLINE' && !isOnline) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = d.name?.toLowerCase().includes(q);
        const matchesMac = d.macAddress.toLowerCase().includes(q);
        const matchesNotes = d.notes?.toLowerCase().includes(q);
        const matchesIp = clientsMap.get(macLower)?.ip?.includes(q);
        return matchesName || matchesMac || matchesNotes || matchesIp;
      }

      return true;
    });
  }, [devices, filter, searchQuery, clientsMap]);

  const onlineCount = useMemo(() => {
    return devices.filter((d) => clientsMap.has(d.macAddress.toLowerCase())).length;
  }, [devices, clientsMap]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>VIP Whitelist & Blacklisted Devices</CardTitle>
            <p className="text-xs text-neutral-600 dark:text-[#b7c6c2] font-semibold">Manage permanent access or ban troublesome devices</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncToRouter}
            isLoading={isSyncing}
            className="text-xs font-bold gap-1.5 shadow-neo-sm"
            title="Sync all DB rules into OpenWrt firewall table"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync to OpenWrt</span>
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEntryMode(detectedClients.length > 0 ? 'SELECT' : 'CUSTOM');
              setShowAddModal(true);
            }}
            className="gap-1.5 shadow-neo-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Device Rule</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              mutate();
              mutateSyncStatus();
              mutateClients();
            }}
            disabled={isDevicesLoading || isClientsLoading}
            className="h-8 w-8 p-0 shadow-neo-sm"
            title="Refresh Rules and Network Clients"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDevicesLoading || isClientsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      {statusMsg && (
        <div
          className={`mb-4 flex items-center gap-2.5 p-3.5 rounded-xl border-2 border-black shadow-neo-sm text-xs font-bold text-black ${
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

      {/* Live Detected Devices Strip */}
      <div className="mb-5 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] p-3.5 space-y-3 shadow-neo-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm">
              <Radio className="w-3.5 h-3.5" />
            </span>
            <div>
              <h4 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 font-display">
                Live Detected Devices on Network ({detectedClients.length})
              </h4>
              <p className="text-[11px] font-semibold text-neutral-600 dark:text-[#b7c6c2]">
                Click &quot;+ VIP&quot; or &quot;🚫 Ban&quot; on any detected device to add it with one click
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => mutateClients()}
              disabled={isClientsLoading}
              className="h-7 px-2.5 text-[11px] font-bold shadow-neo-sm"
              title="Refresh detected clients from OpenWrt"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isClientsLoading ? 'animate-spin' : ''}`} />
              Scan
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetectedStrip(!showDetectedStrip)}
              className="h-7 w-7 p-0 shadow-neo-sm"
              title={showDetectedStrip ? 'Collapse live devices' : 'Expand live devices'}
            >
              {showDetectedStrip ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {showDetectedStrip && (
          <div className="pt-1">
            {detectedClients.length === 0 ? (
              <div className="py-4 text-center text-xs font-bold text-neutral-500 dark:text-[#b7c6c2]">
                No active wireless or DHCP clients detected right now. When devices connect, they will appear here.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {detectedClients.map((client) => {
                  const rule = rulesMap.get(client.mac.toLowerCase());
                  const isVip = rule?.type === 'WHITELIST';
                  const isBanned = rule?.type === 'BLACKLIST';

                  return (
                    <div
                      key={client.mac}
                      className={`p-3 rounded-xl border-2 border-black dark:border-[#4a6052] shadow-neo-sm flex flex-col justify-between gap-2.5 transition ${
                        isVip
                          ? 'bg-[#f3e8ff] dark:bg-[#2e1065]/40 text-black dark:text-white'
                          : isBanned
                          ? 'bg-[#ffe4e6] dark:bg-[#4c0519]/40 text-black dark:text-white'
                          : 'bg-white dark:bg-[#1c241f] text-black dark:text-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-extrabold text-black dark:text-white text-xs truncate" title={client.hostname || 'Device'}>
                            {rule?.name || client.hostname || 'Network Client'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge
                              variant={client.band === '5GHz' ? 'info' : client.band === '2.4GHz' ? 'warning' : 'outline'}
                              className="text-[9px] py-0 px-1 font-mono font-bold"
                            >
                              {client.band || 'LAN'}
                            </Badge>
                            {isVip && (
                              <Badge variant="purple" className="text-[9px] py-0 px-1 font-black">
                                👑 VIP
                              </Badge>
                            )}
                            {isBanned && (
                              <Badge variant="danger" className="text-[9px] py-0 px-1 font-black">
                                🚫 Banned
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-neutral-600 dark:text-neutral-300">
                          <span>{client.ip || 'No IP'}</span>
                          {client.signalDbm !== undefined && (
                            <span
                              className={`flex items-center gap-0.5 ${
                                client.signalDbm >= -65 ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              <Signal className="w-2.5 h-2.5" />
                              {client.signalDbm} dBm
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-400 truncate">{client.mac}</div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t-2 border-black/10 dark:border-white/10">
                        {isVip ? (
                          <span className="text-[11px] text-purple-700 dark:text-purple-300 font-extrabold">Free Access Active</span>
                        ) : isBanned ? (
                          <span className="text-[11px] text-rose-700 dark:text-rose-300 font-extrabold">Internet Blocked</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleQuickAdd(client, 'WHITELIST')}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-[#e9d5ff] text-purple-900 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition flex items-center gap-1 cursor-pointer"
                            >
                              <Crown className="w-3 h-3" />
                              + VIP
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAdd(client, 'BLACKLIST')}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-[#fecdd3] text-rose-900 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition flex items-center gap-1 cursor-pointer"
                            >
                              <Ban className="w-3 h-3" />
                              🚫 Ban
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Device Rule Form Modal */}
      {showAddModal && (
        <form onSubmit={handleAddDevice} className="p-4 rounded-xl bg-white dark:bg-[#1c241f] border-2 border-black dark:border-[#4a6052] shadow-neo space-y-3.5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b-2 border-black/10 dark:border-white/10">
            <h4 className="text-xs font-black uppercase text-black dark:text-white flex items-center gap-1.5 font-display">
              <Plus className="w-4 h-4 text-black dark:text-[#ffe17c]" />
              Add Device Whitelist or Blacklist Rule
            </h4>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-[#f8f6ee] dark:bg-[#111713] p-1 rounded-xl border-2 border-black dark:border-[#4a6052] text-[11px] shadow-neo-sm">
              <button
                type="button"
                onClick={() => setEntryMode('SELECT')}
                className={`px-2.5 py-1 rounded-lg transition font-bold ${
                  entryMode === 'SELECT'
                    ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm font-black'
                    : 'text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white'
                }`}
              >
                ⚡ Select Detected Device ({detectedClients.length})
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('CUSTOM')}
                className={`px-2.5 py-1 rounded-lg transition font-bold ${
                  entryMode === 'CUSTOM'
                    ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm font-black'
                    : 'text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white'
                }`}
              >
                ✏️ Custom MAC Address
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Rule Type */}
            <div>
              <label className="text-xs font-extrabold text-black dark:text-white mb-1 block">Rule Type</label>
              <select
                value={type}
                onChange={(e: any) => setType(e.target.value)}
                className="w-full bg-white dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
              >
                <option value="WHITELIST">👑 VIP Whitelist (Free Permanent Internet)</option>
                <option value="BLACKLIST">🚫 Blacklist (Block from Internet)</option>
              </select>
            </div>

            {/* In SELECT mode: Device Dropdown */}
            {entryMode === 'SELECT' ? (
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-extrabold text-black dark:text-white">Select Connected Device</label>
                  <button
                    type="button"
                    onClick={() => setEntryMode('CUSTOM')}
                    className="text-[11px] font-bold text-neutral-600 dark:text-[#ffe17c] hover:underline cursor-pointer"
                  >
                    Device not in list? Enter MAC manually
                  </button>
                </div>
                <select
                  value={selectedClientMac}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full bg-white dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] rounded-xl px-3 py-2 text-xs text-black dark:text-white font-bold focus:outline-none focus:bg-[#fffde6] shadow-neo-sm font-mono"
                  required={entryMode === 'SELECT'}
                >
                  <option value="">-- Choose a live device from network ({detectedClients.length} found) --</option>
                  {detectedClients.map((client) => {
                    const rule = rulesMap.get(client.mac.toLowerCase());
                    const labelRule = rule ? ` [Already ${rule.type === 'WHITELIST' ? 'VIP' : 'BANNED'}]` : '';
                    return (
                      <option key={client.mac} value={client.mac}>
                        {client.hostname || 'Device'} • {client.ip || 'DHCP'} • {client.mac} ({client.band || 'Wi-Fi'}){labelRule}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-extrabold text-black dark:text-white">Device MAC Address</label>
                  <button
                    type="button"
                    onClick={() => setEntryMode('SELECT')}
                    className="text-[11px] font-bold text-neutral-600 dark:text-[#ffe17c] hover:underline cursor-pointer"
                  >
                    Pick from live devices
                  </button>
                </div>
                <Input
                  value={macAddress}
                  onChange={(e) => setMacAddress(e.target.value.toUpperCase())}
                  placeholder="e.g. 8E:D9:1A:12:CB:8E"
                  required
                />
                <p className="mt-1 text-[10px] font-bold text-neutral-500">12-hex pairs, e.g. 00:1A:2B:3C:4D:5E</p>
              </div>
            )}

            {/* In CUSTOM mode: Device Name */}
            {entryMode === 'CUSTOM' && (
              <div>
                <label className="text-xs font-extrabold text-black dark:text-white mb-1 block">Device Name / Owner</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Owner iPhone 15 Pro"
                  required
                />
              </div>
            )}
          </div>

          {/* In SELECT mode: Name & Selected Card */}
          {entryMode === 'SELECT' && selectedClientMac && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-extrabold text-black dark:text-white mb-1 block">Device Name / Label</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Nico iPhone, Store Tablet, etc."
                  required
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-black dark:text-white mb-1 block">Selected Device Details</label>
                <div className="h-10 px-3 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] flex items-center justify-between text-xs font-mono font-bold shadow-neo-sm">
                  <span className="text-black dark:text-[#ffe17c]">{selectedClientMac}</span>
                  <span className="text-neutral-600 dark:text-[#b7c6c2] text-[11px]">
                    {clientsMap.get(selectedClientMac.toLowerCase())?.ip || 'IP Assigned'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-extrabold text-black dark:text-white mb-1 block">Notes (Optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Personal device, family member, bypass paywall"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddModal(false);
                setSelectedClientMac('');
                setMacAddress('');
                setName('');
                setNotes('');
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              className="font-extrabold shadow-neo-sm"
            >
              Save & Apply Rule
            </Button>
          </div>
        </form>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b-2 border-black/10 dark:border-white/10 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              filter === 'ALL'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white border-2 border-transparent hover:border-black/20'
            }`}
          >
            All Rules ({devices.length})
          </button>
          <button
            onClick={() => setFilter('WHITELIST')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              filter === 'WHITELIST'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white border-2 border-transparent hover:border-black/20'
            }`}
          >
            👑 VIP ({devices.filter((d) => d.type === 'WHITELIST').length})
          </button>
          <button
            onClick={() => setFilter('BLACKLIST')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              filter === 'BLACKLIST'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white border-2 border-transparent hover:border-black/20'
            }`}
          >
            🚫 Blacklist ({devices.filter((d) => d.type === 'BLACKLIST').length})
          </button>
          <button
            onClick={() => setFilter('ONLINE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              filter === 'ONLINE'
                ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                : 'text-neutral-600 dark:text-[#b7c6c2] hover:text-black dark:hover:text-white border-2 border-transparent hover:border-black/20'
            }`}
          >
            📶 Online Now ({onlineCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px] sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rules, name, MAC..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-white dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] text-xs text-black dark:text-white font-bold placeholder:text-neutral-400 focus:outline-none focus:bg-[#fffde6] shadow-neo-sm"
          />
        </div>
      </div>

      {/* Rules Table */}
      {filteredDevices.length === 0 ? (
        <div className="p-8 rounded-xl bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] text-center text-xs font-bold text-neutral-500 dark:text-[#b7c6c2] shadow-neo-sm">
          No device rules match your filter or search query. Click &quot;Add Device Rule&quot; to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-black dark:border-[#4a6052] shadow-neo-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#ffe17c] text-black uppercase text-[10px] font-black tracking-wider border-b-2 border-black">
              <tr>
                <th className="p-3">Type</th>
                <th className="p-3">Device Name</th>
                <th className="p-3">MAC Address</th>
                <th className="p-3">Network Status</th>
                <th className="p-3">OpenWrt Firewall</th>
                <th className="p-3">Notes</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
              {filteredDevices.map((dev) => {
                const macLower = dev.macAddress.toLowerCase();
                const client = clientsMap.get(macLower);
                const isOnline = !!client;
                const isSyncedToRouter =
                  dev.type === 'WHITELIST'
                    ? routerWhitelist.includes(macLower)
                    : routerBlacklist.includes(macLower);

                return (
                  <tr key={dev.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium">
                    <td className="p-3">
                      {dev.type === 'WHITELIST' ? (
                        <Badge variant="purple" className="gap-1 font-black">
                          <Crown className="w-3 h-3" />
                          VIP
                        </Badge>
                      ) : (
                        <Badge variant="danger" className="gap-1 font-black">
                          <Ban className="w-3 h-3" />
                          BANNED
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 font-extrabold text-black dark:text-white">
                      <div className="flex items-center gap-1.5">
                        {client?.band === 'LAN' ? (
                          <Laptop className="w-3.5 h-3.5 text-neutral-600 dark:text-[#b7c6c2]" />
                        ) : (
                          <Smartphone className="w-3.5 h-3.5 text-neutral-600 dark:text-[#b7c6c2]" />
                        )}
                        <span>{dev.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-black dark:text-[#ffe17c] font-black">{dev.macAddress}</td>
                    <td className="p-3">
                      {isOnline ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Online ({client.band || 'Wi-Fi'})
                          </span>
                          <span className="block text-[10px] text-neutral-500 dark:text-neutral-400 font-mono font-bold">
                            {client.ip || 'DHCP'} {client.signalDbm ? `• ${client.signalDbm} dBm` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                          Offline / Saved
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {isSyncedToRouter ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active on Router
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Sync Pending
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-300 text-[11px] font-bold truncate max-w-xs">{dev.notes || '—'}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteDevice(dev.id, dev.macAddress)}
                        className="h-7 w-7 p-0 shadow-neo-sm"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
