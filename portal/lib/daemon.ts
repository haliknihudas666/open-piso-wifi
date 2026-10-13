const DAEMON_URL = process.env.DAEMON_URL || 'http://127.0.0.1:4000';

export interface CoinResponse {
  pulses: number;
}

export interface AuthorizeResponse {
  success: boolean;
  mac: string;
  expires_in: number;
  error?: string;
}

export interface RouterStatusResponse {
  online: boolean;
  mode: string;
  host: string;
  port: number;
  authorizedCount: number;
  activeMacs?: string[];
  latencyMs?: number;
  systemInfo?: string;
  error?: string;
}

// In-memory simulated coin tracker for development when hardware daemon is not active
let simulatedPendingCoins = 0;

/**
 * Fetches current pending coin pulses from hardware daemon (port 4000) or local simulator.
 * 1 pulse = 1 peso. Supports optional slotId for multi-coinslot setups.
 */
export async function getDaemonCoins(slotId?: string): Promise<{ pulses: number; daemonOnline: boolean; coinSlotEnabled: boolean; isWanOnline: boolean; slotId?: string }> {
  try {
    const url = slotId ? `${DAEMON_URL}/api/coins?slotId=${encodeURIComponent(slotId)}` : `${DAEMON_URL}/api/coins`;
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });

    if (!res.ok) {
      throw new Error(`Daemon returned status ${res.status}`);
    }

    const data = await res.json() as { pulses?: number; coinSlotEnabled?: boolean; isWanOnline?: boolean; slotId?: string };
    return {
      pulses: data.pulses || 0,
      daemonOnline: true,
      coinSlotEnabled: data.coinSlotEnabled ?? false,
      isWanOnline: data.isWanOnline !== false,
      slotId: data.slotId,
    };
  } catch {
    // If hardware daemon is offline, return simulated balance for development
    return { pulses: simulatedPendingCoins, daemonOnline: false, coinSlotEnabled: false, isWanOnline: true, slotId };
  }
}

/**
 * Fetches list of all connected ESP32 satellite coinslots.
 */
export async function getDaemonCoinslots(): Promise<Array<{ id: string; name: string; ip: string; status: string; online: boolean; rssi?: number }>> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/coinslots`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.slots || [];
    }
  } catch {}
  return [];
}

/**
 * Simulates coin pulse insertion (e.g. +1, +5, +10 pesos) for hardware-free testing.
 */
export async function simulateDaemonCoins(amount = 1, slotId?: string): Promise<{ pulses: number; success: boolean }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/coins/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, slotId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });

    if (res.ok) {
      const data = await res.json();
      return { pulses: data.pulses || 0, success: true };
    }
  } catch {
    // Hardware daemon offline: update local simulator state
  }

  simulatedPendingCoins += amount;
  return { pulses: simulatedPendingCoins, success: true };
}

/**
 * Clears pending coin counter on the hardware daemon or simulator.
 */
export async function clearDaemonCoins(slotId?: string): Promise<boolean> {
  simulatedPendingCoins = 0;
  try {
    const res = await fetch(`${DAEMON_URL}/api/coins/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });

    return res.ok;
  } catch {
    return true; // Cleared in simulated memory
  }
}

/**
 * Enables the coin slot on the hardware daemon (inhibit pin → LOW or unlocks remote ESP32).
 * Customer must press "Insert Coin" first before coins are accepted.
 */
export async function enableDaemonCoinSlot(force = false, slotId?: string, timeoutSeconds?: number): Promise<{ success: boolean; coinSlotEnabled: boolean; isWanOnline?: boolean; error?: string; message?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/coins/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force, slotId, timeoutSeconds }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { success: true, coinSlotEnabled: data.coinSlotEnabled ?? true, isWanOnline: true };
    }
    return {
      success: false,
      coinSlotEnabled: false,
      isWanOnline: data.isWanOnline !== undefined ? data.isWanOnline : false,
      error: data.error || 'COIN_SLOT_UNAVAILABLE',
      message: data.message || 'Could not enable coin slot.',
    };
  } catch {
    // Simulation fallback: pretend enabled in dev if daemon is offline
    return { success: true, coinSlotEnabled: true, isWanOnline: true };
  }
}

/**
 * Disables the coin slot on the hardware daemon (inhibit pin → HIGH or locks remote ESP32).
 */
export async function disableDaemonCoinSlot(slotId?: string): Promise<{ success: boolean; coinSlotEnabled: boolean }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/coins/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, coinSlotEnabled: data.coinSlotEnabled ?? false };
    }
  } catch {}
  return { success: true, coinSlotEnabled: false };
}

/**
 * Hot-reloads GPIO pin assignments on the daemon without a restart.
 * Uses BCM (Broadcom) GPIO numbers as required by the onoff package.
 */
export async function setDaemonGpioConfig(
  coinBcm: number,
  inhibitBcm: number,
  inhibitActiveHigh: boolean = true
): Promise<{ success: boolean; coinBcm: number; inhibitBcm: number; inhibitActiveHigh?: boolean }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/gpio/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coinPin: coinBcm, inhibitPin: inhibitBcm, inhibitActiveHigh }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, coinBcm: data.coinBcm, inhibitBcm: data.inhibitBcm, inhibitActiveHigh: data.inhibitActiveHigh };
    }
  } catch {}
  return { success: false, coinBcm, inhibitBcm, inhibitActiveHigh };
}

