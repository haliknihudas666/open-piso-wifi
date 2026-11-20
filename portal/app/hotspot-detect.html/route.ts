import { NextRequest, NextResponse } from 'next/server';
import { isClientAuthenticated } from '@/lib/auth-check';
import { setDaemonWhitelist, authorizeClientMac } from '@/lib/daemon';
import { getPortalRedirectUrl } from '@/lib/portal-url';
import { getTrustedClientIp } from '@/lib/client-ip';

/**
 * Apple iOS / macOS Captive Portal Probe Handler
 * Apple devices query /hotspot-detect.html.
 * - If authenticated: Return HTML with "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>".
 * - If unauthenticated: Return 302 Redirect to Portal URL.
 */
export async function GET(request: NextRequest) {
  const ip = getTrustedClientIp(request);

  const portalUrl = await getPortalRedirectUrl(request.headers.get('host'));
  const { isAuthenticated, isVip, macAddress, remainingSeconds, deviceName, notes } = await isClientAuthenticated(ip);

  if (isVip && macAddress) {
    setDaemonWhitelist(macAddress, 'add', ip, { name: deviceName, notes, notify: true }).catch(() => {});
  } else if (isAuthenticated && macAddress && remainingSeconds > 0) {
    // If client has an active session and hit this probe handler, OpenWrt firewall
    // must have lost the authorization entry. Re-assert access on router without charging or telegram spam:
    authorizeClientMac(macAddress, Math.ceil(remainingSeconds / 60), ip, { isNewSession: false, notify: false, amount: 0 }).catch(() => {});
  }

  if (isAuthenticated) {
    return new NextResponse('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  return NextResponse.redirect(portalUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
