import { NextResponse, type NextRequest } from 'next/server';

function isTunnelTraffic(request: NextRequest): boolean {
  const cfRay = request.headers.get('cf-ray')?.trim();
  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(':')[0]
    .trim()
    .toLowerCase();

  return Boolean(cfRay || cfConnectingIp || host.endsWith('.trycloudflare.com'));
}

function isAllowedTunnelPath(pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (pathname.startsWith('/api/admin/')) return true;
  if (pathname.startsWith('/api/telegram/')) return true;
  if (pathname === '/api/tunnel' || pathname.startsWith('/api/tunnel/')) return true;
  if (pathname === '/api/coins' || pathname === '/api/coinslots') return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico' || pathname === '/robots.txt') return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (!isTunnelTraffic(request)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = '/admin';
    return NextResponse.redirect(adminUrl);
  }

  if (isAllowedTunnelPath(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'Unauthorized: route is disabled over remote Cloudflare Tunnel' },
    { status: 401 }
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
