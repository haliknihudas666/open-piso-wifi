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

export async function GET(request: NextRequest) {
  const isAdmin = await isAdminRequest(request);
  const isDaemon = isInternalDaemonRequest(request);

  if (!isAdmin && !isDaemon) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  await ensureSqlitePragmas();

  try {
    const tokenSetting = await prisma.setting.findUnique({ where: { key: 'telegram_bot_token' } });
    const chatSetting = await prisma.setting.findUnique({ where: { key: 'telegram_admin_chat_id' } });

    const token = tokenSetting?.value || '';
    const adminChatId = chatSetting?.value || '';

    // Check daemon status
    let daemonStatus: any = null;
    let daemonOnline = false;
    try {
      const daemonRes = await fetch(`${DAEMON_URL}/api/telegram/status`, {
        headers: daemonHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      if (daemonRes.ok) {
        const dData = await daemonRes.json();
        daemonStatus = dData.status;
        daemonOnline = true;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      token: isDaemon ? token : '',
      adminChatId,
      hasToken: Boolean(token),
      tokenMasked: maskSecret(token),
      daemonOnline,
      isPolling: daemonStatus?.isPolling || false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch Telegram config' },
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
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    const adminChatId = typeof body.adminChatId === 'string' ? body.adminChatId.trim() : '';

    let effectiveToken = '';
    if (body.clearToken === true || body.clear_telegram_token === true) {
      effectiveToken = '';
      await prisma.setting.upsert({
        where: { key: 'telegram_bot_token' },
        update: { value: '' },
        create: { key: 'telegram_bot_token', value: '' },
      });
    } else if (!isBlankOrMaskedSecret(rawToken)) {
      effectiveToken = rawToken;
      await prisma.setting.upsert({
        where: { key: 'telegram_bot_token' },
        update: { value: effectiveToken },
        create: { key: 'telegram_bot_token', value: effectiveToken },
      });
    } else {
      const existing = await prisma.setting.findUnique({ where: { key: 'telegram_bot_token' } });
      effectiveToken = existing?.value || '';
    }

    await prisma.setting.upsert({
      where: { key: 'telegram_admin_chat_id' },
      update: { value: adminChatId },
      create: { key: 'telegram_admin_chat_id', value: adminChatId },
    });

    // Notify daemon of live hot-reload
    let daemonNotified = false;
    try {
      const daemonRes = await fetch(`${DAEMON_URL}/api/telegram/config`, {
        method: 'POST',
        headers: daemonHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token: effectiveToken, adminChatId }),
        signal: AbortSignal.timeout(2000),
      });
      if (daemonRes.ok) {
        daemonNotified = true;
      }
    } catch (daemonErr) {
      console.warn('[TELEGRAM] Daemon hot-reload unreachable:', daemonErr);
    }

    return NextResponse.json({
      success: true,
      hasToken: Boolean(effectiveToken),
      tokenMasked: maskSecret(effectiveToken),
      message: 'Telegram credentials saved successfully.',
      daemonNotified,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save Telegram credentials' },
      { status: 500 }
    );
  }
}
