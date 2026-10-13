import { NextRequest, NextResponse } from 'next/server';
import { isClientAuthenticated } from '@/lib/auth-check';
import { setDaemonWhitelist, authorizeClientMac, deauthorizeClientMac } from '@/lib/daemon';
import { getPortalRedirectUrl } from '@/lib/portal-url';

/**
 * Universal Catch-All Captive Portal Probe Handler
 * Catches all unmatched requests (e.g., arbitrary hostnames like captive.apple.com,
 * connectivitycheck.gstatic.com, or random browser URL probes when intercepted by OpenWrt redirect).
 */
export async function GET(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const host = (request.headers.get('host') || '').toLowerCase();
  const path = request.nextUrl.pathname.toLowerCase();
  const portalUrl = await getPortalRedirectUrl(request.headers.get('host'));
  const { isAuthenticated, isVip, macAddress, remainingSeconds } = await isClientAuthenticated(ip);

  // Proactively re-assert VIP status on OpenWrt firewall if a probe hits the portal
  if (isVip && macAddress) {
    setDaemonWhitelist(macAddress, 'add', ip).catch(() => {});
  }

  // If client has an active session and hit this probe handler, OpenWrt firewall
  // must have lost the authorization entry (e.g. router rebooted or firewall reloaded).
  // Immediately re-assert access on the OpenWrt router:
  if (isAuthenticated && macAddress && remainingSeconds > 0) {
    authorizeClientMac(macAddress, Math.ceil(remainingSeconds / 60), ip).catch(() => {});
  }

  // If user is authenticated, return standard OS Success signals so captive popups close:
  if (isAuthenticated) {
    // Apple iOS / macOS CNA Captive Probe
    if (
      host.includes('apple.com') ||
      host.includes('airport.us') ||
      host.includes('ibook.info') ||
      path.includes('hotspot-detect') ||
      path.includes('success.html')
    ) {
      return new NextResponse('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Microsoft Windows NCSI Captive Probe
    if (
      host.includes('msftconnecttest') ||
      host.includes('msftncsi') ||
      path.includes('connecttest') ||
      path.includes('ncsi')
    ) {
      const responseText = path.includes('ncsi') ? 'Microsoft NCSI' : 'Microsoft Connect Test';
      return new NextResponse(responseText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Android / ChromeOS / Google / OPPO / Realme / Vivo / Xiaomi / Samsung / Transsion Captive Probes
    // ALL Android devices require HTTP 204 (No Content) to confirm active internet and suppress captive popups.
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  // Unauthenticated: Redirect directly to the landing page
  return NextResponse.redirect(portalUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

export async function HEAD(request: NextRequest) {
  return GET(request);
}
