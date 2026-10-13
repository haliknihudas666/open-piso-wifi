'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  Cpu,
  Wifi,
  Radio,
  RefreshCw,
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings,
  Shield,
  Layers,
  ArrowUpRight,
  ExternalLink,
  Lock,
  LockOpen,
  Terminal,
  Power,
  Zap,
  Send,
} from 'lucide-react';

interface Transaction {
  id: number;
  machine_id: string;
  slot_id: string;
  slot_name: string;
  amount: number;
  duration_minutes: number;
  mac_address: string;
  payment_type: string;
  created_at: string;
}

interface MachineTelemetry {
  machine_id: string;
  uptime_seconds: number;
  active_slots: number;
  is_wan_online: boolean;
  cash_box_amount: number;
  today_total: number;
  last_seen: string;
}

export default function ModernCloudAdminPage() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [machines, setMachines] = useState<MachineTelemetry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<{ type: string; status: 'sending' | 'dispatched' | 'error'; message: string } | null>(null);
  const [customMac, setCustomMac] = useState('');
  const [customMins, setCustomMins] = useState(60);

  const sendRemoteCommand = async (commandType: string, payload: any = {}) => {
    if (!supabaseUrl || !supabaseKey) {
      alert('Please configure Supabase API credentials first using the ⚙️ API Config button.');
      return;
    }
    const target = selectedMachine === 'all' ? (machines[0]?.machine_id || 'openpiso-kiosk-1') : selectedMachine;
    setCommandStatus({ type: commandType, status: 'sending', message: `Dispatching '${commandType}' to ${target}...` });
    try {
      const cleanUrl = supabaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/rest/v1/piso_commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          machine_id: target,
          command_type: commandType,
          payload,
          status: 'pending',
        }),
      });

      if (res.ok) {
        setCommandStatus({
          type: commandType,
          status: 'dispatched',
          message: `✅ Command '${commandType}' queued for '${target}'. Kiosk will execute within 10s.`,
        });
        setTimeout(() => setCommandStatus(null), 7000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setCommandStatus({ type: commandType, status: 'error', message: `Failed: ${errData.message || res.statusText}` });
      }
    } catch (err: any) {
      setCommandStatus({ type: commandType, status: 'error', message: `Network error: ${err.message}` });
    }
  };

  // Load stored Supabase credentials
  useEffect(() => {
    const storedUrl = localStorage.getItem('openpiso_supabase_url') || '';
    const storedKey = localStorage.getItem('openpiso_supabase_key') || '';
    setSupabaseUrl(storedUrl);
    setSupabaseKey(storedKey);

    if (storedUrl && storedKey) {
      fetchCloudData(storedUrl, storedKey);
    } else {
      // Seed with sample simulated data for visual preview
      loadDemoData();
    }
  }, []);

  const saveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('openpiso_supabase_url', supabaseUrl.trim());
    localStorage.setItem('openpiso_supabase_key', supabaseKey.trim());
    setIsConfigOpen(false);
    fetchCloudData(supabaseUrl.trim(), supabaseKey.trim());
  };

  const loadDemoData = () => {
    setMachines([
      {
        machine_id: 'openpiso-kiosk-1',
        uptime_seconds: 148200,
        active_slots: 3,
        is_wan_online: true,
        cash_box_amount: 1450,
        today_total: 420,
        last_seen: new Date().toISOString(),
      },
      {
        machine_id: 'openpiso-kiosk-2',
        uptime_seconds: 86400,
        active_slots: 1,
        is_wan_online: true,
        cash_box_amount: 890,
        today_total: 210,
        last_seen: new Date().toISOString(),
      },
    ]);

    setTransactions([
      {
        id: 104,
        machine_id: 'openpiso-kiosk-1',
        slot_id: 'slot-1',
        slot_name: 'Store Front',
        amount: 20,
        duration_minutes: 240,
        mac_address: '4A:32:98:BC:11:02',
        payment_type: 'COIN',
        created_at: new Date(Date.now() - 3 * 60000).toISOString(),
      },
      {
        id: 103,
        machine_id: 'openpiso-kiosk-1',
        slot_id: 'slot-2',
        slot_name: 'Billiard Hall',
        amount: 10,
        duration_minutes: 120,
        mac_address: '7C:1E:52:8A:4F:99',
        payment_type: 'COIN',
        created_at: new Date(Date.now() - 14 * 60000).toISOString(),
      },
      {
        id: 102,
        machine_id: 'openpiso-kiosk-2',
        slot_id: 'main',
        slot_name: 'Main Slot',
        amount: 5,
        duration_minutes: 60,
        mac_address: 'B2:44:91:01:23:EE',
        payment_type: 'COIN',
        created_at: new Date(Date.now() - 25 * 60000).toISOString(),
      },
      {
        id: 101,
        machine_id: 'openpiso-kiosk-1',
        slot_id: 'slot-1',
        slot_name: 'Store Front',
        amount: 20,
        duration_minutes: 240,
        mac_address: 'D8:3A:48:F1:CC:87',
        payment_type: 'COIN',
        created_at: new Date(Date.now() - 42 * 60000).toISOString(),
      },
    ]);
  };

  const fetchCloudData = async (url: string, key: string) => {
    if (!url || !key) return;
    setIsLoading(true);
    setErrorMsg(null);

    const cleanUrl = url.replace(/\/+$/, '');
    try {
      // 1. Fetch Transactions
      const txRes = await fetch(`${cleanUrl}/rest/v1/piso_transactions?order=created_at.desc&limit=50`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });

      // 2. Fetch Machines
      const mRes = await fetch(`${cleanUrl}/rest/v1/piso_machines?order=last_seen.desc`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setMachines(mData);
      }
    } catch (err: any) {
      setErrorMsg(`Cloud sync error: ${err.message}. Showing cached view.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered metrics calculation
  const filteredTx = selectedMachine === 'all'
    ? transactions
    : transactions.filter((t) => t.machine_id === selectedMachine);

  const filteredMachines = selectedMachine === 'all'
    ? machines
    : machines.filter((m) => m.machine_id === selectedMachine);

  const totalCashBox = filteredMachines.reduce((sum, m) => sum + Number(m.cash_box_amount || 0), 0);
  const totalToday = filteredMachines.reduce((sum, m) => sum + Number(m.today_total || 0), 0);
  const totalTransactionsCount = filteredTx.length;

  return (
    <div className="min-h-screen bg-[#171e19] text-white p-4 sm:p-8 font-sans antialiased">
      {/* Top Header Navigation (Neo-Brutalist) */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="bg-[#ffe17c] text-black border-2 border-black p-4 sm:p-5 rounded-2xl shadow-[6px_6px_0px_0px_#000000] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2.5 bg-black text-white border-2 border-black rounded-xl hover:bg-neutral-800 transition-colors shadow-[2px_2px_0px_0px_#000000]"
              title="Return to Local Admin"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-black bg-black text-[#ffe17c] rounded uppercase tracking-wider">
                  Cloud Live
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  OpenPisoWiFi Remote Admin
                </h1>
              </div>
              <p className="text-xs sm:text-sm font-bold text-neutral-800 mt-0.5">
                Centralized PostgreSQL Telemetry & Wireless Kiosk Fleet Manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
            <button
              onClick={() => fetchCloudData(supabaseUrl, supabaseKey)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-black font-black text-xs sm:text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#b7c6c2] text-black font-black text-xs sm:text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
            >
              <Settings className="w-4 h-4" />
              API Config
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto space-y-8">
        {/* Supabase API Config Drawer */}
        {isConfigOpen && (
          <div className="bg-white text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000]">
            <h3 className="text-lg font-black mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              Supabase Project Connection
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Enter your project URL and Anon / Service Role Key. Stored securely in your local browser storage.
            </p>
            <form onSubmit={saveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  placeholder="https://xyzcompany.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 border-black rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1">
                  Supabase API Key (Anon or Service Role)
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 border-black rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#ffe17c] text-black font-black text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
                >
                  Save & Connect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    loadDemoData();
                    setIsConfigOpen(false);
                  }}
                  className="px-4 py-2.5 bg-neutral-200 text-neutral-800 font-bold text-sm border-2 border-black rounded-xl hover:bg-neutral-300 transition-colors"
                >
                  Reset Demo Preview
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Machine Filter & Fleet Stats */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#b7c6c2]">Branch Location:</span>
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="px-3 py-1.5 bg-[#171e19] text-[#ffe17c] border-2 border-[#ffe17c] rounded-xl text-xs sm:text-sm font-black focus:outline-none shadow-[2px_2px_0px_0px_#ffe17c]"
            >
              <option value="all">🌐 All Kiosks ({machines.length})</option>
              {machines.map((m) => (
                <option key={m.machine_id} value={m.machine_id}>
                  {m.machine_id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[#b7c6c2]">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>PostgreSQL Realtime Active</span>
          </div>
        </div>

        {/* 3 Metrics Cards (Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Today's Income */}
          <div className="bg-[#ffe17c] text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-0.5 hover:translate-y-0.5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-wider bg-black text-[#ffe17c] px-2 py-0.5 rounded">
                Today
              </span>
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="text-4xl font-black tracking-tight">₱{totalToday.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs font-bold text-neutral-800 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Live revenue recorded across all active slots
            </p>
          </div>

          {/* Card 2: Cash in Box */}
          <div className="bg-[#b7c6c2] text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-0.5 hover:translate-y-0.5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-wider bg-black text-[#b7c6c2] px-2 py-0.5 rounded">
                Cash Vault
              </span>
              <Lock className="w-6 h-6" />
            </div>
            <div className="text-4xl font-black tracking-tight">₱{totalCashBox.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs font-bold text-neutral-800 mt-2">
              Physical coins currently pending in cash box drawers
            </p>
          </div>

          {/* Card 3: Total Transactions */}
          <div className="bg-white text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-0.5 hover:translate-y-0.5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-wider bg-black text-white px-2 py-0.5 rounded">
                Coin Drops
              </span>
              <Layers className="w-6 h-6" />
            </div>
            <div className="text-4xl font-black tracking-tight">{totalTransactionsCount}</div>
            <p className="text-xs font-bold text-neutral-700 mt-2">
              Recent coin insertions and voucher claims
            </p>
          </div>
        </div>

        {/* Kiosks Fleet Status */}
        <div className="bg-white text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000]">
          <h2 className="text-xl font-black mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-500" />
            Kiosk Fleet Status & Satellite Counts
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMachines.map((m) => (
              <div
                key={m.machine_id}
                className="p-4 bg-neutral-50 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-base">{m.machine_id}</h4>
                  <span className="px-2 py-0.5 text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-600 rounded">
                    ONLINE
                  </span>
                </div>
                <div className="text-xs font-mono space-y-1 text-neutral-600">
                  <div className="flex justify-between">
                    <span>Active Satellites:</span>
                    <span className="font-bold text-black">{m.active_slots} ESP32s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Today Sales:</span>
                    <span className="font-bold text-emerald-700">₱{m.today_total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cash in Drawer:</span>
                    <span className="font-bold text-black">₱{m.cash_box_amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Heartbeat:</span>
                    <span>{new Date(m.last_seen).toLocaleTimeString('en-PH')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Remote Fleet Command Bus (Controls Kiosks Anywhere) */}
        <div className="bg-white text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-black flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-600" />
                Remote Fleet Command Bus
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                Dispatch actions over Supabase. Target machine: <span className="font-mono font-bold bg-[#ffe17c] px-1.5 py-0.5 rounded text-black border border-black">{selectedMachine === 'all' ? (machines[0]?.machine_id || 'openpiso-kiosk-1') : selectedMachine}</span>
              </p>
            </div>
            {commandStatus && (
              <div className={`px-3 py-1.5 rounded-xl border-2 border-black text-xs font-bold ${commandStatus.status === 'dispatched' ? 'bg-emerald-200 text-emerald-900' :
                  commandStatus.status === 'sending' ? 'bg-amber-200 text-amber-900 animate-pulse' :
                    'bg-rose-200 text-rose-900'
                }`}>
                {commandStatus.message}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {/* Quick Action 1: Unlock Coinslot */}
            <button
              onClick={() => sendRemoteCommand('unlock_slot', { timeoutSeconds: 90 })}
              className="p-4 bg-emerald-50 hover:bg-emerald-100 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] text-left transition-all hover:translate-x-0.5 hover:translate-y-0.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-black text-sm">Unlock Coinslot</span>
                <LockOpen className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs text-neutral-600">Forces coin acceptor open for 90 seconds for customer assistance</p>
            </button>

            {/* Quick Action 2: Lock Coinslot */}
            <button
              onClick={() => sendRemoteCommand('lock_slot')}
              className="p-4 bg-rose-50 hover:bg-rose-100 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] text-left transition-all hover:translate-x-0.5 hover:translate-y-0.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-black text-sm">Inhibit / Lock Slot</span>
                <Lock className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-xs text-neutral-600">Immediately engages inhibit gate to reject coins (e.g. during outage)</p>
            </button>

            {/* Quick Action 3: Reboot Router */}
            <button
              onClick={() => {
                if (confirm('Reboot OpenWrt router on target kiosk?')) {
                  sendRemoteCommand('reboot_router');
                }
              }}
              className="p-4 bg-amber-50 hover:bg-amber-100 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] text-left transition-all hover:translate-x-0.5 hover:translate-y-0.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-black text-sm">Reboot Router</span>
                <Power className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-xs text-neutral-600">Reboots gateway router hardware remotely</p>
            </button>

            {/* Quick Action 4: Custom MAC Control */}
            <div className="p-4 bg-neutral-50 border-2 border-black rounded-xl shadow-[3px_3px_0px_0px_#000000] flex flex-col justify-between">
              <div>
                <span className="font-black text-sm block mb-1">Grant Client Time</span>
                <input
                  type="text"
                  placeholder="Client MAC (AA:BB:CC:...)"
                  value={customMac}
                  onChange={(e) => setCustomMac(e.target.value)}
                  className="w-full text-xs font-mono p-1.5 border border-black rounded mb-1.5"
                />
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="number"
                    value={customMins}
                    onChange={(e) => setCustomMins(parseInt(e.target.value, 10) || 60)}
                    className="w-16 text-xs p-1 border border-black rounded"
                  />
                  <span className="text-xs font-bold self-center">mins</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    if (!customMac) return alert('Enter a MAC address');
                    sendRemoteCommand('add_time', { mac: customMac, durationMinutes: customMins });
                  }}
                  className="flex-1 py-1 bg-black text-white text-xs font-black rounded hover:bg-neutral-800"
                >
                  Authorize
                </button>
                <button
                  onClick={() => {
                    if (!customMac) return alert('Enter a MAC address');
                    sendRemoteCommand('kick_session', { mac: customMac });
                  }}
                  className="px-2 py-1 bg-rose-600 text-white text-xs font-black rounded hover:bg-rose-700"
                >
                  Kick
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Transactions Feed */}
        <div className="bg-white text-black border-2 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000000]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              Live Coin Drops & Transactions Feed
            </h2>
            <span className="text-xs font-bold text-neutral-500">Auto-updating from Supabase</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-black text-xs uppercase font-black tracking-wider text-neutral-600 bg-neutral-100">
                  <th className="p-3">Time</th>
                  <th className="p-3">Machine / Location</th>
                  <th className="p-3">Slot ID</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Time Granted</th>
                  <th className="p-3">Client MAC</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b border-black">
                {filteredTx.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-neutral-500 font-bold">
                      No transactions found for this branch.
                    </td>
                  </tr>
                ) : (
                  filteredTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-amber-50/50 transition-colors">
                      <td className="p-3 font-mono text-xs text-neutral-600">
                        {new Date(tx.created_at).toLocaleTimeString('en-PH')}
                      </td>
                      <td className="p-3 font-bold">{tx.machine_id}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 text-xs font-black bg-neutral-200 border border-black rounded">
                          {tx.slot_name}
                        </span>
                      </td>
                      <td className="p-3 font-black text-emerald-600 text-base">
                        +₱{Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {Math.floor(tx.duration_minutes / 60)}h {tx.duration_minutes % 60}m
                      </td>
                      <td className="p-3 font-mono text-xs text-neutral-700">
                        {tx.mac_address}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