/**
 * Fetches the hardware coin debugger data from the daemon.
 * Returns event log, current GPIO state, and per-denomination detection stats.
 */
export async function getDaemonHardwareDebug(): Promise<any> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/hardware/debug`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) return await res.json();
  } catch {}
  return {
    events: [],
    currentState: {
      coinSlotEnabled: false,
      pendingCoins: 0,
      coinBcm: 4,
      inhibitBcm: 17,
      inhibitActiveHigh: true,
      gpioAvailable: false,
      lastGpioError: null,
      timeoutSeconds: 90,
    },
    denominationStats: {
      '1': { expected: 1, detected: [], match: null },
      '5': { expected: 5, detected: [], match: null },
      '10': { expected: 10, detected: [], match: null },
      '20': { expected: 20, detected: [], match: null },
    },
  };
}


/**
 * Authorizes a client MAC address on OpenWrt router managed by the hardware daemon.
 */
export async function authorizeClientMac(
  mac: string,
  durationMinutes: number,
  ip?: string,
  options?: { amount?: number; slotId?: string; type?: 'COIN' | 'VOUCHER' | 'FREE_TRIAL' }
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mac,
        durationMinutes,
        ip,
        amount: options?.amount,
        slotId: options?.slotId,
        type: options?.type,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Daemon authorization failed' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Hardware daemon /api/authorize error:', error);
    // In local dev without hardware daemon, mock authorization succeeds
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV MODE] Mock Authorized MAC: ${mac} for ${durationMinutes} minutes`);
      return { success: true };
    }
    return { success: false, error: error.message || 'Hardware daemon unreachable' };
  }
}

/**
 * Deauthorizes a client MAC address on the OpenWrt router, cutting off internet forwarding,
 * flushing conntrack states, and disconnecting the Wi-Fi station.
 */
export async function deauthorizeClientMac(
  mac: string,
  options?: { kickStation?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/deauthorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac, kickStation: options?.kickStation }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Daemon deauthorization failed' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Hardware daemon /api/deauthorize error:', error);
    return { success: false, error: error.message || 'Hardware daemon unreachable' };
  }
}

/**
 * Explicitly kicks / deauthenticates an associated Wi-Fi station from OpenWrt AP.
 */
export async function kickRouterStation(mac: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (error: any) {
    return { success: false, error: error.message || 'Daemon unreachable' };
  }
}

/**
 * Queries the OpenWrt router status from the daemon.
 */
export async function getRouterStatus(): Promise<RouterStatusResponse> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }

    return await res.json();
  } catch (error: any) {
    return {
      online: false,
      mode: 'offline',
      host: '192.168.1.1',
      port: 22,
      authorizedCount: 0,
      error: error.message || 'Daemon offline',
    };
  }
}

/**
 * Tests connection to the OpenWrt router via daemon.
 */
export async function testRouterConnection(config?: any): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
      signal: AbortSignal.timeout(8000),
    });

    return await res.json();
  } catch (error: any) {
    return { success: false, message: error.message || 'Unable to reach hardware daemon' };
  }
}

/**
 * Resolves a client IP address to MAC using the remote OpenWrt router's ARP / DHCP leases.
 */
export async function lookupRemoteArp(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/arp?ip=${encodeURIComponent(ip)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      const data = await res.json();
      return data.mac || null;
    }
  } catch {}
  return null;
}

export interface RouterWifiConfig {
  ssid2g: string;
  ssid5g: string;
  channel2g: string;
  channel5g: string;
  disabled2g: boolean;
  disabled5g: boolean;
}

export interface RouterTelemetryData {
  uptimeSeconds: number;
  loadAvg: string;
  memTotalMb: number;
  memFreeMb: number;
  clients2g: number;
  clients5g: number;
  totalClients: number;
  dhcpLeasesCount: number;
}

/**
 * Fetches Wi-Fi SSIDs and channels from OpenWrt router via daemon.
 */
export async function getRouterWifiConfig(): Promise<RouterWifiConfig> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/wifi`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return {
    ssid2g: '',
    ssid5g: '',
    channel2g: '6',
    channel5g: '36',
    disabled2g: false,
    disabled5g: false,
  };
}

/**
 * Updates Wi-Fi SSIDs and channels on OpenWrt router.
 */
export async function updateRouterWifiConfig(params: {
  ssid2g?: string;
  ssid5g?: string;
  channel2g?: string;
  channel5g?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/wifi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (error: any) {
    return { success: false, error: error.message || 'Daemon unreachable' };
  }
}

/**
 * Triggers a remote reboot on the OpenWrt router.
 */
export async function rebootOpenWrtRouter(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/reboot`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });

    return await res.json();
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to trigger router reboot' };
  }
}

/**
 * Flushes active authorized MAC address tables on OpenWrt router.
 */
