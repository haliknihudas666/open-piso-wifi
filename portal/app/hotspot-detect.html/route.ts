import { NextRequest, NextResponse } from 'next/server';
import { isClientAuthenticated } from '@/lib/auth-check';
import { setDaemonWhitelist, authorizeClientMac, deauthorizeClientMac } from '@/lib/daemon';
import { getPortalRedirectUrl } from '@/lib/portal-url';

/**
 * Apple iOS / macOS Captive Portal Probe Handler
 * Apple devices query /hotspot-detect.html.
 * - If authenticated: Return HTML with "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>".
 * - If unauthenticated: Return 302 Redirect to Portal URL.
 */
export async function GET(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const portalUrl = await getPortalRedirectUrl(request.headers.get('host'));
  const { isAuthenticated, isVip, macAddress, remainingSeconds } = await isClientAuthenticated(ip);

  if (isVip && macAddress) {
    setDaemonWhitelist(macAddress, 'add', ip).catch(() => {});
  }

  // If client has an active session and hit this probe handler, OpenWrt firewall
  // must have lost the authorization entry. Immediately re-assert access on router:
  if (isAuthenticated && macAddress && remainingSeconds > 0) {
    authorizeClientMac(macAddress, Math.ceil(remainingSeconds / 60), ip).catch(() => {});
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
