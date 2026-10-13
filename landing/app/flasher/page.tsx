'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import {
  ArrowLeft,
  Cpu,
  Zap,
  Terminal,
  Radio,
  Wifi,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Layers,
  Sparkles,
  Info,
  HelpCircle,
  ShieldCheck,
  Star,
  Check,
  Copy,
  Key,
  Sliders,
  RefreshCw,
} from 'lucide-react';

const EspInstallButton = 'esp-web-install-button' as any;

export default function Esp32FlasherPage() {
  const [isWebSerialSupported, setIsWebSerialSupported] = useState<boolean | null>(null);
  const [serialPort, setSerialPort] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<Array<{ text: string; type: 'info' | 'rx' | 'tx' | 'err'; time: string }>>([
    {
      text: 'WebSerial monitor ready. Plug your ESP32 into a USB port and click "Open Serial Monitor" to view live pulse telemetry.',
      type: 'info',
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [commandInput, setCommandInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Configurable fields for ESP32 NVS Flash
  const [slotId, setSlotId] = useState('slot-1');
  const [slotName, setSlotName] = useState('Store Front - Box 1');
  const [secret, setSecret] = useState('openpiso-secret-sat-1');
  const [daemonUrl, setDaemonUrl] = useState('http://10.0.0.1:4000');
  const [wifiSsid, setWifiSsid] = useState('OpenPisoWiFi');
  const [wifiPass, setWifiPass] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const generateRandomSecret = () => {
    const chars = 'abcdef0123456789';
    let res = 'sat_sec_';
    for (let i = 0; i < 20; i++) {
      res += chars[Math.floor(Math.random() * chars.length)];
    }
    setSecret(res);
  };

  const copySecretToClipboard = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const logsEndRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<any>(null);
  const portRef = useRef<any>(null);

  // Check browser WebSerial support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSerial = 'serial' in navigator;
      setIsWebSerialSupported(hasSerial);
    }
  }, []);

  // Auto-scroll terminal logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (text: string, type: 'info' | 'rx' | 'tx' | 'err' = 'rx') => {
    setLogs((prev) => [
      ...prev.slice(-300), // Keep last 300 entries
      { text, type, time: new Date().toLocaleTimeString() },
    ]);
  };

  // Connect to ESP32 over native WebSerial
  const connectSerial = async () => {
    const nav = navigator as any;
    if (!nav.serial) {
      alert('WebSerial is not supported in this browser. Please open this page in Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      addLog('Requesting USB Serial COM port from browser...', 'info');
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 115200 });

      portRef.current = port;
      setSerialPort(port);
      setIsConnected(true);
      addLog('✓ Connected to ESP32 Serial Port at 115200 baud!', 'info');

      // Start listening to incoming serial data stream
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const clean = line.replace('\r', '');
            if (clean.trim()) {
              addLog(clean, clean.includes('PULSE') || clean.includes('COIN') || clean.includes('CONFIG_OK') ? 'info' : clean.includes('CONFIG_JSON') ? 'info' : 'rx');

              // Auto-populate fields from ESP32 NVS JSON telemetry
              if (clean.includes('[CONFIG_JSON]')) {
                try {
                  const jsonStr = clean.substring(clean.indexOf('{'));
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.slot_id) setSlotId(parsed.slot_id);
                  if (parsed.slot_name) setSlotName(parsed.slot_name);
                  if (parsed.secret) setSecret(parsed.secret);
                  if (parsed.daemon) setDaemonUrl(parsed.daemon);
                  if (parsed.ssid) setWifiSsid(parsed.ssid);
                  if (parsed.pass !== undefined) setWifiPass(parsed.pass);
                  addLog('✓ Loaded configuration parameters from ESP32 NVS flash!', 'info');
                } catch {
                  // ignore parse error
                }
              }

              if (clean.includes('[CONFIG_OK]')) {
                setSyncSuccess(true);
                setTimeout(() => setSyncSuccess(false), 6000);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        addLog(`Serial error: ${err.message}`, 'err');
      } else {
        addLog('Port selection cancelled by user.', 'info');
      }
    }
  };

  // Disconnect from Serial Port
  const disconnectSerial = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (err: any) {
      console.warn('Disconnect error:', err);
    } finally {
      setIsConnected(false);
      setSerialPort(null);
      addLog('Disconnected from serial port.', 'info');
    }
  };

  // Send raw command string over Serial
  const sendSerialCommand = async (cmd: string) => {
    if (!portRef.current || !isConnected) {
      alert('Please connect to the ESP32 serial port first.');
      return;
    }
    try {
      const encoder = new TextEncoder();
      const writer = portRef.current.writable.getWriter();
      await writer.write(encoder.encode(cmd + '\n'));
      writer.releaseLock();
      addLog(`> ${cmd}`, 'tx');
    } catch (err: any) {
      addLog(`Send error: ${err.message}`, 'err');
    }
  };

  // 1-Click Sync custom parameters to ESP32 NVS Flash memory
  const syncConfigToEsp32 = async () => {
    if (!portRef.current || !isConnected) {
      alert('Please connect the Serial Monitor first (click "Connect Serial Monitor" in the console below).');
      return;
    }
    setIsSyncing(true);
    try {
      const cleanSlotId = slotId.trim() || 'slot-1';
      const cleanSlotName = slotName.trim() || 'Coin Box';
      const cleanSecret = secret.trim() || 'openpiso-secret';
      const cleanDaemon = daemonUrl.trim() || 'http://10.0.0.1:4000';
      const cleanSsid = wifiSsid.trim() || 'OpenPisoWiFi';
      const cleanPass = wifiPass.trim();

      const cmd = `CONFIG:slot_id=${cleanSlotId};slot_name=${cleanSlotName};secret=${cleanSecret};daemon=${cleanDaemon};ssid=${cleanSsid};pass=${cleanPass}`;
      await sendSerialCommand(cmd);
      addLog(`[CONFIG] Synced parameters to ESP32 NVS: Slot "${cleanSlotId}" ("${cleanSlotName}")...`, 'info');
    } catch (err: any) {
      addLog(`Config write error: ${err.message}`, 'err');
    } finally {
      setIsSyncing(false);
    }
  };

  const readConfigFromEsp32 = async () => {
    if (!portRef.current || !isConnected) {
      alert('Please connect the Serial Monitor first.');
      return;
    }
    await sendSerialCommand('GET_CONFIG');
  };

  const manifestUrl = '/firmware/manifest-esp32-satellite.json';

  return (
    <div className="min-h-screen bg-[#f6f4ea] text-black overflow-x-clip selection:bg-[#ffe17c] selection:text-black font-sans">
      {/* Load official ESP Web Tools WebComponent */}
      <Script
        type="module"
        src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"
        onLoad={() => setIsScriptLoaded(true)}
      />

      {/* Top Banner */}
      <aside className="bg-black text-[#ffe17c] font-mono text-[11px] sm:text-xs py-2 px-4 border-b-2 border-black flex flex-wrap items-center justify-center gap-2 font-bold text-center">
        <span>⚡</span>
        <span>
          <strong>OFFICIAL ESP32 WEB FLASHER:</strong> Flash OpenPisoWiFi firmware directly from your browser via WebSerial.
        </span>
        <Link href="/build-guide" className="underline hover:text-white ml-1">
          Hardware Wiring Guide →
        </Link>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#ffe17c] border-b-2 border-black px-4 sm:px-8 py-3 neo-shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 bg-black text-[#ffe17c] rounded-xl neo-border neo-shadow-xs btn-press flex items-center gap-1.5 font-black text-xs"
              title="Return to Main Page"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Main</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg sm:text-2xl tracking-tight leading-none">
                  ESP32 Web Flasher
                </span>
                <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[9px] sm:text-[10px] font-black uppercase rounded tracking-wider">
                  WEBSERIAL API
                </span>
              </div>
              <p className="text-[11px] font-bold text-neutral-800 leading-none mt-1 hidden sm:block">
                Zero Drivers · Zero Arduino IDE · 1-Click Browser USB Flashing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/build-guide"
              className="px-3 py-1.5 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press hidden md:flex items-center gap-1.5"
            >
              <span>Wiring &amp; Pins</span>
            </Link>
            <a
              href="https://github.com/haliknihudas666/open-piso-wifi/tree/main/firmware"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-white text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center gap-1.5"
            >
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="hidden sm:inline">Firmware Source</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

        {/* Browser WebSerial Compatibility Notice */}
        {isWebSerialSupported === false && (
          <div className="p-4 sm:p-5 bg-rose-100 border-2 border-black rounded-2xl neo-shadow flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-black text-sm sm:text-base text-rose-950">
                WebSerial is not supported in your current browser
              </h3>
              <p className="text-xs sm:text-sm text-rose-900 leading-relaxed font-medium">
                Direct browser flashing requires the <strong>W3C WebSerial API</strong>. Please open this page in{' '}
                <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, <strong>Brave</strong>, or{' '}
                <strong>Opera</strong> on Windows, macOS, Linux, or ChromeOS. Firefox and Safari do not support USB serial.
              </p>
            </div>
          </div>
        )}

        {isWebSerialSupported === true && (
          <div className="p-3.5 bg-emerald-100 border-2 border-black rounded-xl neo-shadow-xs flex items-center justify-between gap-3 text-xs font-bold text-emerald-950">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Browser Ready:</strong> WebSerial is fully supported. Connect your ESP32 with a USB data cable.
              </span>
            </div>
            <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-emerald-800">
              115200 / 460800 BAUD
            </span>
          </div>
        )}


      {/* Hero Section */}
      <div className="bg-[#ffe17c] border-2 border-black p-6 sm:p-8 rounded-2xl neo-shadow space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-black text-[#ffe17c] flex items-center justify-center font-black text-lg">
              🔌
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                ESP32 + OpenWrt Kiosk Web Flasher
              </h1>
              <p className="text-xs sm:text-sm font-bold text-neutral-800 font-mono">
                OpenWrt Wireless Satellite (Tested on Ruijie RG-EW1200G Pro) &middot; Microsecond Coin Interrupts &middot; 100% Free
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-black text-white font-mono font-bold text-xs rounded-lg neo-shadow-xs">
            v1.0.0 Stable
          </span>
        </div>

        <p className="text-xs sm:text-sm text-neutral-900 font-medium leading-relaxed max-w-4xl">
          OpenWrt routers (compatible with any OpenWrt device, tested and verified on the <strong>Ruijie RG-EW1200G Pro</strong>) are gigabit powerhouses for captive paywall routing, but lack built-in GPIO headers for coin acceptors. The <strong>ESP32 + OpenWrt Combo</strong> solves this: a low-cost $3 ESP32 acts as an autonomous wireless coin acceptor satellite, capturing microsecond pulses and reporting coin drops over Wi-Fi to your OpenWrt router.
        </p>

        <div className="flex flex-wrap gap-2 pt-1 text-xs font-mono">
          <span className="px-2.5 py-1 bg-white border border-black rounded-lg font-bold">
            ✓ Any OpenWrt Router (Tested on Ruijie EW1200G Pro)
          </span>
          <span className="px-2.5 py-1 bg-white border border-black rounded-lg font-bold">
            ✓ Multi-Coinslot Wireless Mesh
          </span>
          <span className="px-2.5 py-1 bg-white border border-black rounded-lg font-bold">
            ✓ 10kΩ Resistor Protected
          </span>
          <span className="px-2.5 py-1 bg-black text-[#ffe17c] rounded-lg font-bold">
            Zero Pi Needed
          </span>
        </div>
      </div>

      {/* 2-Step Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Step 1: OpenWrt Satellite Configuration */}
        <div className="space-y-6">
          <div className="bg-white border-2 border-black p-6 rounded-2xl neo-shadow space-y-5">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-black text-[#ffe17c] flex items-center justify-center font-black text-xs">
                  1
                </span>
                <h2 className="font-black text-base sm:text-lg">ESP32 + OpenWrt Architecture</h2>
              </div>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 border border-emerald-600 rounded font-bold">
                OPENWRT SATELLITE
              </span>
            </div>

            {/* Profile Overview Card */}
            <div className="p-4 rounded-xl border-2 border-black bg-[#ffe17c] neo-shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-800" />
                  <span className="font-extrabold text-sm sm:text-base">
                    ESP32 Wireless Satellite (Multi-Coinslot)
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-black text-[#ffe17c] text-[10px] font-black rounded uppercase">
                  OFFICIAL BUILD
                </span>
              </div>
              <p className="text-xs text-neutral-800 font-medium leading-relaxed">
                Connects wirelessly over Wi-Fi directly to your OpenWrt router (tested and verified with Ruijie RG-EW1200G Pro, or any OpenWrt device) at <code>http://10.0.0.1:4000</code>. Handles coin interrupt pulses, debounces with hardware timer accuracy, and engages the coin inhibit relay when no customer is inserting coins.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                <span className="px-2 py-0.5 bg-white border border-black rounded font-bold">
                  Coin Signal: GPIO 4
                </span>
                <span className="px-2 py-0.5 bg-white border border-black rounded font-bold">
                  Inhibit Relay: GPIO 5
                </span>
                <span className="px-2 py-0.5 bg-white border border-black rounded font-bold">
                  OLED/LCD: GPIO 21 / 22
                </span>
                <span className="px-2 py-0.5 bg-white border border-black rounded font-bold">
                  Physical Button: GPIO 15
                </span>
              </div>
            </div>

            {/* Why No Raspberry Pi is needed */}
            <div className="p-4 rounded-xl border border-neutral-300 bg-neutral-50 space-y-2">
              <h4 className="font-bold text-xs flex items-center gap-1.5 text-neutral-900">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Why ESP32 + OpenWrt instead of Raspberry Pi?</span>
              </h4>
              <p className="text-xs text-neutral-600 leading-relaxed">
                A Raspberry Pi already features its own 40-pin GPIO header. In OpenPisoWiFi, the ESP32 is designed specifically to pair with <strong>OpenWrt Gigabit Routers</strong> (tested and verified on the <strong>Ruijie RG-EW1200G Pro</strong>, or other OpenWrt-supported models) so you can build a complete commercial vending machine with high-power AC1200 Wi-Fi without buying an expensive Raspberry Pi or SBC!
              </p>
            </div>
          </div>

          {/* Hardware Pinout & Wiring Quick Card */}
          <div className="bg-white border-2 border-black p-5 rounded-2xl neo-shadow space-y-3">
            <h3 className="font-black text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>Hardware Wiring Schematic (ESP32 to Coinslot)</span>
            </h3>
            <p className="text-xs text-neutral-700 leading-relaxed font-medium">
              The CL-168 coin acceptor signal wire emits a 12V pulse. You <strong>MUST</strong> insert an in-line{' '}
              <strong className="underline">10kΩ series resistor</strong> between the coin acceptor white wire and{' '}
              <strong>ESP32 GPIO 4</strong> to protect the 3.3V chip from overvoltage.
            </p>
            <div className="p-3 bg-neutral-900 text-[#ffe17c] font-mono text-xs rounded-xl overflow-x-auto">
              <pre>{`[12V Power Supply] ---> OpenWrt Router (12V Direct - e.g. Ruijie EW1200G Pro)
[12V Power Supply] ---> Coinslot (+12V DC)
[12V Power Supply] ---> Buck Converter (12V->5V) ----> ESP32 VIN (5V)
[Common Ground]    ---> Shared GND (PSU, Coinslot, ESP32)
[Coinslot WHITE]   ---> [ 10kΩ Resistor ] -----------> ESP32 GPIO 4
[Coinslot INHIBIT] <--- Transistor / MOSFET Gate <---- ESP32 GPIO 5`}</pre>
            </div>
          </div>
        </div>

          {/* Step 2: WebSerial Flash Button & Instructions */}
          <div className="space-y-6">
            <div className="bg-white border-2 border-black p-6 rounded-2xl neo-shadow space-y-6">
              <div className="flex items-center justify-between border-b-2 border-black pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-black text-[#ffe17c] flex items-center justify-center font-black text-xs">
                    2
                  </span>
                  <h2 className="font-black text-base sm:text-lg">Connect &amp; Flash ESP32</h2>
                </div>
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-900 border border-emerald-600 px-2 py-0.5 rounded font-bold">
                  USB PLUGGED
                </span>
              </div>

              {/* Instructions Callout */}
              <div className="space-y-2 text-xs font-medium text-neutral-700">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-neutral-200 text-black flex items-center justify-center shrink-0 font-bold text-[10px]">
                    1
                  </span>
                  <span>Plug your ESP32 into a USB port using a known-working <strong>USB data cable</strong> (avoid charge-only cables).</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-neutral-200 text-black flex items-center justify-center shrink-0 font-bold text-[10px]">
                    2
                  </span>
                  <span>Click the <strong>&quot;INSTALL OPENPISO ESP32&quot;</strong> button below.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-neutral-200 text-black flex items-center justify-center shrink-0 font-bold text-[10px]">
                    3
                  </span>
                  <span>Select your board&apos;s COM port (usually <code>CP2102</code>, <code>CH340</code>, or <code>USB-JTAG</code>) from the browser prompt.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-neutral-200 text-black flex items-center justify-center shrink-0 font-bold text-[10px]">
                    4
                  </span>
                  <span>
                    <em>Stuck on &quot;Connecting...&quot;?</em> Hold down the physical <strong>BOOT</strong> button on your ESP32 board for 2 seconds while clicking Connect, then release it.
                  </span>
                </div>
              </div>

              {/* ESP Web Tools Install Button Component */}
              <div className="p-6 bg-neutral-50 border-2 border-black rounded-xl flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#ffe17c] border-2 border-black flex items-center justify-center text-2xl neo-shadow-xs">
                  ⚡
                </div>

                <div>
                  <h3 className="font-extrabold text-base">
                    Ready to Flash:{' '}
                    <span className="underline">
                      ESP32 OpenWrt Wireless Satellite
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1 font-mono">
                    Manifest: {manifestUrl}
                  </p>
                </div>

                {/* The WebComponent renders here */}
                <div className="w-full flex justify-center py-2">
                  <EspInstallButton manifest={manifestUrl}>
                    <button
                      slot="activate"
                      className="px-6 py-3.5 bg-black hover:bg-neutral-800 text-[#ffe17c] font-black text-sm neo-border rounded-xl neo-shadow btn-press cursor-pointer flex items-center gap-2"
                    >
                      <Zap className="w-5 h-5 fill-[#ffe17c]" />
                      <span>INSTALL OPENPISO ESP32</span>
                    </button>
                    <span slot="unsupported" className="text-xs text-rose-600 font-bold">
                      WebSerial is not supported in this browser. Please use Chrome or Edge.
                    </span>
                    <span slot="not-allowed" className="text-xs text-rose-600 font-bold">
                      Serial connection not allowed. Ensure this page is running over HTTPS or localhost.
                    </span>
                  </EspInstallButton>
                </div>

                <p className="text-[11px] text-neutral-500 font-medium">
                  Flashing takes ~35 seconds. Your ESP32 will auto-reboot when finished.
                </p>
              </div>

              {/* Alternative: Compile from Source Link */}
              <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
                <span className="text-neutral-600">Prefer compiling in Arduino IDE / PlatformIO?</span>
                <a
                  href="https://github.com/haliknihudas666/open-piso-wifi/blob/main/firmware/esp32-satellite/esp32-satellite.ino"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline text-black flex items-center gap-1"
                >
                  <span>View .INO Source</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Step 2B: Configure Parameters in ESP32 NVS Flash Memory */}
            <div className="bg-white border-2 border-black p-6 rounded-2xl neo-shadow space-y-5">
              <div className="flex items-center justify-between border-b-2 border-black pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#ffe17c] border border-black rounded-lg">
                    <Sliders className="w-4 h-4 text-black" />
                  </div>
                  <div>
                    <h3 className="font-black text-base sm:text-lg leading-tight">
                      Customize Parameters (NVS Flash)
                    </h3>
                    <p className="text-[11px] font-bold text-neutral-600">
                      Configure without re-compiling code · Stored in ESP32 Flash
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-blue-100 text-blue-900 border border-blue-600 px-2 py-0.5 rounded font-bold">
                  PERSISTENT
                </span>
              </div>

              {/* Status Banner */}
              {syncSuccess && (
                <div className="p-3 bg-emerald-100 border-2 border-black rounded-xl text-xs font-bold text-emerald-950 flex items-center gap-2 neo-shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>✓ Configuration saved to ESP32 NVS! Board is rebooting and registering with OpenWrt.</span>
                </div>
              )}

              <div className="space-y-4 text-xs font-medium">
                {/* Slot ID Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-neutral-900 flex items-center gap-1">
                      <span>Unique Slot Identifier</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-1">
                      {['slot-1', 'slot-2', 'slot-3'].map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSlotId(id)}
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] border border-black ${
                            slotId === id ? 'bg-black text-[#ffe17c] font-black' : 'bg-neutral-100 hover:bg-neutral-200'
                          }`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={slotId}
                    onChange={(e) => setSlotId(e.target.value)}
                    placeholder="slot-1"
                    className="w-full px-3 py-2 font-mono text-xs border-2 border-black rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Must be unique per coin acceptor box so your OpenWrt router tracks separate cash totals.
                  </p>
                </div>

                {/* Friendly Slot Name */}
                <div className="space-y-1.5">
                  <label className="font-extrabold text-neutral-900">
                    Friendly Slot Name
                  </label>
                  <input
                    type="text"
                    value={slotName}
                    onChange={(e) => setSlotName(e.target.value)}
                    placeholder="Store Front - Box 1"
                    className="w-full px-3 py-2 text-xs border-2 border-black rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Label displayed on the customer captive portal and OLED/LCD screen.
                  </p>
                </div>

                {/* Satellite Secret Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-neutral-900 flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-neutral-700" />
                      <span>Security Secret Key</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={generateRandomSecret}
                        className="px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 border border-black rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Generate Random</span>
                      </button>
                      <button
                        type="button"
                        onClick={copySecretToClipboard}
                        className="px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 border border-black rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedSecret ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="openpiso-secret-sat-1"
                    className="w-full px-3 py-2 font-mono text-xs border-2 border-black rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Matches the <code>SATELLITE_SECRET</code> configured in your OpenWrt Admin Portal.
                  </p>
                </div>

                {/* Daemon URL & Wi-Fi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="font-extrabold text-[11px] text-neutral-900">
                      OpenWrt Daemon URL
                    </label>
                    <input
                      type="text"
                      value={daemonUrl}
                      onChange={(e) => setDaemonUrl(e.target.value)}
                      placeholder="http://10.0.0.1:4000"
                      className="w-full px-2.5 py-1.5 font-mono text-xs border-2 border-black rounded-lg focus:outline-none bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-extrabold text-[11px] text-neutral-900">
                      Wi-Fi SSID
                    </label>
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="OpenPisoWiFi"
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black rounded-lg focus:outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-extrabold text-[11px] text-neutral-900">
                    Wi-Fi Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    placeholder="Leave empty if open captive Wi-Fi"
                    className="w-full px-2.5 py-1.5 text-xs border-2 border-black rounded-lg focus:outline-none bg-white"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={syncConfigToEsp32}
                  disabled={isSyncing}
                  className="w-full sm:flex-1 py-3 px-4 bg-black hover:bg-neutral-800 text-[#ffe17c] font-black text-xs neo-border rounded-xl neo-shadow btn-press flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-[#ffe17c]" />
                  <span>{isSyncing ? 'WRITING TO FLASH...' : 'WRITE CONFIG TO ESP32 (NVS)'}</span>
                </button>

                <button
                  type="button"
                  onClick={readConfigFromEsp32}
                  disabled={!isConnected}
                  className="w-full sm:w-auto py-3 px-4 bg-white hover:bg-neutral-100 text-black font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Read current active parameters from ESP32"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Read from Board</span>
                </button>
              </div>

              {!isConnected && (
                <p className="text-[10px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-300 font-medium">
                  💡 Tip: Click <strong>&quot;Connect Serial Monitor&quot;</strong> below first so the browser can send parameters directly over USB to your ESP32 board.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Step 3: Interactive Live Serial Console / Monitor */}
        <section className="bg-white border-2 border-black rounded-2xl neo-shadow overflow-hidden space-y-0">
          <div className="p-4 sm:p-5 bg-[#ffe17c] border-b-2 border-black flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-black" />
              <div>
                <h2 className="font-black text-base sm:text-lg leading-tight">
                  Live WebSerial Console &amp; Pulse Diagnostics
                </h2>
                <p className="text-xs font-bold text-neutral-800">
                  Read serial logs, inspect Wi-Fi connection, and verify coin pulse accuracy (115200 baud)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isConnected ? (
                <button
                  type="button"
                  onClick={connectSerial}
                  className="px-4 py-2 bg-black text-[#ffe17c] font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Connect Serial Monitor</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={disconnectSerial}
                  className="px-4 py-2 bg-rose-500 text-white font-black text-xs neo-border rounded-xl neo-shadow-xs btn-press flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setLogs([])}
                className="p-2 bg-white text-black neo-border rounded-xl neo-shadow-xs btn-press"
                title="Clear Logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Terminal Log Screen */}
          <div className="p-4 bg-[#111713] text-[#ffe17c] font-mono text-xs h-72 sm:h-96 overflow-y-auto space-y-1">
            {logs.length === 0 ? (
              <div className="text-neutral-500 italic py-8 text-center">
                Terminal cleared. Connect port to stream live logs.
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-neutral-500 text-[10px] select-none shrink-0">
                    [{log.time}]
                  </span>
                  <span
                    className={
                      log.type === 'info'
                        ? 'text-emerald-400 font-bold'
                        : log.type === 'err'
                        ? 'text-rose-400 font-bold'
                        : log.type === 'tx'
                        ? 'text-sky-300 font-bold'
                        : 'text-neutral-200'
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Quick Test Buttons & Command Input */}
          <div className="p-4 border-t-2 border-black bg-neutral-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-neutral-600">Quick Test:</span>
              <button
                type="button"
                onClick={() => sendSerialCommand('STATUS')}
                disabled={!isConnected}
                className="px-2.5 py-1 bg-white text-black font-mono font-bold text-xs neo-border rounded-lg hover:bg-neutral-100 disabled:opacity-40"
              >
                STATUS
              </button>
              <button
                type="button"
                onClick={() => sendSerialCommand('TEST_COIN')}
                disabled={!isConnected}
                className="px-2.5 py-1 bg-white text-black font-mono font-bold text-xs neo-border rounded-lg hover:bg-neutral-100 disabled:opacity-40"
              >
                +1 COIN PULSE
              </button>
              <button
                type="button"
                onClick={() => sendSerialCommand('RESET')}
                disabled={!isConnected}
                className="px-2.5 py-1 bg-white text-black font-mono font-bold text-xs neo-border rounded-lg hover:bg-neutral-100 disabled:opacity-40"
              >
                REBOOT
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (commandInput.trim()) {
                  sendSerialCommand(commandInput.trim());
                  setCommandInput('');
                }
              }}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <input
                type="text"
                placeholder="Send serial command..."
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                disabled={!isConnected}
                className="flex-1 sm:w-60 px-3 py-1.5 text-xs font-mono border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white disabled:bg-neutral-200"
              />
              <button
                type="submit"
                disabled={!isConnected}
                className="px-3 py-1.5 bg-black text-[#ffe17c] font-black text-xs neo-border rounded-lg neo-shadow-xs btn-press flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </section>

        {/* Step-by-Step FAQ & Troubleshooting */}
        <div className="bg-white border-2 border-black p-6 sm:p-8 rounded-2xl neo-shadow space-y-6">
          <h2 className="font-black text-lg sm:text-xl flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-500" />
            <span>Frequently Asked Questions &amp; Troubleshooting</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-neutral-800 leading-relaxed font-medium">
            <div className="p-4 bg-neutral-50 border-2 border-black rounded-xl space-y-1.5">
              <h3 className="font-extrabold text-sm text-black">
                1. The flasher says &quot;Failed to initialize. Try resetting your device&quot;?
              </h3>
              <p>
                Many ESP32 DevKit boards (especially budget CH340 or CP2102 clones) lack an automatic auto-reset capacitor circuit. To enter flashing mode: hold the <strong>BOOT</strong> (or <strong>IO0</strong>) button down, click <em>Connect</em> in the browser, wait 2 seconds until the erase prompt appears, then release the button.
              </p>
            </div>

            <div className="p-4 bg-neutral-50 border-2 border-black rounded-xl space-y-1.5">
              <h3 className="font-extrabold text-sm text-black">
                2. No serial ports appear in the Chrome popup?
              </h3>
              <p>
                Ensure your USB cable is a <strong>data cable</strong>, not a charge-only cord from a phone charger. If on Windows, make sure you have installed the standard USB UART driver for your chip: <strong>CH340 Driver</strong> or <strong>Silicon Labs CP210x VCP Driver</strong>.
              </p>
            </div>

            <div className="p-4 bg-neutral-50 border-2 border-black rounded-xl space-y-1.5">
              <h3 className="font-extrabold text-sm text-black">
                3. Can I use other ESP variants like ESP32-S2, ESP32-S3, or ESP32-C3?
              </h3>
              <p>
                Yes! The OpenWrt Satellite firmware is compatible across ESP32, ESP32-S2, ESP32-S3, and ESP32-C3 microcontrollers. They all possess native hardware interrupt timers to capture microsecond coin pulses and report directly to your OpenWrt router over Wi-Fi.
              </p>
            </div>

            <div className="p-4 bg-neutral-50 border-2 border-black rounded-xl space-y-1.5">
              <h3 className="font-extrabold text-sm text-black">
                4. How do I change the Wi-Fi credentials in the Satellite?
              </h3>
              <p>
                After flashing, you can either configure the Wi-Fi via ESP Web Tools Improv Wi-Fi prompt, or compile the sketch in Arduino IDE with your custom SSID and password in <code>firmware/esp32-satellite/esp32-satellite.ino</code>.
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
