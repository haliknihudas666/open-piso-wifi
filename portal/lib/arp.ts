import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { lookupRemoteArp } from './daemon';

const execAsync = promisify(exec);

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
 * Extracts and cleans a pure IPv4 address from any input (stripping IPv6 mapped ::ffff: prefixes)
 */
export function cleanIpv4(ip: string): string {
  if (!ip) return '127.0.0.1';
  const match = ip.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
  if (match) {
    return match[0];
  }
  return ip.replace(/^.*:/, '').trim() || '127.0.0.1';
}

/**
 * Validates whether a string is a valid MAC address
 */
export function isValidMac(mac: string): boolean {
  const regex = /^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/i;
  return regex.test(mac);
}

/**
 * Extracts client MAC address from an IP address or request hints.
 * 
 * 3-Tier Multi-Layer Resolution Strategy for OpenWrt Router Architecture:
 * 1. Read `/proc/net/arp` (Raspberry Pi Layer 2 ARP Cache) - When RPi is plugged into
 *    OpenWrt LAN port (192.168.1.240), all bridged Wi-Fi client packets arriving at RPi
 *    retain the client's Layer 2 MAC address in the kernel table.
 * 2. Linux `ip neigh show <ip>` or `arp -n <ip>` fallback.
 * 3. Query OpenWrt Router (`192.168.1.1`) directly via Daemon `/api/router/arp?ip=...`
 *    which inspects OpenWrt `/proc/net/arp` and `/tmp/dhcp.leases`.
 * 4. Windows Development `arp -a <ip>` fallback.
 * 5. Mock MAC generation in non-production dev mode.
 */
export async function getMacFromIp(ip: string, explicitMacHint?: string | null): Promise<string | null> {
  // If an explicit MAC was passed (e.g. from OpenWrt redirect query parameters ?mac=...)
  if (explicitMacHint && isValidMac(explicitMacHint)) {
    return normalizeMac(explicitMacHint);
  }

  const cleanIp = cleanIpv4(ip);

  // Guard: Never identify the router gateway itself or 10.0.0.1 masquerade alias as a captive client
  const routerIp = cleanIpv4(process.env.ROUTER_IP || '192.168.1.1');
  if (cleanIp === routerIp || cleanIp === '10.0.0.1') {
    return null;
  }

  // Local loopback testing fallback
  if (cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp === '::1' || cleanIp === '') {
    if (process.env.NODE_ENV !== 'production') {
      return '02:00:00:00:00:01';
    }
    return null;
  }

  // 1. High-Performance Linux Kernel ARP Cache lookup (/proc/net/arp on RPi)
  try {
    if (fs.existsSync('/proc/net/arp')) {
      const arpData = fs.readFileSync('/proc/net/arp', 'utf-8');
      const lines = arpData.split('\n');
      // Format: IP address  HW type  Flags  HW address  Mask  Device
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 4) {
          const entryIp = parts[0];
          const entryMac = parts[3];
          const flags = parts[2];

          // 0x2 means completed/valid ARP entry (0x0 is incomplete)
          if (entryIp === cleanIp && entryMac && entryMac !== '00:00:00:00:00:00' && flags !== '0x0') {
            return normalizeMac(entryMac);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not read /proc/net/arp:', err);
  }

  // 2. Linux `ip neigh show` command
  try {
    const { stdout } = await execAsync(`ip neigh show ${cleanIp}`);
    const match = stdout.match(/lladdr\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i);
    if (match && match[1]) {
      return normalizeMac(match[1]);
    }
  } catch {
    // Continue to next fallback
  }

  // 3. Query OpenWrt Router DHCP/ARP Table via Daemon
  try {
    const routerMac = await lookupRemoteArp(cleanIp);
    if (routerMac && isValidMac(routerMac)) {
      return normalizeMac(routerMac);
    }
  } catch {
    // Continue to next fallback
  }

  // 4. Linux/Unix `arp -n <ip>`
  try {
    const { stdout } = await execAsync(`arp -n ${cleanIp}`);
    const match = stdout.match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i);
    if (match && match[1]) {
      return normalizeMac(match[1]);
    }
  } catch {
    // Continue to next fallback
  }

  // 5. Windows Development `arp -a <ip>` fallback
  try {
    const { stdout } = await execAsync(`arp -a ${cleanIp}`);
    const match = stdout.match(/([0-9a-f]{2}(?:-[0-9a-f]{2}){5})/i);
    if (match && match[1]) {
      return normalizeMac(match[1]);
    }
  } catch {
    // Continue to next fallback
  }

  // In development mode, generate a mock MAC based on IP hash so dev testing works seamlessly
  if (process.env.NODE_ENV !== 'production') {
    const lastOctet = cleanIp.split('.').pop() || '1';
    const hex = parseInt(lastOctet, 10).toString(16).padStart(2, '0');
    return `02:00:00:00:00:${hex}`;
  }

  return null;
}