export async function flushRouterSessions(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/flush`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (error: any) {
    return { success: false, error: error.message || 'Daemon unreachable' };
  }
}

/**
 * Gathers live OpenWrt telemetry (uptime, load, memory, connected clients).
 */
export async function getRouterTelemetry(): Promise<RouterTelemetryData> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/telemetry`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return {
    uptimeSeconds: 0,
    loadAvg: '0.00, 0.00, 0.00',
    memTotalMb: 128,
    memFreeMb: 64,
    clients2g: 0,
    clients5g: 0,
    totalClients: 0,
    dhcpLeasesCount: 0,
  };
}

/**
 * Adds or removes a MAC address from OpenWrt whitelist on the daemon.
 */
export async function setDaemonWhitelist(
  mac: string,
  action: 'add' | 'remove',
  ip?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac, action, ip }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (error: any) {
    return { success: false, error: error.message || 'Daemon unreachable' };
  }
}

/**
 * Adds or removes a MAC address from OpenWrt blacklist on the daemon.
 */
export async function setDaemonBlacklist(mac: string, action: 'add' | 'remove'): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac, action }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (error: any) {
    return { success: false, error: error.message || 'Daemon unreachable' };
  }
}

/**
 * Syncs all whitelist and blacklist rules from DB to OpenWrt.
 */
export async function syncDaemonDeviceRules(whitelist: string[], blacklist: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/devices/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whitelist, blacklist }),
      signal: AbortSignal.timeout(6000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Syncs all active database sessions to the OpenWrt router firewall.
 */
export async function syncDaemonSessions(
  sessions: Array<{ macAddress: string; remainingMinutes: number }>
): Promise<boolean> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions }),
      signal: AbortSignal.timeout(8000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Configures bandwidth rate limiting (QoS) on OpenWrt router.
 */
export async function setRouterQoS(downloadMbps: number, uploadMbps: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/qos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadMbps, uploadMbps }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (error: any) {
    return { success: false, error: error.message || 'Daemon unreachable' };
  }
}

/**
 * Fetches DHCP lease hostnames from OpenWrt router via daemon.
 */
export async function getRouterDhcpLeases(): Promise<Array<{ mac: string; ip: string; hostname?: string }>> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/dhcp`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      return data.leases || [];
    }
  } catch {}

  return [];
}

export interface RouterConnectedClient {
  mac: string;
  ip?: string;
  hostname?: string;
  signalDbm?: number;
  band?: '2.4GHz' | '5GHz' | 'LAN';
  interface?: string;
  rxRateMbps?: number;
  txRateMbps?: number;
  connectedSeconds?: number;
  isAuthorized?: boolean;
  isVip?: boolean;
  isBlacklisted?: boolean;
}

/**
 * Fetches detailed connected clients (Wi-Fi stations and DHCP leases) from OpenWrt router.
 */
export async function getRouterConnectedClients(): Promise<RouterConnectedClient[]> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/clients`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      return data.clients || [];
    }
  } catch {}

  return [];
}

export interface RouterQoSStatus {
  active: boolean;
  downloadMbps: number;
  uploadMbps: number;
  lanInterface: string;
  wanInterface: string;
  details: string;
}

/**
 * Fetches active Traffic Control (QoS) status from OpenWrt router.
 */
export async function getRouterQoSStatus(): Promise<RouterQoSStatus> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/qos/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return {
    active: false,
    downloadMbps: 0,
    uploadMbps: 0,
    lanInterface: 'br-lan',
    wanInterface: 'wan',
    details: 'QoS status unavailable',
  };
}

export interface RouterDeviceRulesStatus {
  whitelist: string[];
  blacklist: string[];
  authorized: string[];
}

/**
 * Fetches current OpenWrt nftables elements for whitelist and blacklist.
 */
export async function getRouterDeviceRulesStatus(): Promise<RouterDeviceRulesStatus> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/devices/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return {
    whitelist: [],
    blacklist: [],
    authorized: [],
  };
}

export interface DaemonVersionData {
  name: string;
  version: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
  gpioAvailable: boolean;
  online: boolean;
}

/**
 * Fetches version and runtime telemetry from the hardware daemon.
 */
export async function getDaemonVersion(): Promise<DaemonVersionData> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/version`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        name: data.name || 'pisowifi-daemon',
        version: data.version || 'unknown',
        nodeVersion: data.nodeVersion || process.version,
        platform: data.platform || `${process.platform} (${process.arch})`,
        uptime: data.uptime || 0,
        gpioAvailable: !!data.gpioAvailable,
        online: true,
      };
    }
  } catch {}

  return {
    name: 'pisowifi-daemon',
    version: 'unknown',
    nodeVersion: process.version,
    platform: `${process.platform} (${process.arch})`,
    uptime: 0,
    gpioAvailable: false,
    online: false,
  };
}

/**
 * Synchronizes custom portal domain (e.g. wifi.local) and IP to OpenWrt dnsmasq.
 */
export async function syncRouterDns(
  domain: string,
  portalIp?: string,
  routerIp?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${DAEMON_URL}/api/router/dns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, portalIp, routerIp }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      return await res.json();
    }
    return { success: false, message: `Daemon returned status ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Daemon offline' };
  }
}
