import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { lookupRemoteArp } from './daemon';

const execFileAsync = promisify(execFile);

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
 * Strictly validates and cleans an IPv4 address (stripping ::ffff: IPv6-mapped prefix).
 * Returns '' if no valid IPv4 (0-255 octets, no shell metacharacters) matches.
 */
export function cleanIpv4(ip: string): string {
  if (!ip || typeof ip !== 'string') return '';
  const candidate = ip.trim().replace(/^::ffff:/i, '');
  const match = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return '';

  for (let i = 1; i <= 4; i++) {
    const octetStr = match[i];
    const octet = Number(octetStr);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255 || String(octet) !== octetStr) {
      return '';
    }
  }
  return candidate;
}

/**
 * Validates whether a string is a valid MAC address
 */
export function isValidMac(mac: string): boolean {
  if (!mac || typeof mac !== 'string') return false;
  const regex = /^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/i;
  return regex.test(mac.trim());
}

/**
 * Checks whether a MAC address has the IEEE 802.11 locally administered (randomized) bit set.
 * Bit 1 (0x02) of the first octet is 1 for randomized / locally administered MACs.
 */
export function isRandomizedMac(mac: string): boolean {
  if (!mac || typeof mac !== 'string') return false;
  const norm = normalizeMac(mac);
  if (!isValidMac(norm)) return false;
  const firstOctet = parseInt(norm.slice(0, 2), 16);
  if (Number.isNaN(firstOctet)) return false;
  return (firstOctet & 0x02) !== 0;
}

/**
 * Extracts client MAC address from an IP address or request hints.
 *
 * 3-Tier Multi-Layer Resolution Strategy for OpenWrt Router Architecture:
 * 1. Read `/proc/net/arp` (Raspberry Pi Layer 2 ARP Cache)
 * 2. Linux `ip neigh show <ip>` via execFile (no shell)
 * 3. Query OpenWrt Router via Daemon `/api/router/arp?ip=...`
 * 4. Linux/Unix `arp -n <ip>` or Windows `arp -a <ip>` via execFile (no shell)
 * 5. Mock MAC generation in non-production dev mode.
 */
export async function getMacFromIp(ip: string, explicitMacHint?: string | null): Promise<string | null> {
  // If an explicit MAC was passed (only when caller permits hint)
  if (explicitMacHint && isValidMac(explicitMacHint)) {
    return normalizeMac(explicitMacHint);
  }

  const trimmedIp = typeof ip === 'string' ? ip.trim() : '';
  if ((trimmedIp === '::1' || trimmedIp.toLowerCase() === 'localhost') && process.env.NODE_ENV !== 'production') {
    return '02:00:00:00:00:01';
  }

  const cleanIp = cleanIpv4(trimmedIp);
  if (!cleanIp || cleanIp === '0.0.0.0') {
    return null;
  }

  // Guard: Never identify the router gateway itself or 10.0.0.1 masquerade alias as a captive client
  const routerIp = cleanIpv4(process.env.ROUTER_IP || '192.168.1.1');
  if ((routerIp && cleanIp === routerIp) || cleanIp === '10.0.0.1') {
    return null;
  }

  // Local loopback testing fallback
  if (cleanIp === '127.0.0.1') {
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

  // 2. Linux `ip neigh show` command (execFile, no shell)
  try {
    const { stdout } = await execFileAsync('ip', ['neigh', 'show', cleanIp], { timeout: 2000 });
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

  // 4. Linux/Unix `arp -n <ip>` (execFile, no shell)
  try {
    const { stdout } = await execFileAsync('arp', ['-n', cleanIp], { timeout: 2000 });
    const match = stdout.match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i);
    if (match && match[1]) {
      return normalizeMac(match[1]);
    }
  } catch {
    // Continue to next fallback
  }

  // 5. Windows Development `arp -a <ip>` fallback (execFile, no shell)
  try {
    const { stdout } = await execFileAsync('arp', ['-a', cleanIp], { timeout: 2000 });
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
