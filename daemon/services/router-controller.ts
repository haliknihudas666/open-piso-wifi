import { Client, type ConnectConfig } from 'ssh2';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type RouterMode = 'fw4_nftables' | 'opennds' | 'fw3_iptables' | 'local' | 'local_linux' | 'simulation';

export interface GatewayCapabilities {
  kickStation: boolean;
  wifiConfig: boolean;
  rssi: boolean;
  qos: boolean;
  gatewayType: 'openwrt_ssh' | 'local_linux' | 'simulation';
}

export interface RouterConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  mode: RouterMode;
  lanInterface?: string;
  wanInterface?: string;
}

export interface RouterStatus {
  online: boolean;
  mode: RouterMode;
  host: string;
  port: number;
  authorizedCount: number;
  activeMacs: string[];
  latencyMs?: number;
  systemInfo?: string;
  error?: string;
}

export interface WifiConfig {
  ssid2g: string;
  ssid5g: string;
  channel2g: string;
  channel5g: string;
  disabled2g: boolean;
  disabled5g: boolean;
}

export interface RouterTelemetry {
  uptimeSeconds: number;
  loadAvg: string;
  memTotalMb: number;
  memFreeMb: number;
  clients2g: number;
  clients5g: number;
  totalClients: number;
  dhcpLeasesCount: number;
}

export interface ConnectedClientInfo {
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

export interface QoSStatus {
  active: boolean;
  downloadMbps: number;
  uploadMbps: number;
  lanInterface: string;
  wanInterface: string;
  details: string;
}

export interface DeviceRulesStatus {
  whitelist: string[];
  blacklist: string[];
  authorized: string[];
}

/**
 * Standardizes MAC address format to lowercase colon-separated (e.g. 00:11:22:33:44:55)
 */
export function normalizeMac(mac: string): string {
  return mac
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .match(/.{1,2}/g)
    ?.join(':') ?? mac.trim().toLowerCase();
}

/**
 * Checks if a MAC address has the Locally Administered bit set (bit 1 of byte 0 is 1).
 * Standardized on iOS, Android, and Windows as "Private Wi-Fi Address" / MAC Randomization.
 * 2nd character of the MAC will be 2, 6, A, or E.
 */
export function isRandomizedMac(mac: string): boolean {
  const norm = normalizeMac(mac);
  if (!norm || norm.length !== 17) return false;
  const firstByte = parseInt(norm.slice(0, 2), 16);
  if (isNaN(firstByte)) return false;
  return (firstByte & 0x02) !== 0;
}

/**
 * Guesses device manufacturer or identifies private MAC when DHCP hostname is omitted.
 */
export function guessDeviceVendor(mac: string): string | undefined {
  const norm = normalizeMac(mac);
  if (!norm || norm.length !== 17) return undefined;
  if (isRandomizedMac(norm)) {
    return 'Mobile Device (Private MAC)';
  }
  const prefix = norm.slice(0, 8).toLowerCase();
  const knownVendors: Record<string, string> = {
    // Apple
    '00:17:f2': 'Apple', '00:1c:b3': 'Apple', '00:1e:52': 'Apple', '00:23:12': 'Apple',
    '00:25:00': 'Apple', '00:26:08': 'Apple', '00:26:b0': 'Apple', '3c:15:c2': 'Apple',
    '40:6c:8f': 'Apple', '68:fe:f7': 'Apple', '70:ec:e4': 'Apple', '80:e6:50': 'Apple',
    'a4:83:e7': 'Apple', 'ac:bc:32': 'Apple', 'bc:fe:d9': 'Apple', 'f0:18:98': 'Apple',
    // Samsung
    '00:12:47': 'Samsung', '00:15:99': 'Samsung', '00:16:32': 'Samsung', '00:21:19': 'Samsung',
    '08:fc:88': 'Samsung', '14:bb:6e': 'Samsung', '24:4b:03': 'Samsung', '34:14:5f': 'Samsung',
    '50:85:69': 'Samsung', '58:c9:35': 'Samsung', '78:47:1d': 'Samsung', '84:25:19': 'Samsung',
    '94:65:2d': 'Samsung', 'bc:8c:cd': 'Samsung', 'dc:71:44': 'Samsung',
    // Xiaomi / Redmi
    '00:9e:c8': 'Xiaomi', '18:65:90': 'Xiaomi', '28:6c:07': 'Xiaomi', '34:80:0d': 'Xiaomi',
    '50:8f:4c': 'Xiaomi', '58:44:98': 'Xiaomi', '64:09:80': 'Xiaomi', '7c:49:eb': 'Xiaomi',
    'ac:c1:ee': 'Xiaomi', 'd4:97:0b': 'Xiaomi',
    // Huawei / Honor
    '00:18:82': 'Huawei', '00:1e:10': 'Huawei', '00:25:68': 'Huawei', '24:df:6a': 'Huawei',
    '48:46:fb': 'Huawei', '70:7b:e8': 'Huawei', 'ac:e8:7b': 'Huawei',
    // Vivo / OPPO / Realme
    '44:01:bb': 'Vivo', '68:db:f0': 'Vivo', '84:2e:27': 'Vivo', 'a4:eb:d3': 'Vivo',
    '10:2c:6b': 'OPPO', '2c:59:8a': 'OPPO', '60:ab:67': 'OPPO', 'e4:a7:c5': 'OPPO',
    '64:cc:2e': 'Realme', '8c:19:b5': 'Realme',
    // PC / Hardware / Network
    '00:1a:79': 'Intel', '00:21:6a': 'Intel', '68:05:ca': 'Intel', '80:86:f2': 'Intel',
    '00:e0:4c': 'Realtek', '54:ee:75': 'Realtek',
    '00:0c:43': 'MediaTek', '00:0e:8e': 'MediaTek', '24:0a:c4': 'Espressif',
    'b8:27:eb': 'Raspberry Pi', 'dc:a6:32': 'Raspberry Pi', 'e4:5f:01': 'Raspberry Pi',
  };
  return knownVendors[prefix];
}

export class RouterController {
  private config: RouterConfig;
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private authorizedMacs = new Set<string>();

  constructor(customConfig?: Partial<RouterConfig>) {
    const isLinux = process.platform === 'linux';
    const defaultMode: RouterMode = isLinux ? 'fw4_nftables' : 'simulation';

    this.config = {
      host: process.env.ROUTER_IP || '192.168.1.1',
      port: parseInt(process.env.ROUTER_SSH_PORT || '22', 10),
      username: process.env.ROUTER_SSH_USER || 'root',
      privateKeyPath: process.env.ROUTER_SSH_KEY_PATH || (isLinux ? '/root/.ssh/id_rsa' : undefined),
      password: process.env.ROUTER_PASSWORD || undefined,
      mode: (process.env.ROUTER_MODE as RouterMode) || defaultMode,
      ...customConfig,
    };

    console.log(`[ROUTER CONTROLLER] Initialized for OpenWrt at ${this.config.host}:${this.config.port} (Mode: ${this.config.mode})`);
  }

  public updateConfig(newConfig: Partial<RouterConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log(`[ROUTER CONTROLLER] Config updated: ${this.config.host}:${this.config.port} (Mode: ${this.config.mode})`);
  }

  public getConfig(): RouterConfig {
    return { ...this.config };
  }

  public getCapabilities(): GatewayCapabilities {
    const isLocal = this.config.mode === 'local' || this.config.mode === 'local_linux';
    const isSim = this.config.mode === 'simulation';
    return {
      kickStation: !isLocal && !isSim,
      wifiConfig: !isLocal && !isSim,
      rssi: !isLocal && !isSim,
      qos: true,
      gatewayType: isLocal ? 'local_linux' : (isSim ? 'simulation' : 'openwrt_ssh'),
    };
  }

