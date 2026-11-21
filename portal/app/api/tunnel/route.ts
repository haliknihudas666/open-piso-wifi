import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import {
  isAdminRequest,
  isInternalDaemonRequest,
  requireAdmin,
  maskSecret,
  isBlankOrMaskedSecret,
} from '@/lib/admin-auth';
import { daemonHeaders } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

const DAEMON_URL = process.env.DAEMON_URL || 'http://127.0.0.1:4000';

async function loadTunnelSettings() {
  const keys = [
    'cloudflare_tunnel_enabled',
    'cloudflare_tunnel_mode',
    'cloudflare_tunnel_token',
    'cloudflare_tunnel_hostname',
  ];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }

  return {
    enabled: map.cloudflare_tunnel_enabled === 'true',
    mode: map.cloudflare_tunnel_mode === 'named' ? ('named' as const) : ('quick' as const),
    tunnelToken: (map.cloudflare_tunnel_token || '').trim(),
    customHostname: (map.cloudflare_tunnel_hostname || '').trim(),
  };
}

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminRequest(request);
  const isDaemon = isInternalDaemonRequest(request);

  if (!isAdmin && !isDaemon) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSqlitePragmas();

  try {
    const cfg = await loadTunnelSettings();

    let daemonStatus: any = null;
    let daemonOnline = false;
    try {
      const daemonRes = await fetch(`${DAEMON_URL}/api/tunnel/status`, {
        headers: daemonHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      if (daemonRes.ok) {
        const dData = await daemonRes.json();
        daemonStatus = dData.status;
        daemonOnline = true;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      daemonOnline,
      status: daemonStatus,
      config: {
        enabled: daemonStatus?.enabled ?? cfg.enabled,
        mode: daemonStatus?.mode ?? cfg.mode,
        hasToken: Boolean(cfg.tunnelToken || daemonStatus?.hasToken),
        tokenMasked: maskSecret(cfg.tunnelToken),
        customHostname: cfg.customHostname || daemonStatus?.customHostname || '',
        ...(isDaemon ? { tunnelToken: cfg.tunnelToken } : {}),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch tunnel status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : 'config';

    if (action === 'start' || action === 'stop' || action === 'restart') {
      if (action === 'start') {
        await upsertSetting('cloudflare_tunnel_enabled', 'true');
      } else if (action === 'stop') {
        await upsertSetting('cloudflare_tunnel_enabled', 'false');
      }

      const daemonRes = await fetch(`${DAEMON_URL}/api/tunnel/${action}`, {
        method: 'POST',
        headers: daemonHeaders(),
        signal: AbortSignal.timeout(6000),
      });
      const dData = await daemonRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: daemonRes.ok && dData.success !== false,
          status: dData.status || null,
          message: dData.message || `Tunnel ${action} requested`,
        },
        { status: daemonRes.ok ? 200 : 502 }
      );
    }

    // Save configuration and sync to daemon
    const current = await loadTunnelSettings();
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled;
    const mode = body.mode === 'named' || body.mode === 'quick' ? body.mode : current.mode;
    const customHostname =
      typeof body.customHostname === 'string' ? body.customHostname.trim() : current.customHostname;

    let effectiveToken = current.tunnelToken;
    if (body.clearToken === true) {
      effectiveToken = '';
      await upsertSetting('cloudflare_tunnel_token', '');
    } else if (!isBlankOrMaskedSecret(body.tunnelToken)) {
      effectiveToken = String(body.tunnelToken).trim();
      await upsertSetting('cloudflare_tunnel_token', effectiveToken);
    }

    await upsertSetting('cloudflare_tunnel_enabled', enabled ? 'true' : 'false');
    await upsertSetting('cloudflare_tunnel_mode', mode);
    await upsertSetting('cloudflare_tunnel_hostname', customHostname);

    let daemonStatus: any = null;
    let daemonSynced = false;
    try {
      const daemonRes = await fetch(`${DAEMON_URL}/api/tunnel/config`, {
        method: 'POST',
        headers: daemonHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          enabled,
          mode,
          tunnelToken: effectiveToken || undefined,
          clearToken: body.clearToken === true,
          customHostname,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (daemonRes.ok) {
        const dData = await daemonRes.json().catch(() => ({}));
        daemonStatus = dData.status || null;
        daemonSynced = true;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      daemonSynced,
      status: daemonStatus,
      message: daemonSynced
        ? 'Cloudflare Tunnel settings saved and applied to daemon.'
        : 'Saved to database, but daemon is unreachable right now.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update tunnel config' },
      { status: 500 }
    );
  }
}
