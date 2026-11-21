import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { cleanIpv4 } from './arp';
import { getSharedDaemonSecret } from './daemon';

function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (!normA || !normB || normA.length !== normB.length) return false;
  const bufA = Buffer.from(normA, 'utf8');
  const bufB = Buffer.from(normB, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Resolves the trusted client IPv4 address from an incoming NextRequest.
 *
 * Trust rules:
 * - If DAEMON_API_SECRET is configured, verifies the daemon reverse-proxy HMAC-SHA256
 *   signature in `x-proxy-auth` over `x-real-ip` using crypto.timingSafeEqual.
 * - In production without valid `x-proxy-auth`, never trusts multi-hop `x-forwarded-for`;
 *   only accepts a single strict IPv4 from `x-real-ip` when `x-proxy-auth` is absent
 *   (transition safety for direct proxy setups), else falls back to `127.0.0.1`.
 * - In non-production dev mode, falls back through `x-real-ip`, `x-forwarded-for` first hop,
 *   and `127.0.0.1`.
 */
export function getTrustedClientIp(request: Pick<NextRequest, 'headers'>): string {
  const secret = getSharedDaemonSecret();
  const rawRealIp = request.headers.get('x-real-ip')?.trim() || '';
  const cleanRealIp = cleanIpv4(rawRealIp);
  const proxyAuth = request.headers.get('x-proxy-auth')?.trim() || '';

  if (secret && proxyAuth && cleanRealIp) {
    const expectedClean = crypto
      .createHmac('sha256', secret)
      .update(cleanRealIp)
      .digest('hex');
    const expectedRaw =
      rawRealIp !== cleanRealIp
        ? crypto.createHmac('sha256', secret).update(rawRealIp).digest('hex')
        : '';

    if (
      timingSafeEqualHex(proxyAuth, expectedClean) ||
      (expectedRaw && timingSafeEqualHex(proxyAuth, expectedRaw))
    ) {
      return cleanRealIp;
    }

    if (process.env.NODE_ENV === 'production') {
      console.warn('[client-ip] x-proxy-auth HMAC mismatch — check DAEMON_API_SECRET in portal/.env vs daemon/.env');
      return '127.0.0.1';
    }
  }

  if (process.env.NODE_ENV === 'production') {
    if ((!proxyAuth || !secret) && cleanRealIp) {
      return cleanRealIp;
    }
    return '127.0.0.1';
  }

  if (cleanRealIp) {
    return cleanRealIp;
  }

  const xffHeader = request.headers.get('x-forwarded-for');
  if (xffHeader) {
    const firstHop = xffHeader.split(',')[0]?.trim() || '';
    const cleanXff = cleanIpv4(firstHop);
    if (cleanXff) {
      return cleanXff;
    }
  }

  return '127.0.0.1';
}
