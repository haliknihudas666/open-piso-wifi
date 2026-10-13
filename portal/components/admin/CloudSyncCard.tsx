import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  Cloud,
  Send,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Cpu,
  Wifi,
  QrCode,
  Lock,
  Unlock,
  Key,
  Eye,
  EyeOff,
  Save,
  HelpCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface SatelliteSlot {
  id: string;
  name: string;
  ip: string;
  mac: string;
  status: string;
  online: boolean;
  rssi?: number;
  pendingCoins?: number;
}

export function CloudSyncCard() {
  const { data: slotsData, mutate: mutateSlots, isValidating } = useSWR<{ slots: SatelliteSlot[] }>(
    '/api/coinslots',
    fetcher,
    { refreshInterval: 5000 }
  );

  const [testingSlotId, setTestingSlotId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  // Telegram In-Dashboard Configuration (No .env editing needed!)
  const [botToken, setBotToken] = useState('');
  const [adminChatId, setAdminChatId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);

  // Load existing Telegram configuration on mount
  useEffect(() => {
    fetch('/api/telegram/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (data.token) setBotToken(data.token);
          if (data.adminChatId) setAdminChatId(data.adminChatId);
          setIsPollingActive(Boolean(data.isPolling));
        }
      })
      .catch(() => {});
  }, []);

  const slots = slotsData?.slots || [];

  // Unlock / lock test for a satellite slot
  const handleTestUnlock = async (slotId: string) => {
    setTestingSlotId(slotId);
    setTestResult(null);
    try {
      const res = await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', slotId, force: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult(`✅ Slot ${slotId} unlocked for 60s testing.`);
        mutateSlots();
      } else {
        setTestResult(`❌ Failed to unlock ${slotId}: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setTestResult(`❌ Error connecting to slot: ${err.message}`);
    } finally {
      setTestingSlotId(null);
    }
  };

  const handleTestLock = async (slotId: string) => {
    setTestingSlotId(slotId);
    try {
      await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', slotId }),
      });
      setTestResult(`🔒 Slot ${slotId} locked.`);
      mutateSlots();
    } catch (err: any) {
      setTestResult(`❌ Error: ${err.message}`);
    } finally {
      setTestingSlotId(null);
    }
  };

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    setTelegramStatus(null);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken, adminChatId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramStatus('✅ Telegram bot credentials saved and synced to daemon!');
        setIsPollingActive(Boolean(botToken.trim() && adminChatId.trim()));
      } else {
        setTelegramStatus(`❌ ${data.message || 'Failed to save Telegram credentials'}`);
      }
    } catch (err: any) {
      setTelegramStatus(`❌ Error saving Telegram credentials: ${err.message}`);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleSendTestTelegram = async () => {
    setIsSendingTelegram(true);
    setTelegramStatus(null);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTelegramStatus('✅ Test message sent! Check your Telegram app.');
      } else {
        setTelegramStatus(`⚠️ ${data.message || 'Ensure Bot Token and Admin Chat ID are saved above.'}`);
      }
    } catch {
      setTelegramStatus('⚠️ Telegram test endpoint unreachable. Verify daemon is running.');
    } finally {
      setIsSendingTelegram(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <Card className="border-2 border-black bg-amber-50 dark:bg-amber-950/20 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <CardHeader className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-400 text-black border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  Multi-Coinslot & Cloud Sync Hub
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-600 font-mono text-xs">
                    Approach B Active
                  </Badge>
                </CardTitle>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  Manage remote ESP32 wireless coin acceptors, free Telegram bot notifications, and Supabase cloud sync.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutateSlots()}
                className="border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1.5"
                disabled={isValidating}
              >
                <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <a
                href="/admin/cloud"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold bg-amber-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
              >
                <ExternalLink className="w-4 h-4" />
                Open Cloud Portal
              </a>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Satellite ESP32 Slots Table */}
      <Card className="border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <CardHeader className="p-5 border-b-2 border-black bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-base font-bold">
                Connected ESP32 Satellite Coinslots ({slots.length})
              </CardTitle>
            </div>
            <Badge variant="outline" className="border-neutral-400 text-xs">
              Auto-Discovery on 10.0.0.1:4000
            </Badge>
          </div>
        </CardHeader>
        <div className="p-5">
          {testResult && (
            <div className="mb-4 p-3 bg-neutral-100 dark:bg-neutral-800 border-2 border-black rounded-lg text-sm font-mono">
              {testResult}
            </div>
          )}

          {slots.length === 0 ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
              <Radio className="w-10 h-10 text-neutral-400 mx-auto mb-2 animate-pulse" />
              <p className="font-bold text-neutral-700 dark:text-neutral-300">No ESP32 Satellites Detected</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                Flash your ESP32 with <code>firmware/esp32-satellite/esp32-satellite.ino</code> and connect it to your Piso-WiFi Wi-Fi. It will register here automatically!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className="p-4 border-2 border-black rounded-xl bg-white dark:bg-neutral-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">
                          {slot.name}
                        </h4>
                        <span className="text-xs font-mono text-neutral-500">ID: {slot.id}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          slot.online
                            ? slot.status === 'unlocked'
                              ? 'bg-amber-100 text-amber-900 border-amber-600'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-600'
                            : 'bg-red-100 text-red-900 border-red-600'
                        }
                      >
                        {slot.online ? (slot.status === 'unlocked' ? 'UNLOCKED' : 'READY') : 'OFFLINE'}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                      <div className="flex items-center justify-between">
                        <span>IP Address:</span>
                        <span className="font-bold text-neutral-900 dark:text-neutral-200">{slot.ip}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>MAC:</span>
                        <span>{slot.mac}</span>
                      </div>
                      {typeof slot.rssi === 'number' && (
                        <div className="flex items-center justify-between">
                          <span>Wi-Fi Signal:</span>
                          <span className="flex items-center gap-1 font-bold">
                            <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                            {slot.rssi} dBm
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
                    {slot.status === 'unlocked' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        className="w-full text-xs font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1"
                        disabled={testingSlotId === slot.id}
                        onClick={() => handleTestLock(slot.id)}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Lock Slot
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs font-bold border-2 border-black bg-amber-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-amber-300 flex items-center justify-center gap-1"
                        disabled={testingSlotId === slot.id || !slot.online}
                        onClick={() => handleTestUnlock(slot.id)}
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        Test Unlock
                      </Button>
                    )}
                    <a
                      href={`/?slot=${encodeURIComponent(slot.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 border-2 border-black rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      title="Customer QR Link"
                    >
                      <QrCode className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Two-Column: Telegram Bot & Supabase Cloud */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Telegram Bot Card */}
        <Card className="border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader className="p-5 border-b-2 border-black bg-neutral-50 dark:bg-neutral-900 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-sky-500" />
              <CardTitle className="text-base font-bold">Telegram Bot Remote Admin</CardTitle>
            </div>
            <Badge
              variant={isPollingActive ? 'success' : 'outline'}
              className="font-mono text-[10px]"
            >
              {isPollingActive ? '🟢 Live Polling' : '⚪ Setup Required'}
            </Badge>
          </CardHeader>
          <div className="p-5 space-y-4">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Operates over outbound HTTPS long-polling. <strong>No public IP or port forwarding required</strong>. Paste your bot token below — no <code>.env</code> file editing needed!
            </p>

            {/* Step-by-Step Helper Toggle */}
            <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 rounded-xl space-y-2 text-xs">
              <div
                className="flex items-center justify-between cursor-pointer font-bold text-sky-900 dark:text-sky-200"
                onClick={() => setShowHelpGuide(!showHelpGuide)}
              >
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-sky-600" />
                  How to get Bot Token &amp; Chat ID (30-second setup)
                </span>
                <span className="text-[10px] font-mono underline">{showHelpGuide ? 'Hide' : 'Show Guide'}</span>
              </div>
              {showHelpGuide && (
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-700 dark:text-neutral-300 pt-1 text-[11px] leading-relaxed">
                  <li>
                    Open Telegram and message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-bold underline text-sky-600">@BotFather</a>.
                  </li>
                  <li>
                    Send <code className="px-1 bg-white dark:bg-neutral-800 border rounded">/newbot</code>, follow the prompts, and copy the <strong>HTTP API Token</strong>.
                  </li>
                  <li>
                    Message <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="font-bold underline text-sky-600">@userinfobot</a> and send <code className="px-1 bg-white dark:bg-neutral-800 border rounded">/start</code> to get your numeric <strong>Id</strong>.
                  </li>
                  <li>
                    Paste both into the fields below and click <strong>Save &amp; Connect Bot</strong>.
                  </li>
                </ol>
              )}
            </div>

            {/* Bot Token Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                <span>🤖 Telegram Bot Token:</span>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-[11px] font-mono text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-1"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showToken ? 'Hide' : 'Reveal'}
                </button>
              </label>
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder="e.g. 7123456789:AAH... (from @BotFather)"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="font-mono text-xs py-2"
              />
            </div>

            {/* Admin Chat ID Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                <span>👤 Admin Chat ID:</span>
                <span className="text-[10px] text-neutral-500 font-mono">Restricts /commands strictly to you</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. 123456789 (from @userinfobot)"
                value={adminChatId}
                onChange={(e) => setAdminChatId(e.target.value)}
                className="font-mono text-xs py-2"
              />
            </div>

            {/* Status Feedback */}
            {telegramStatus && (
              <p className="text-xs font-mono p-2.5 bg-neutral-100 dark:bg-neutral-800 border-2 border-black rounded-lg">
                {telegramStatus}
              </p>
            )}

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button
                onClick={handleSaveTelegram}
                disabled={isSavingTelegram}
                className="font-bold bg-[#ffe17c] hover:bg-[#ffd850] text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5 text-xs py-2.5"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingTelegram ? 'Saving...' : 'Save & Connect'}
              </Button>
              <Button
                onClick={handleSendTestTelegram}
                disabled={isSendingTelegram || !botToken}
                className="font-bold bg-sky-400 hover:bg-sky-500 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5 text-xs py-2.5"
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingTelegram ? 'Testing...' : 'Send Test Alert'}
              </Button>
            </div>

            {/* Remote Command Reference */}
            <div className="p-2.5 bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 rounded-xl space-y-1 text-[11px] font-mono">
              <div className="text-neutral-500 font-bold">Supported Telegram Commands:</div>
              <div className="text-neutral-700 dark:text-neutral-300 flex flex-wrap gap-1.5">
                <span className="px-1.5 py-0.5 bg-white dark:bg-neutral-900 border rounded">/sales</span>
                <span className="px-1.5 py-0.5 bg-white dark:bg-neutral-900 border rounded">/slots</span>
                <span className="px-1.5 py-0.5 bg-white dark:bg-neutral-900 border rounded">/emptybox</span>
                <span className="px-1.5 py-0.5 bg-white dark:bg-neutral-900 border rounded">/wan</span>
                <span className="px-1.5 py-0.5 bg-white dark:bg-neutral-900 border rounded">/help</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Supabase Cloud Card */}
        <Card className="border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader className="p-5 border-b-2 border-black bg-neutral-50 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <CardTitle className="text-base font-bold">Supabase PostgreSQL Sync</CardTitle>
            </div>
          </CardHeader>
          <div className="p-5 space-y-4">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Transactions and machine telemetry sync automatically to Supabase. Even if internet drops, records queue safely in memory and sync on recovery.
            </p>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 border-2 border-black rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">PostgreSQL Engine:</span>
                <span className="font-bold text-neutral-900 dark:text-neutral-100">Supabase PostgREST</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Offline Resilience:</span>
                <span className="text-emerald-600 font-bold">In-Memory Fail-Soft Queue</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Heartbeat Interval:</span>
                <span>Every 60 seconds</span>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="/admin/cloud"
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 font-bold bg-amber-400 hover:bg-amber-300 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Launch Modern Cloud Admin Dashboard
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
