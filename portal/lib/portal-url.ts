import { prisma } from './prisma';

let cachedDomain: string | null = null;
let cachedIp: string | null = null;
let cachedPort: string | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 5000;

export async function getPortalSettings(): Promise<{
  domain: string;
  ip: string;
  port: string;
}> {
  const now = Date.now();
  if (cachedDomain && cachedIp && now - lastFetch < CACHE_TTL_MS) {
    return {
      domain: cachedDomain,
      ip: cachedIp,
      port: cachedPort || process.env.PORTAL_PORT || process.env.PORT || '3000',
    };
  }

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['portal_domain', 'portal_ip', 'portal_port'] },
      },
    });

    const map = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
    cachedDomain = map.get('portal_domain') || process.env.PORTAL_DOMAIN || 'wifi.local';
    cachedIp = map.get('portal_ip') || process.env.PORTAL_IP || '192.168.1.240';
    cachedPort = map.get('portal_port') || process.env.PORTAL_PORT || process.env.PORT || '3000';
    lastFetch = now;
  } catch {
    cachedDomain = process.env.PORTAL_DOMAIN || 'wifi.local';
    cachedIp = process.env.PORTAL_IP || '192.168.1.240';
    cachedPort = process.env.PORTAL_PORT || process.env.PORT || '3000';
  }

  return {
    domain: cachedDomain || 'wifi.local',
    ip: cachedIp || '192.168.1.240',
    port: cachedPort || '3000',
  };
}

/**
 * Returns the primary URL to redirect unauthenticated or probe requests to.
 * Prioritizes mobile-friendly shortcut (http://10.0.0.1/) when domain is .local
 * to prevent Apple mDNS RFC 6762 resolution timeouts.
 */
export async function getPortalRedirectUrl(requestHost?: string | null): Promise<string> {
  const { domain, ip, port } = await getPortalSettings();

  // If the incoming request explicitly accessed via domain (non-.local) or direct IP, keep that host
  if (requestHost) {
    const cleanReqHost = requestHost.split(':')[0].toLowerCase();
    if (cleanReqHost === domain.toLowerCase() && !cleanReqHost.endsWith('.local')) {
      return port === '80' ? `http://${cleanReqHost}/` : `http://${cleanReqHost}:${port}/`;
    }
    if (cleanReqHost === ip) {
      return port === '80' ? `http://${cleanReqHost}/` : `http://${cleanReqHost}:${port}/`;
    }
  }

  // If domain is not configured, ends with .local (which fails on Apple devices due to mDNS RFC 6762),
  // or is the 10.0.0.1 shortcut (which would cause NAT masquerade to mask the real client MAC),
  // redirect captive probes to the direct portal IP (e.g. http://192.168.1.240:3000/) so that:
  // 1. Apple CNA modals pop up instantly without DNS/mDNS resolution delays.
  // 2. The connection is direct Layer 2, allowing the portal to detect the client's real MAC address!
  if (!domain || domain.toLowerCase().endsWith('.local') || domain === '10.0.0.1') {
    return port === '80' ? `http://${ip}/` : `http://${ip}:${port}/`;
  }

  return port === '80' ? `http://${domain}/` : `http://${domain}:${port}/`;
}