  /**
   * Executes a command on the target router via SSH, or locally if in local mode, or mocks in simulation mode.
   */
  public async executeCommand(
    command: string,
    overrideConfig?: Partial<RouterConfig>
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const cfg = { ...this.config, ...overrideConfig };

    // Simulation / Dev Mode
    if (cfg.mode === 'simulation') {
      console.log(`[SIMULATOR SSH -> ${cfg.host}] Command: "${command}"`);
      return { stdout: 'OK (Simulated)', stderr: '', code: 0 };
    }

    // Local Hostspot / Pi Gateway Mode (RPi running local nftables / iptables)
    if (cfg.mode === 'local' || cfg.mode === 'local_linux') {
      try {
        const { stdout, stderr } = await execAsync(command);
        return { stdout, stderr, code: 0 };
      } catch (err: any) {
        return { stdout: '', stderr: err.message || String(err), code: err.code || 1 };
      }
    }

    // Remote OpenWrt execution via SSH (Dropbear)
    return new Promise((resolve) => {
      const conn = new Client();
      let stdoutData = '';
      let stderrData = '';

      const sshOptions: ConnectConfig = {
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        readyTimeout: 7000,
        keepaliveInterval: 5000,
      };

      // Authenticate via private key if available, else password
      if (cfg.privateKeyPath && fs.existsSync(cfg.privateKeyPath)) {
        try {
          sshOptions.privateKey = fs.readFileSync(cfg.privateKeyPath);
        } catch (err) {
          console.warn(`[ROUTER SSH] Could not read private key at ${cfg.privateKeyPath}:`, err);
        }
      }

      if (cfg.password !== undefined && !sshOptions.privateKey) {
        sshOptions.password = cfg.password;
      } else if (!sshOptions.privateKey) {
        // OpenWrt Dropbear allows empty password when no root password is set
        sshOptions.password = '';
        sshOptions.tryKeyboard = true;
      }

      conn
        .on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return resolve({ stdout: '', stderr: err.message, code: 1 });
            }

            stream
              .on('close', (code: number) => {
                conn.end();
                resolve({ stdout: stdoutData.trim(), stderr: stderrData.trim(), code: code || 0 });
              })
              .on('data', (data: Buffer) => {
                stdoutData += data.toString();
              })
              .stderr.on('data', (data: Buffer) => {
                stderrData += data.toString();
              });
          });
        })
        .on('error', (err) => {
          resolve({ stdout: '', stderr: `SSH Connection Error: ${err.message}`, code: 1 });
        })
        .connect(sshOptions);
    });
  }

  /**
   * Authorizes a client MAC address to access the internet through the OpenWrt router.
   */
  public async authorize(
    rawMac: string,
    durationMinutes: number,
    ip?: string
  ): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);

    if (!mac || mac.length !== 17) {
      return { success: false, error: `Invalid MAC address format: "${rawMac}"` };
    }

    console.log(`[ROUTER AUTH] Authorizing MAC: ${mac} for ${durationMinutes} min(s) on ${this.config.host}`);

    let command = '';

    switch (this.config.mode) {
      case 'fw4_nftables':
        // Modern OpenWrt nftables set (supports dedicated piso_portal table and fw4 table)
        // Reset previous state first to prevent conflicts, try with timeout, fall back to permanent, pin ARP neighbor, and clear conntrack by IP
        command = `
nft delete element inet piso_portal piso_auth { ${mac} } 2>/dev/null || true
nft delete element inet fw4 piso_auth { ${mac} } 2>/dev/null || true
${durationMinutes > 0 ? `nft add element inet piso_portal piso_auth { ${mac} timeout ${durationMinutes}m } 2>/dev/null || ` : ''}nft add element inet piso_portal piso_auth { ${mac} } 2>/dev/null || ${durationMinutes > 0 ? `nft add element inet fw4 piso_auth { ${mac} timeout ${durationMinutes}m } 2>/dev/null || ` : ''}nft add element inet fw4 piso_auth { ${mac} } 2>/dev/null || true
CLIENT_IP="${ip || ''}"
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /proc/net/arp 2>/dev/null | awk '{print $1}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /tmp/dhcp.leases 2>/dev/null | awk '{print $3}' | head -n1)
if [ -n "$CLIENT_IP" ]; then
  ip neigh replace "$CLIENT_IP" lladdr "${mac}" dev br-lan nud permanent 2>/dev/null || true
fi
if [ -n "$CLIENT_IP" ] && which conntrack >/dev/null 2>&1; then
  conntrack -D -s "$CLIENT_IP" 2>/dev/null || true
  conntrack -D -d "$CLIENT_IP" 2>/dev/null || true
fi
`.trim();
        break;

      case 'opennds':
        // OpenNDS captive portal daemon on OpenWrt
        command = `
ndsctl auth ${mac} ${durationMinutes} 2>/dev/null || true
CLIENT_IP="${ip || ''}"
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /proc/net/arp 2>/dev/null | awk '{print $1}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /tmp/dhcp.leases 2>/dev/null | awk '{print $3}' | head -n1)
if [ -n "$CLIENT_IP" ]; then
  ip neigh replace "$CLIENT_IP" lladdr "${mac}" dev br-lan nud permanent 2>/dev/null || true
fi
`.trim();
        break;

      case 'fw3_iptables':
        // Legacy OpenWrt fw3 / ipset
        command = `
ipset add piso_auth ${mac} -exist 2>/dev/null || iptables -I PISO_AUTH 1 -m mac --mac-source ${mac} -j ACCEPT
CLIENT_IP="${ip || ''}"
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /proc/net/arp 2>/dev/null | awk '{print $1}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /tmp/dhcp.leases 2>/dev/null | awk '{print $3}' | head -n1)
if [ -n "$CLIENT_IP" ]; then
  ip neigh replace "$CLIENT_IP" lladdr "${mac}" dev br-lan nud permanent 2>/dev/null || true
fi
`.trim();
        break;

      case 'local':
      case 'local_linux':
        command = `
nft delete element inet piso piso_auth { ${mac} } 2>/dev/null || true
nft delete element inet piso_portal piso_auth { ${mac} } 2>/dev/null || true
${durationMinutes > 0 ? `nft add element inet piso piso_auth { ${mac} timeout ${durationMinutes}m } 2>/dev/null || nft add element inet piso_portal piso_auth { ${mac} timeout ${durationMinutes}m } 2>/dev/null || ` : ''}nft add element inet piso piso_auth { ${mac} } 2>/dev/null || nft add element inet piso_portal piso_auth { ${mac} } 2>/dev/null || sudo iptables -I PISO_AUTH 1 -m mac --mac-source ${mac} -j ACCEPT 2>/dev/null || true
CLIENT_IP="${ip || ''}"
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /proc/net/arp 2>/dev/null | awk '{print $1}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /var/lib/misc/dnsmasq.leases 2>/dev/null | awk '{print $3}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /tmp/dnsmasq.leases 2>/dev/null | awk '{print $3}' | head -n1)
if [ -n "$CLIENT_IP" ]; then
  ip neigh replace "$CLIENT_IP" lladdr "${mac}" dev ${this.config.lanInterface || 'eth1'} nud permanent 2>/dev/null || true
fi
if [ -n "$CLIENT_IP" ] && which conntrack >/dev/null 2>&1; then
  conntrack -D -s "$CLIENT_IP" 2>/dev/null || true
  conntrack -D -d "$CLIENT_IP" 2>/dev/null || true
fi
`.trim();
        break;

      case 'simulation':
      default:
        command = `echo "Mock Authorize ${mac}"`;
        break;
    }

    const res = await this.executeCommand(command);

    if (res.code !== 0 && this.config.mode !== 'simulation') {
      console.error(`[ROUTER AUTH ERROR] Failed to authorize MAC ${mac}:`, res.stderr);
      return { success: false, error: res.stderr || 'Router authorization command failed' };
    }

    // Register authorized MAC in memory tracker
    this.authorizedMacs.add(mac);

    // Clear existing timer if MAC was already active (session extension)
    const existingTimer = this.activeTimers.get(mac);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(mac);
    }

    // Schedule deauthorization timer
    if (durationMinutes > 0) {
      const timer = setTimeout(async () => {
        console.log(`[ROUTER TIMER] Session expired for MAC ${mac}. Deauthorizing...`);
        await this.deauthorize(mac);
      }, durationMinutes * 60 * 1000);

      this.activeTimers.set(mac, timer);
    } else {
      // 0 minutes means immediate deauthorization
      await this.deauthorize(mac);
    }

    return { success: true };
  }

  /**
   * Deauthorizes a client MAC address, cutting off internet access on OpenWrt,
   * flushing conntrack session streams, and kicking the Wi-Fi station.
   */
  public async deauthorize(
    rawMac: string,
    options?: { kickStation?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);
    console.log(`[ROUTER DEAUTH] Revoking access for MAC: ${mac} on ${this.config.host}`);

    // Clear scheduled timer
    const timer = this.activeTimers.get(mac);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(mac);
    }

    this.authorizedMacs.delete(mac);

    let command = '';
    const shouldKick = options?.kickStation === true;
    const kickCommands = shouldKick ? `
for iface in $(ubus list hostapd.* 2>/dev/null); do
  ubus call "$iface" del_client "{\\"addr\\":\\"${mac}\\", \\"reason\\":1, \\"deauth\\":true, \\"ban_time\\":0}" 2>/dev/null || true
done
for dev in $(iw dev 2>/dev/null | awk '/Interface/ {print $2}'); do
  iw dev "$dev" station del "${mac}" 2>/dev/null || true
done
`.trim() : '';

    const flushConntrack = `
CLIENT_IP=$(grep -iw "${mac}" /proc/net/arp 2>/dev/null | awk '{print $1}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /tmp/dhcp.leases 2>/dev/null | awk '{print $3}' | head -n1)
if [ -n "$CLIENT_IP" ]; then
  ip neigh delete "$CLIENT_IP" dev br-lan 2>/dev/null || true
fi
if [ -n "$CLIENT_IP" ] && which conntrack >/dev/null 2>&1; then
  conntrack -D -s "$CLIENT_IP" 2>/dev/null || true
  conntrack -D -d "$CLIENT_IP" 2>/dev/null || true
fi
`.trim();

    switch (this.config.mode) {
      case 'fw4_nftables':
        command = `
nft delete element inet piso_portal piso_auth { ${mac} } 2>/dev/null || true
nft delete element inet fw4 piso_auth { ${mac} } 2>/dev/null || true
${flushConntrack}
${kickCommands}
        `.trim();
        break;

      case 'opennds':
        command = `
ndsctl deauth ${mac} 2>/dev/null || true
${flushConntrack}
${kickCommands}
        `.trim();
        break;

      case 'fw3_iptables':
        command = `
ipset del piso_auth ${mac} 2>/dev/null || iptables -D PISO_AUTH -m mac --mac-source ${mac} -j ACCEPT 2>/dev/null || true
${flushConntrack}
${kickCommands}
        `.trim();
        break;

      case 'local':
      case 'local_linux':
        command = `
nft delete element inet piso piso_auth { ${mac} } 2>/dev/null || true
nft delete element inet piso_portal piso_auth { ${mac} } 2>/dev/null || true
sudo iptables -D PISO_AUTH -m mac --mac-source ${mac} -j ACCEPT 2>/dev/null || true
${flushConntrack}
        `.trim();
        break;

      case 'simulation':
      default:
        command = `echo "Mock Deauthorize ${mac}"`;
        break;
    }

    const res = await this.executeCommand(command);
    if (res.code !== 0 && this.config.mode !== 'simulation') {
      console.warn(`[ROUTER DEAUTH WARN] Could not deauthorize MAC ${mac}:`, res.stderr);
      return { success: false, error: res.stderr };
    }

    return { success: true };
  }

  /**
   * Explicitly disconnects / kicks an associated Wi-Fi station from OpenWrt AP.
   */
  public async kickStation(rawMac: string): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);
    if (!mac || mac.length !== 17) return { success: false, error: 'Invalid MAC address' };

    console.log(`[ROUTER KICK] Disconnecting associated station ${mac} from wireless AP...`);
    if (this.config.mode === 'simulation') {
      return { success: true };
    }

    const command = `
for iface in $(ubus list hostapd.* 2>/dev/null); do
  ubus call "$iface" del_client "{\\"addr\\":\\"${mac}\\", \\"reason\\":1, \\"deauth\\":true, \\"ban_time\\":0}" 2>/dev/null || true
done
for dev in $(iw dev 2>/dev/null | awk '/Interface/ {print $2}'); do
  iw dev "$dev" station del "${mac}" 2>/dev/null || true
done
CLIENT_IP=$(grep -iw "${mac}" /proc/net/arp 2>/dev/null | awk '{print $1}' | head -n1)
[ -z "$CLIENT_IP" ] && CLIENT_IP=$(grep -iw "${mac}" /tmp/dhcp.leases 2>/dev/null | awk '{print $3}' | head -n1)
if [ -n "$CLIENT_IP" ] && which conntrack >/dev/null 2>&1; then
  conntrack -D -s "$CLIENT_IP" 2>/dev/null || true
  conntrack -D -d "$CLIENT_IP" 2>/dev/null || true
fi
    `.trim();

    const res = await this.executeCommand(command);
    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Retrieves live status and connectivity check to the OpenWrt router.
   */
  public async getStatus(): Promise<RouterStatus> {
    const startTime = Date.now();

    if (this.config.mode === 'simulation') {
      return {
        online: true,
        mode: this.config.mode,
        host: this.config.host,
        port: this.config.port,
        authorizedCount: this.authorizedMacs.size,
        activeMacs: Array.from(this.authorizedMacs),
        latencyMs: 1,
        systemInfo: 'OpenWrt Simulation Mode (Local Dev)',
      };
    }

    const testCmd = this.config.mode === 'local' ? 'uname -a' : 'cat /etc/openwrt_release || uname -a';
    const res = await this.executeCommand(testCmd);
    const latencyMs = Date.now() - startTime;

    if (res.code !== 0) {
      return {
        online: false,
        mode: this.config.mode,
        host: this.config.host,
        port: this.config.port,
        authorizedCount: this.authorizedMacs.size,
        activeMacs: Array.from(this.authorizedMacs),
        error: res.stderr || 'Unable to connect to OpenWrt router',
      };
    }

    return {
      online: true,
      mode: this.config.mode,
      host: this.config.host,
      port: this.config.port,
      authorizedCount: this.authorizedMacs.size,
      activeMacs: Array.from(this.authorizedMacs),
      latencyMs,
      systemInfo: res.stdout.split('\n')[0] || 'OpenWrt Connected',
    };
  }

  /**
   * Tests SSH connection to the router with optional custom settings.
   */
  public async testConnection(
    overrideConfig?: Partial<RouterConfig>
  ): Promise<{ success: boolean; message: string; mode: string; host: string; latencyMs?: number }> {
    const start = Date.now();
    const cfg = { ...this.config, ...overrideConfig };

    if (cfg.mode === 'simulation') {
      return {
        success: true,
        message: 'Simulation connection successful (Mock Router)',
        mode: cfg.mode,
        host: cfg.host,
        latencyMs: 1,
      };
    }

    const res = await this.executeCommand('uname -a', overrideConfig);
    const latency = Date.now() - start;

    if (res.code === 0) {
      return {
        success: true,
        message: `Successfully connected to OpenWrt router at ${cfg.host}:${cfg.port}`,
        mode: cfg.mode,
        host: cfg.host,
        latencyMs: latency,
      };
    }

    return {
      success: false,
      message: res.stderr || `Failed to connect to ${cfg.host}:${cfg.port}`,
      mode: cfg.mode,
      host: cfg.host,
    };
  }

  /**
   * Queries the OpenWrt router's ARP cache and DHCP leases to resolve an IP address to a MAC address.
   */
  public async lookupArp(clientIp: string): Promise<string | null> {
    const cleanIp = clientIp.replace(/^.*:/, '').trim();

    if (cleanIp === '127.0.0.1' || cleanIp === 'localhost') {
      return '02:00:00:00:00:01';
    }

    if (this.config.mode === 'simulation') {
      const lastOctet = cleanIp.split('.').pop() || '1';
      const hex = parseInt(lastOctet, 10).toString(16).padStart(2, '0');
      return `02:00:00:00:00:${hex}`;
    }

    // Try reading ARP table or DHCP leases from OpenWrt
    const command = `grep -w "${cleanIp}" /proc/net/arp 2>/dev/null || grep -w "${cleanIp}" /tmp/dhcp.leases 2>/dev/null || true`;
    const res = await this.executeCommand(command);

    if (res.code === 0 && res.stdout) {
      const match = res.stdout.match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i);
      if (match && match[1]) {
        return normalizeMac(match[1]);
      }
    }

    return null;
  }

  /**
   * Resyncs all active database sessions back to OpenWrt firewall on boot or reconnect.
   */
  public async syncSessions(sessions: Array<{ macAddress: string; remainingMinutes: number }>) {
    console.log(`[ROUTER SYNC] Re-synchronizing ${sessions.length} active session(s) to OpenWrt...`);
    for (const session of sessions) {
      if (session.remainingMinutes > 0) {
        await this.authorize(session.macAddress, session.remainingMinutes);
      } else {
        await this.deauthorize(session.macAddress);
      }
    }
    console.log(`[ROUTER SYNC] Session synchronization complete.`);
  }

  /**
   * Retrieves active Wi-Fi configuration (SSIDs, channels, enabled state) from OpenWrt.
   */
  public async getWifiConfig(): Promise<WifiConfig> {
    if (this.config.mode === 'simulation') {
      return {
        ssid2g: 'OpenPisoWiFi',
        ssid5g: 'OpenPisoWiFi_5G',
        channel2g: '6',
        channel5g: '36',
        disabled2g: false,
        disabled5g: false,
      };
    }

    const command = `
# 1. Discover 2.4GHz SSID (try iw dev, then ubus, then uci)
SSID_2G=$(iw dev phy0-ap0 info 2>/dev/null | awk '/ssid/ {print $2}')
[ -z "$SSID_2G" ] && SSID_2G=$(ubus call network.wireless status 2>/dev/null | grep -A 10 '"radio0"' | grep -o '"ssid": *"[^"]*"' | head -n1 | cut -d'"' -f4)
[ -z "$SSID_2G" ] && SSID_2G=$(uci -q get wireless.@wifi-iface[0].ssid || uci -q get wireless.wifinet0.ssid || uci -q get wireless.default_radio0.ssid)
SEC2G=$(uci -q show wireless 2>/dev/null | grep -E "\\.device='?radio0" | head -n1 | cut -d'.' -f2 | cut -d'=' -f1)
[ -z "$SSID_2G" ] && [ -n "$SEC2G" ] && SSID_2G=$(uci -q get "wireless.$SEC2G.ssid")

# 2. Discover 5GHz SSID (try iw dev, then ubus, then uci)
SSID_5G=$(iw dev phy1-ap0 info 2>/dev/null | awk '/ssid/ {print $2}')
[ -z "$SSID_5G" ] && SSID_5G=$(ubus call network.wireless status 2>/dev/null | grep -A 10 '"radio1"' | grep -o '"ssid": *"[^"]*"' | head -n1 | cut -d'"' -f4)
[ -z "$SSID_5G" ] && SSID_5G=$(uci -q get wireless.@wifi-iface[1].ssid || uci -q get wireless.wifinet1.ssid || uci -q get wireless.default_radio1.ssid)
SEC5G=$(uci -q show wireless 2>/dev/null | grep -E "\\.device='?radio1" | head -n1 | cut -d'.' -f2 | cut -d'=' -f1)
[ -z "$SSID_5G" ] && [ -n "$SEC5G" ] && SSID_5G=$(uci -q get "wireless.$SEC5G.ssid")

# 3. Channels and disabled states
CHAN_2G=$(iw dev phy0-ap0 info 2>/dev/null | grep -o 'channel [0-9]\\+' | head -n1 | cut -d' ' -f2)
[ -z "$CHAN_2G" ] && CHAN_2G=$(uci -q get wireless.radio0.channel || echo '6')

CHAN_5G=$(iw dev phy1-ap0 info 2>/dev/null | grep -o 'channel [0-9]\\+' | head -n1 | cut -d' ' -f2)
[ -z "$CHAN_5G" ] && CHAN_5G=$(uci -q get wireless.radio1.channel || echo '36')

DIS_2G=$(uci -q get wireless.radio0.disabled || echo '0')
DIS_5G=$(uci -q get wireless.radio1.disabled || echo '0')

echo "SSID_2G: $SSID_2G"
echo "SSID_5G: $SSID_5G"
echo "CHAN_2G: $CHAN_2G"
echo "CHAN_5G: $CHAN_5G"
echo "DIS_2G: $DIS_2G"
echo "DIS_5G: $DIS_5G"
    `.trim();

    const res = await this.executeCommand(command);
    const lines = (res.stdout || '').split('\n');
    const map = new Map<string, string>();
    for (const line of lines) {
      const [key, ...val] = line.split(':');
      if (key && val) {
        map.set(key.trim(), val.join(':').trim());
      }
    }

    return {
      ssid2g: map.get('SSID_2G') || 'NiconielletPisoWifi',
      ssid5g: map.get('SSID_5G') || 'NiconielletPisoWifi_5G',
      channel2g: map.get('CHAN_2G') || '6',
      channel5g: map.get('CHAN_5G') || '36',
      disabled2g: map.get('DIS_2G') === '1',
      disabled5g: map.get('DIS_5G') === '1',
    };
  }

  /**
   * Updates Wi-Fi SSIDs and channels on OpenWrt and reloads wireless transmitters.
   */
  public async updateWifiConfig(params: {
    ssid2g?: string;
    ssid5g?: string;
    channel2g?: string;
    channel5g?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (this.config.mode === 'simulation') {
      console.log('[SIMULATOR] Wi-Fi config updated:', params);
      return { success: true };
    }

    const cmds: string[] = [];
    if (params.ssid2g) {
      const s2 = params.ssid2g.trim().replace(/'/g, '');
      cmds.push(`uci -q set wireless.@wifi-iface[0].ssid='${s2}' || uci -q set wireless.wifinet0.ssid='${s2}'`);
    }
    if (params.ssid5g) {
      const s5 = params.ssid5g.trim().replace(/'/g, '');
      cmds.push(`uci -q set wireless.@wifi-iface[1].ssid='${s5}' || uci -q set wireless.wifinet1.ssid='${s5}'`);
    }
    if (params.channel2g) {
      const c2 = params.channel2g.trim().replace(/[^a-zA-Z0-9]/g, '');
      cmds.push(`uci -q set wireless.radio0.channel='${c2}'`);
    }
    if (params.channel5g) {
      const c5 = params.channel5g.trim().replace(/[^a-zA-Z0-9]/g, '');
      cmds.push(`uci -q set wireless.radio1.channel='${c5}'`);
    }

    cmds.push('uci commit wireless');
    // Reload Wi-Fi with a 1-second delay in the background so the SSH session and HTTP response complete cleanly
    cmds.push('(sleep 1 && wifi reload) >/dev/null 2>&1 &');

    const fullCommand = cmds.join(' && ');
    const res = await this.executeCommand(fullCommand);

    if (res.code !== 0) {
      return { success: false, error: res.stderr || 'Failed to update Wi-Fi configuration' };
    }

    return { success: true };
  }

  /**
   * Safely triggers a remote reboot on the OpenWrt router.
   */
  public async rebootRouter(): Promise<{ success: boolean; message: string }> {
    if (this.config.mode === 'simulation') {
      return { success: true, message: 'Simulation Router Rebooting (Mock)' };
    }

    // Fire reboot command in background so SSH close doesn't wait indefinitely
    this.executeCommand('nohup sh -c "sleep 1 && reboot" >/dev/null 2>&1 &').catch(() => { });
    return { success: true, message: 'Router reboot command dispatched successfully' };
  }

  /**
   * Flushes all active authorized MAC addresses from OpenWrt firewall set.
   */
  public async flushAuthTable(): Promise<{ success: boolean; error?: string }> {
    this.authorizedMacs.clear();
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();

    const command = `
nft flush set inet piso_portal piso_auth 2>/dev/null || nft flush set inet fw4 piso_auth 2>/dev/null || true
which conntrack >/dev/null 2>&1 && conntrack -F 2>/dev/null || true
ip neigh flush dev br-lan nud permanent 2>/dev/null || true
    `.trim();
    const res = await this.executeCommand(command);
    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Gathers live OpenWrt telemetry (uptime, load, memory, connected Wi-Fi clients).
   */
  public async getRouterTelemetry(): Promise<RouterTelemetry> {
    if (this.config.mode === 'simulation') {
      return {
        uptimeSeconds: 86400,
        loadAvg: '0.15, 0.08, 0.05',
        memTotalMb: 128,
        memFreeMb: 64,
        clients2g: 2,
        clients5g: 1,
        totalClients: 3,
        dhcpLeasesCount: 4,
      };
    }

    const command = `
echo "UPTIME: $(cat /proc/uptime 2>/dev/null || echo '0 0')"
echo "LOAD: $(cat /proc/loadavg 2>/dev/null || echo '0 0 0')"
echo "MEM_TOTAL: $(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo '0')"
echo "MEM_FREE: $(grep MemFree /proc/meminfo 2>/dev/null | awk '{print $2}' || echo '0')"

C2=0
C5=0

IFACES="$(iw dev 2>/dev/null | awk '/Interface/ {print $2}')"
[ -z "$IFACES" ] && IFACES="phy0-ap0 phy1-ap0"

for iface in $IFACES; do
  [ -z "$iface" ] && continue

  # Count active stations
  cnt=$(iw dev "$iface" station dump 2>/dev/null | grep -c '^Station ' || true)
  cnt=$(echo "$cnt" | tr -dc '0-9')
  [ -z "$cnt" ] && cnt=0

  # Fallback to iwinfo if cnt is 0
  if [ "$cnt" -eq 0 ] && command -v iwinfo >/dev/null 2>&1; then
    cnt=$(iwinfo "$iface" assoclist 2>/dev/null | grep -c 'dBm' || true)
    cnt=$(echo "$cnt" | tr -dc '0-9')
    [ -z "$cnt" ] && cnt=0
  fi

  # Determine band (2.4GHz vs 5GHz)
  band=""
  chan=$(iw dev "$iface" info 2>/dev/null | grep -o 'channel [0-9]\\+' | head -n1 | cut -d' ' -f2)
  if [ -n "$chan" ]; then
    if [ "$chan" -le 14 ]; then band="2.4GHz"; fi
    if [ "$chan" -ge 36 ]; then band="5GHz"; fi
  fi
  if [ -z "$band" ]; then
    if echo "$iface" | grep -Eq 'phy1|radio1|wlan1|5g'; then
      band="5GHz"
    else
      band="2.4GHz"
    fi
  fi

  if [ "$band" = "5GHz" ]; then
    C5=$((C5 + cnt))
  else
    C2=$((C2 + cnt))
  fi
done

echo "CLIENTS_2G: $C2"
echo "CLIENTS_5G: $C5"

echo "DHCP_COUNT: $(
  if [ -f /tmp/dhcp.leases ]; then
    wc -l < /tmp/dhcp.leases
  elif [ -f /tmp/dnsmasq.leases ]; then
    wc -l < /tmp/dnsmasq.leases
  elif [ -f /var/run/dhcp.leases ]; then
    wc -l < /var/run/dhcp.leases
  else
    echo 0
  fi
)"
    `.trim();

    const res = await this.executeCommand(command);
    const lines = (res.stdout || '').split('\n');
    const map = new Map<string, string>();
    for (const line of lines) {
      const [key, ...val] = line.split(':');
      if (key && val) {
        map.set(key.trim(), val.join(':').trim());
      }
    }

    const uptimeSec = Math.floor(parseFloat(map.get('UPTIME')?.split(' ')[0] || '0'));
    const loadParts = (map.get('LOAD') || '0 0 0').split(' ');
    const loadAvg = `${loadParts[0] || '0'}, ${loadParts[1] || '0'}, ${loadParts[2] || '0'}`;
    const memTotalKb = parseInt(map.get('MEM_TOTAL') || '0', 10);
    const memFreeKb = parseInt(map.get('MEM_FREE') || '0', 10);
    const clients2g = parseInt(map.get('CLIENTS_2G') || '0', 10);
    const clients5g = parseInt(map.get('CLIENTS_5G') || '0', 10);
    const dhcpCount = parseInt(map.get('DHCP_COUNT') || '0', 10);

    return {
      uptimeSeconds: uptimeSec,
      loadAvg,
      memTotalMb: Math.round(memTotalKb / 1024),
      memFreeMb: Math.round(memFreeKb / 1024),
      clients2g,
      clients5g,
      totalClients: clients2g + clients5g,
      dhcpLeasesCount: dhcpCount,
    };
  }

  /**
   * Gathers all connected client devices (Wi-Fi stations + DHCP leases) with signal, band, IP, and MAC.
   */
  public async getConnectedClients(): Promise<ConnectedClientInfo[]> {
    if (this.config.mode === 'simulation') {
      return [
        {
          mac: '02:00:00:00:00:01',
          ip: '192.168.1.101',
          hostname: 'iPhone-ni-Juan',
          signalDbm: -52,
          band: '5GHz',
          interface: 'phy1-ap0',
          rxRateMbps: 433,
          txRateMbps: 390,
          connectedSeconds: 1420,
          isAuthorized: true,
        },
        {
          mac: '02:00:00:00:00:02',
          ip: '192.168.1.102',
          hostname: 'Galaxy-A54',
          signalDbm: -68,
          band: '2.4GHz',
          interface: 'phy0-ap0',
          rxRateMbps: 72,
          txRateMbps: 65,
          connectedSeconds: 850,
          isAuthorized: false,
        },
        {
          mac: '02:00:00:00:00:03',
          ip: '192.168.1.103',
          hostname: 'LAPTOP-MARCUS',
          signalDbm: -45,
          band: '5GHz',
          interface: 'phy1-ap0',
          rxRateMbps: 866,
          txRateMbps: 780,
          connectedSeconds: 3600,
          isVip: true,
        },
      ];
    }

    const command = `
echo "=== WIRELESS_IFACES ==="
IFACES=""
if command -v iw >/dev/null 2>&1; then
  IFACES="$(iw dev 2>/dev/null | awk '/Interface/ {print $2}')"
fi
if [ -z "$IFACES" ]; then
  for d in /sys/class/net/*/phy80211; do
    [ -d "$d" ] && IFACES="$IFACES $(basename "$(dirname "$d")")"
  done
fi
if [ -z "$IFACES" ] && command -v ubus >/dev/null 2>&1; then
  IFACES="$(ubus call network.wireless status 2>/dev/null | grep -o '"ifname": *"[^"]*"' | cut -d'"' -f4)"
fi
IFACES="$IFACES phy0-ap0 phy1-ap0 wlan0 wlan1"

SEEN=""
for iface in $IFACES; do
  [ -z "$iface" ] && continue
  [ ! -d "/sys/class/net/$iface" ] && continue
  case " $SEEN " in *" $iface "*) continue ;; esac
  SEEN="$SEEN $iface"

  band=""
  if command -v iw >/dev/null 2>&1; then
    info=$(iw dev "$iface" info 2>/dev/null)
    mhz=$(echo "$info" | grep -o '[0-9]\+ MHz' | head -n1 | cut -d' ' -f1)
    if [ -n "$mhz" ]; then
      if [ "$mhz" -lt 3000 ]; then band="2.4GHz"; fi
      if [ "$mhz" -ge 4900 ]; then band="5GHz"; fi
    fi
    if [ -z "$band" ]; then
      chan=$(echo "$info" | grep -o 'channel [0-9]\+' | head -n1 | cut -d' ' -f2)
      if [ -n "$chan" ]; then
        if [ "$chan" -le 14 ]; then band="2.4GHz"; fi
        if [ "$chan" -ge 36 ]; then band="5GHz"; fi
      fi
    fi
  fi
  if [ -z "$band" ] && command -v iwinfo >/dev/null 2>&1; then
    iw_out=$(iwinfo "$iface" info 2>/dev/null)
    if echo "$iw_out" | grep -iq '2\.[0-9]\+ GHz'; then band="2.4GHz"; fi
    if echo "$iw_out" | grep -iq '5\.[0-9]\+ GHz'; then band="5GHz"; fi
  fi
  if [ -z "$band" ]; then
    if echo "$iface" | grep -Eq 'phy1|radio1|wlan1|5g'; then
      band="5GHz"
    else
      band="2.4GHz"
    fi
  fi
  radio="radio0"
  [ "$band" = "5GHz" ] && radio="radio1"

  echo "IFACE:$iface:$band:$radio"
  if command -v iw >/dev/null 2>&1; then
    iw dev "$iface" station dump 2>/dev/null || true
  fi
  if command -v iwinfo >/dev/null 2>&1; then
    iwinfo "$iface" assoclist 2>/dev/null || true
  fi
  if command -v ubus >/dev/null 2>&1; then
    ubus call iwinfo assoclist "{\\"device\\":\\"$iface\\"}" 2>/dev/null || true
  fi
done

echo "=== DHCP_LEASES ==="
cat /tmp/dhcp.leases 2>/dev/null || cat /tmp/dnsmasq.leases 2>/dev/null || cat /var/run/dhcp.leases 2>/dev/null || true

echo "=== ARP_CACHE ==="
cat /proc/net/arp 2>/dev/null || true

echo "=== BRCTL_MACS ==="
brctl showmacs br-lan 2>/dev/null || true

echo "=== NFT_SETS ==="
nft list set inet piso_portal piso_auth 2>/dev/null || nft list set inet fw4 piso_auth 2>/dev/null || true
echo "--- WHITELIST ---"
nft list set inet piso_portal piso_whitelist 2>/dev/null || nft list set inet fw4 piso_whitelist 2>/dev/null || true
echo "--- BLACKLIST ---"
nft list set inet piso_portal piso_blacklist 2>/dev/null || nft list set inet fw4 piso_blacklist 2>/dev/null || true
    `.trim();

    const res = await this.executeCommand(command);
    const output = res.stdout || '';

    const clientsMap = new Map<string, ConnectedClientInfo>();

    // Parse sections
    const sections = output.split('=== ');
    let currentIface = '';
    let currentBand: '2.4GHz' | '5GHz' = '2.4GHz';

    for (const sec of sections) {
      if (sec.startsWith('WIRELESS_IFACES')) {
        const lines = sec.split('\n');
        let currentStation: ConnectedClientInfo | null = null;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('IFACE:')) {
            const parts = trimmed.split(':');
            currentIface = parts[1] || '';
            currentBand = (parts[2] as '2.4GHz' | '5GHz') || '2.4GHz';
            currentStation = null;
          } else {
            // 1. Check ubus JSON format: "mac": "F6:D8:EF:6D:8C:AB"
            const jsonMacMatch = trimmed.match(/"mac":\s*"([0-9a-fA-F:]{17})"/i);
            // 2. Check standard text format (iw dev: "Station fe:52:..." / iwinfo: "FE:52:... -43 dBm")
            const stationMatch = jsonMacMatch || trimmed.match(/^(?:Station\s+)?([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})/i);

            if (stationMatch && stationMatch[1]) {
              const mac = normalizeMac(stationMatch[1]);
              if (mac && mac.length === 17) {
                const existing = clientsMap.get(mac) || { mac };
                existing.band = currentBand;
                existing.interface = currentIface;

                // If iwinfo text output, parse signal on the header line
                const inlineSig = trimmed.match(/(-?[0-9]+)\s*dBm/i);
                if (inlineSig && inlineSig[1]) {
                  existing.signalDbm = parseInt(inlineSig[1], 10);
                }

                clientsMap.set(mac, existing as ConnectedClientInfo);
                currentStation = existing as ConnectedClientInfo;
              }
            } else if (currentStation) {
              // Parse JSON or station stats lines
              // Signal: "signal": -45 or "signal: -48 [-50, -52] dBm"
              const sigMatch = trimmed.match(/(?:"signal"|signal(?: avg)?):\s*(-?[0-9]+)/i);
              if (sigMatch && sigMatch[1] && currentStation.signalDbm === undefined) {
                currentStation.signalDbm = parseInt(sigMatch[1], 10);
              }

              // Bitrates: "rate": 390000 or "rx bitrate: 866.7 MBit/s"
              const jsonRateMatch = trimmed.match(/"rate":\s*([0-9]+)/i);
              if (jsonRateMatch && jsonRateMatch[1]) {
                const rateMbps = Math.round(parseInt(jsonRateMatch[1], 10) / 1000 * 10) / 10;
                if (!currentStation.rxRateMbps) currentStation.rxRateMbps = rateMbps;
                if (!currentStation.txRateMbps) currentStation.txRateMbps = rateMbps;
              }

              const rxMatch = trimmed.match(/(?:rx bitrate|RX):\s*([0-9.]+)\s*MBit/i);
              if (rxMatch && rxMatch[1]) {
                currentStation.rxRateMbps = parseFloat(rxMatch[1]);
              }

              const txMatch = trimmed.match(/(?:tx bitrate|TX):\s*([0-9.]+)\s*MBit/i);
              if (txMatch && txMatch[1]) {
                currentStation.txRateMbps = parseFloat(txMatch[1]);
              }

              const connMatch = trimmed.match(/(?:"connected_time"|connected time):\s*([0-9]+)/i);
              if (connMatch && connMatch[1]) {
                currentStation.connectedSeconds = parseInt(connMatch[1], 10);
              }
            }
          }
        }
      } else if (sec.startsWith('DHCP_LEASES')) {
        const lines = sec.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          // format: <timestamp> <mac> <ip> <hostname> <client_id>
          if (parts.length >= 3 && parts[1] && parts[2]) {
            const mac = normalizeMac(parts[1]);
            const ip = parts[2];
            const rawHostname = parts[3];
            const hostname = rawHostname && rawHostname !== '*' ? rawHostname : undefined;
            if (mac && mac.length === 17) {
              const client = clientsMap.get(mac);
              if (client) {
                if (!client.ip) client.ip = ip;
                if (!client.hostname && hostname) client.hostname = hostname;
              } else {
                clientsMap.set(mac, {
                  mac,
                  ip,
                  hostname,
                  band: 'LAN',
                  isAuthorized: this.authorizedMacs.has(mac),
                });
              }
            }
          }
        }
      } else if (sec.startsWith('ARP_CACHE')) {
        const lines = sec.split('\n');
        for (const line of lines) {
          // IP address HW type Flags HW address Mask Device
          // 192.168.1.101 0x1 0x2 fe:52:92:e2:84:f1 * br-lan
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4 && parts[0] && parts[0].match(/^\d+\.\d+\.\d+\.\d+$/)) {
            const ip = parts[0];
            const mac = normalizeMac(parts[3] || '');
            if (mac && mac.length === 17 && mac !== '00:00:00:00:00:00') {
              const client = clientsMap.get(mac);
              if (client && !client.ip) {
                client.ip = ip;
              }
            }
          }
        }
      } else if (sec.startsWith('BRCTL_MACS')) {
        const lines = sec.split('\n');
        for (const line of lines) {
          // port no mac addr is local? ageing timer
          //   5   f6:d8:ef:6d:8c:ab  no       0.12
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const portNo = parts[0];
            const rawMac = parts[1];
            const isLocal = parts[2] === 'yes';
            if (!isLocal && rawMac) {
              const mac = normalizeMac(rawMac);
              if (mac && mac.length === 17) {
                const client = clientsMap.get(mac);
                const inferredBand: '2.4GHz' | '5GHz' | undefined =
                  portNo === '4' ? '2.4GHz' : portNo === '5' ? '5GHz' : undefined;
                if (client) {
                  if (inferredBand && (!client.band || client.band === 'LAN')) {
                    client.band = inferredBand;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Enrich hostnames and check auth/whitelist/blacklist
    for (const client of clientsMap.values()) {
      if (!client.hostname) {
        const guess = guessDeviceVendor(client.mac);
        if (guess) {
          client.hostname = guess;
        } else if (client.band === '5GHz') {
          client.hostname = '5GHz Wi-Fi Device';
        } else if (client.band === '2.4GHz') {
          client.hostname = '2.4GHz Wi-Fi Device';
        } else {
          client.hostname = 'Ethernet / LAN Device';
        }
      }

      // Check session authorized state
      if (this.authorizedMacs.has(client.mac)) {
        client.isAuthorized = true;
      }

      // Check NFT sets for auth, whitelist, blacklist
      if (output.includes(client.mac)) {
        if (output.indexOf('piso_auth') !== -1) {
          const authSec = output.slice(output.indexOf('piso_auth'), output.indexOf('--- WHITELIST ---'));
          if (authSec.includes(client.mac)) {
            client.isAuthorized = true;
          }
        }
        if (output.indexOf('--- WHITELIST ---') !== -1) {
          const wlSec = output.slice(output.indexOf('--- WHITELIST ---'), output.indexOf('--- BLACKLIST ---'));
          if (wlSec.includes(client.mac)) {
            client.isVip = true;
          }
        }
        if (output.indexOf('--- BLACKLIST ---') !== -1) {
          const blSec = output.slice(output.indexOf('--- BLACKLIST ---'));
          if (blSec.includes(client.mac)) {
            client.isBlacklisted = true;
          }
        }
      }
    }

    return Array.from(clientsMap.values());
  }

  /**
   * Adds a MAC address to VIP Whitelist for permanent free access.
   */
  public async addWhitelist(rawMac: string, ipHint?: string): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);
    if (!mac || mac.length !== 17) return { success: false, error: 'Invalid MAC address' };

    if (this.config.mode === 'simulation') {
      console.log(`[SIMULATOR] Whitelisted MAC: ${mac}`);
      return { success: true };
    }

    const command = `
nft add element inet piso piso_whitelist { ${mac} } 2>/dev/null || nft add element inet piso_portal piso_whitelist { ${mac} } 2>/dev/null || nft add element inet fw4 piso_whitelist { ${mac} } 2>/dev/null || true
touch /etc/config/piso_devices 2>/dev/null || true
uci -q get piso_devices.whitelist >/dev/null || uci set piso_devices.whitelist=devices 2>/dev/null || true
uci add_list piso_devices.whitelist.mac="${mac}" 2>/dev/null || true
uci commit piso_devices 2>/dev/null || true
# Flush any active conntrack DNAT mappings for the client so internet works immediately
${ipHint ? `which conntrack >/dev/null 2>&1 && (conntrack -D -s ${ipHint} 2>/dev/null || conntrack -D -d ${ipHint} 2>/dev/null) || true` : ''}
which conntrack >/dev/null 2>&1 && conntrack -D -m ${mac} 2>/dev/null || true
    `.trim();

    const res = await this.executeCommand(command);
    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Removes a MAC address from VIP Whitelist.
   */
  public async removeWhitelist(rawMac: string): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);
    if (!mac) return { success: false, error: 'Invalid MAC address' };

    if (this.config.mode === 'simulation') {
      return { success: true };
    }

    const command = `
nft delete element inet piso piso_whitelist { ${mac} } 2>/dev/null || nft delete element inet piso_portal piso_whitelist { ${mac} } 2>/dev/null || nft delete element inet fw4 piso_whitelist { ${mac} } 2>/dev/null || true
uci del_list piso_devices.whitelist.mac="${mac}" 2>/dev/null || true
uci commit piso_devices 2>/dev/null || true
    `.trim();

    const res = await this.executeCommand(command);
    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Adds a MAC address to Blacklist to block it completely and kills existing connections.
   */
  public async addBlacklist(rawMac: string): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);
    if (!mac || mac.length !== 17) return { success: false, error: 'Invalid MAC address' };

    // Deauthorize immediately if active
    await this.deauthorize(mac);

    if (this.config.mode === 'simulation') {
      console.log(`[SIMULATOR] Blacklisted MAC: ${mac}`);
      return { success: true };
    }

    const command = `
nft add element inet piso piso_blacklist { ${mac} } 2>/dev/null || nft add element inet piso_portal piso_blacklist { ${mac} } 2>/dev/null || nft add element inet fw4 piso_blacklist { ${mac} } 2>/dev/null || true
touch /etc/config/piso_devices 2>/dev/null || true
uci -q get piso_devices.blacklist >/dev/null || uci set piso_devices.blacklist=devices 2>/dev/null || true
uci add_list piso_devices.blacklist.mac="${mac}" 2>/dev/null || true
uci commit piso_devices 2>/dev/null || true
# Flush active conntrack states for blocked client
which conntrack >/dev/null 2>&1 && conntrack -D -m ${mac} 2>/dev/null || true
    `.trim();

    const res = await this.executeCommand(command);
    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Removes a MAC address from Blacklist.
   */
  public async removeBlacklist(rawMac: string): Promise<{ success: boolean; error?: string }> {
    const mac = normalizeMac(rawMac);
    if (!mac) return { success: false, error: 'Invalid MAC address' };

    if (this.config.mode === 'simulation') {
      return { success: true };
    }

    const command = `
nft delete element inet piso piso_blacklist { ${mac} } 2>/dev/null || nft delete element inet piso_portal piso_blacklist { ${mac} } 2>/dev/null || nft delete element inet fw4 piso_blacklist { ${mac} } 2>/dev/null || true
uci del_list piso_devices.blacklist.mac="${mac}" 2>/dev/null || true
uci commit piso_devices 2>/dev/null || true
    `.trim();

    const res = await this.executeCommand(command);
    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Bulk syncs Whitelist and Blacklist sets to OpenWrt router.
   */
  public async syncDeviceRules(whitelist: string[], blacklist: string[]): Promise<void> {
    console.log(`[ROUTER RULES] Syncing ${whitelist.length} whitelisted and ${blacklist.length} blacklisted MACs to ${this.config.host}...`);

    if (this.config.mode === 'simulation') {
      console.log('[SIMULATOR] Device rules synchronized successfully');
      return;
    }

    const cleanWhite = whitelist.map(normalizeMac).filter((m) => m && m.length === 17);
    const cleanBlack = blacklist.map(normalizeMac).filter((m) => m && m.length === 17);

    const cmds: string[] = [
      'nft flush set inet piso_portal piso_whitelist 2>/dev/null || true',
      'nft flush set inet piso_portal piso_blacklist 2>/dev/null || true',
      'touch /etc/config/piso_devices 2>/dev/null || true',
      'uci -q delete piso_devices.whitelist 2>/dev/null || true',
      'uci -q delete piso_devices.blacklist 2>/dev/null || true',
      'uci set piso_devices.whitelist=devices 2>/dev/null || true',
      'uci set piso_devices.blacklist=devices 2>/dev/null || true',
    ];

    if (cleanWhite.length > 0) {
      cmds.push(`nft add element inet piso_portal piso_whitelist { ${cleanWhite.join(', ')} } 2>/dev/null || true`);
      for (const w of cleanWhite) {
        cmds.push(`uci add_list piso_devices.whitelist.mac="${w}" 2>/dev/null || true`);
      }
    }

    if (cleanBlack.length > 0) {
      cmds.push(`nft add element inet piso_portal piso_blacklist { ${cleanBlack.join(', ')} } 2>/dev/null || true`);
      for (const b of cleanBlack) {
        cmds.push(`uci add_list piso_devices.blacklist.mac="${b}" 2>/dev/null || true`);
      }
    }

    cmds.push('uci commit piso_devices 2>/dev/null || true');

    await this.executeCommand(cmds.join(' && '));
  }

  /**
   * Gets current state of OpenWrt firewall sets (whitelist, blacklist, authorized).
   */
  public async getDeviceRulesStatus(): Promise<DeviceRulesStatus> {
    if (this.config.mode === 'simulation') {
      return {
        whitelist: ['02:00:00:00:00:03'],
        blacklist: [],
        authorized: Array.from(this.authorizedMacs),
      };
    }

    const command = `
echo "=== AUTH ==="
nft list set inet piso_portal piso_auth 2>/dev/null || nft list set inet fw4 piso_auth 2>/dev/null || true
echo "=== WHITELIST ==="
nft list set inet piso_portal piso_whitelist 2>/dev/null || nft list set inet fw4 piso_whitelist 2>/dev/null || true
echo "=== BLACKLIST ==="
nft list set inet piso_portal piso_blacklist 2>/dev/null || nft list set inet fw4 piso_blacklist 2>/dev/null || true
    `.trim();

    const res = await this.executeCommand(command);
    const text = res.stdout || '';

    const parseMacsFromSection = (sectionText: string): string[] => {
      const matches = sectionText.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/gi) || [];
      return Array.from(new Set(matches.map(normalizeMac)));
    };

    const authPart = text.split('=== AUTH ===')[1]?.split('=== WHITELIST ===')[0] || '';
    const whitePart = text.split('=== WHITELIST ===')[1]?.split('=== BLACKLIST ===')[0] || '';
    const blackPart = text.split('=== BLACKLIST ===')[1] || '';

    return {
      authorized: parseMacsFromSection(authPart),
      whitelist: parseMacsFromSection(whitePart),
      blacklist: parseMacsFromSection(blackPart),
    };
  }

  /**
   * Applies bandwidth rate-limiting / QoS directly to OpenWrt LAN (br-lan) and WAN interface.
   */
  public async applySpeedLimit(downloadMbps: number, uploadMbps: number): Promise<{ success: boolean; error?: string }> {
    const downMbit = Math.max(0, Math.round(downloadMbps));
    const upMbit = Math.max(0, Math.round(uploadMbps));

    console.log(`[ROUTER QoS] Configuring Speed Limiter: ${downMbit} Mbps Down / ${upMbit} Mbps Up on ${this.config.host}`);

    if (this.config.mode === 'simulation') {
      return { success: true };
    }

    const command = `
# 1. Disable firewall flow offloading so traffic control is not bypassed
uci set firewall.@defaults[0].flow_offloading='0' 2>/dev/null || true
uci set firewall.@defaults[0].flow_offloading_hw='0' 2>/dev/null || true
uci commit firewall 2>/dev/null || true

# 2. Discover active WAN interface dynamically
WAN_IF=$(uci -q get network.wan.device || uci -q get network.wan.ifname || ip route show default 2>/dev/null | awk '{print $5}' || echo "wan")

# 3. Apply Traffic Control rules
if [ "${downMbit}" -le 0 ] && [ "${upMbit}" -le 0 ]; then
  # Unlimited mode: Clear qdiscs
  tc qdisc del dev br-lan root 2>/dev/null || true
  [ -n "$WAN_IF" ] && tc qdisc del dev "$WAN_IF" root 2>/dev/null || true
  echo "QOS_CLEARED"
else
  # Download Limiting (Egress on br-lan to clients)
  if [ "${downMbit}" -gt 0 ]; then
    tc qdisc del dev br-lan root 2>/dev/null || true
    tc qdisc add dev br-lan root cake bandwidth ${downMbit}mbit 2>/dev/null || \
    tc qdisc add dev br-lan root handle 1: tbf rate ${downMbit}mbit burst 64kb latency 50ms 2>/dev/null || \
    tc qdisc add dev br-lan root handle 1: fq_codel 2>/dev/null || true
  fi

  # Upload Limiting (Egress on WAN interface to internet)
  if [ "${upMbit}" -gt 0 ] && [ -n "$WAN_IF" ]; then
    tc qdisc del dev "$WAN_IF" root 2>/dev/null || true
    tc qdisc add dev "$WAN_IF" root cake bandwidth ${upMbit}mbit 2>/dev/null || \
    tc qdisc add dev "$WAN_IF" root handle 1: tbf rate ${upMbit}mbit burst 64kb latency 50ms 2>/dev/null || true
  fi

  echo "QOS_APPLIED: DOWN=${downMbit}M UP=${upMbit}M WAN=$WAN_IF"
fi
    `.trim();

    const res = await this.executeCommand(command);

    if (res.code !== 0) {
      console.warn('[ROUTER QoS WARNING] QoS command returned non-zero code:', res.stderr);
    }

    return { success: res.code === 0, error: res.code === 0 ? undefined : res.stderr };
  }

  /**
   * Gets live OpenWrt Traffic Control (QoS) status.
   */
  public async getQoSStatus(): Promise<QoSStatus> {
    if (this.config.mode === 'simulation') {
      return {
        active: true,
        downloadMbps: 25,
        uploadMbps: 10,
        lanInterface: 'br-lan',
        wanInterface: 'wan',
        details: 'Simulated CAKE / TBF QoS active on br-lan and wan',
      };
    }

    const command = `
WAN_IF=$(uci -q get network.wan.device || uci -q get network.wan.ifname || ip route show default 2>/dev/null | awk '{print $5}' || echo "wan")
echo "=== LAN_QDISC ==="
tc -s qdisc show dev br-lan 2>/dev/null || true
echo "=== WAN_QDISC ==="
[ -n "$WAN_IF" ] && tc -s qdisc show dev "$WAN_IF" 2>/dev/null || true
echo "=== WAN_IF ==="
echo "$WAN_IF"
    `.trim();

    const res = await this.executeCommand(command);
    const output = res.stdout || '';

    const hasLanQos = output.includes('cake') || output.includes('tbf') || output.includes('fq_codel');
    const wanIf = output.split('=== WAN_IF ===')[1]?.trim() || 'wan';

    // Parse download rate if available
    let downMbps = 0;
    const downMatch = output.match(/rate\s+([0-9]+)Mbit/i) || output.match(/bandwidth\s+([0-9]+)Mbit/i);
    if (downMatch && downMatch[1]) downMbps = parseInt(downMatch[1], 10);

    return {
      active: hasLanQos,
      downloadMbps: downMbps,
      uploadMbps: 0,
      lanInterface: 'br-lan',
      wanInterface: wanIf,
      details: output.replace(/=== [A-Z_]+ ===/g, '').trim(),
    };
  }

  /**
   * Reads all active DHCP leases from OpenWrt to get MACs, IPs, and hostnames/device names.
   */
  public async getDhcpLeases(): Promise<Array<{ mac: string; ip: string; hostname?: string }>> {
    if (this.config.mode === 'simulation') {
      return [
        { mac: '02:00:00:00:00:01', ip: '192.168.1.101', hostname: 'iPhone-ni-Juan' },
        { mac: '02:00:00:00:00:02', ip: '192.168.1.102', hostname: 'Galaxy-A54' },
        { mac: '02:00:00:00:00:03', ip: '192.168.1.103', hostname: 'LAPTOP-MARCUS' },
      ];
    }

    const command = 'cat /tmp/dhcp.leases 2>/dev/null || cat /tmp/dnsmasq.leases 2>/dev/null || cat /var/run/dhcp.leases 2>/dev/null || true';
    const res = await this.executeCommand(command);
    const lines = (res.stdout || '').split('\n');
    const leases: Array<{ mac: string; ip: string; hostname?: string }> = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && parts[1]) {
        const mac = normalizeMac(parts[1]);
        const ip = parts[2];
        const rawHostname = parts[3];
        const hostname = rawHostname && rawHostname !== '*' ? rawHostname : undefined;
        if (mac && ip) {
          leases.push({ mac, ip, hostname });
        }
      }
    }

    return leases;
  }

  /**
   * Updates OpenWrt dnsmasq to resolve a custom local domain (e.g. wifi.local or pisowifi.net)
   * to the captive portal IP, and updates DHCP option 114/160 for RFC captive discovery.
   */
  public async setPortalDns(
    domain: string,
    portalIp: string,
    routerIp?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.config.mode === 'simulation') {
      console.log(`[SIMULATOR] setPortalDns: Domain="${domain}" -> Portal="${portalIp}" (Gateway="${routerIp || this.config.host}")`);
      return { success: true };
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const cleanPortalIp = portalIp.trim();
    if (!cleanDomain || !cleanPortalIp) {
      return { success: false, error: 'Domain and Portal IP must not be empty' };
    }

    const command = `
uci -q delete dhcp.piso_domain
uci set dhcp.piso_domain=domain
uci set dhcp.piso_domain.name="${cleanDomain}"
uci set dhcp.piso_domain.ip="${cleanPortalIp}"

# Add wildcard address mapping & allow rebind
uci -q del_list dhcp.@dnsmasq[0].address="/${cleanDomain}/${cleanPortalIp}"
uci add_list dhcp.@dnsmasq[0].address="/${cleanDomain}/${cleanPortalIp}"
uci -q del_list dhcp.@dnsmasq[0].rebind_domain="${cleanDomain}"
uci add_list dhcp.@dnsmasq[0].rebind_domain="${cleanDomain}"

# Update /etc/hosts for bulletproof local resolution (overrides RFC 6761 null sinks)
grep -q "${cleanDomain}" /etc/hosts 2>/dev/null || echo "${cleanPortalIp} ${cleanDomain}" >> /etc/hosts
sed -i "s/.*${cleanDomain}.*/${cleanPortalIp} ${cleanDomain}/" /etc/hosts 2>/dev/null || true

# Captive Portal RFC 8908/7710 discovery
uci -q delete dhcp.lan.dhcp_option
uci add_list dhcp.lan.dhcp_option="114,http://${cleanDomain}:3000/"
uci add_list dhcp.lan.dhcp_option="160,http://${cleanDomain}:3000/"

uci commit dhcp
/etc/init.d/dnsmasq restart 2>/dev/null || true
echo "DNS_OK"
    `.trim();

    const res = await this.executeCommand(command);
    if (res.code === 0 && (res.stdout.includes('DNS_OK') || !res.stderr)) {
      return { success: true };
    }
    return { success: res.code === 0, error: res.stderr || undefined };
  }
}


