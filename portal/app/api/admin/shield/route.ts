import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import {
  requireAdmin,
  isBlankOrMaskedSecret,
} from '@/lib/admin-auth';
import {
  getDaemonShieldStatus,
  applyDaemonShieldConfig,
  clearDaemonShieldAlerts,
  hopDaemonChannel2g,
} from '@/lib/daemon';

export const dynamic = 'force-dynamic';

const SHIELD_SETTING_KEYS = [
  'shield_owe_mode',
  'shield_client_isolation',
  'shield_anti_tethering',
  'shield_block_random_mac_trial',
  'shield_storm_shield_enabled',
  'shield_wids_enabled',
  'shield_iot_ssid',
  'shield_iot_passphrase',
] as const;

async function loadShieldSettingsFromDb() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...SHIELD_SETTING_KEYS] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const passphrase = map.get('shield_iot_passphrase') || '';
  return {
    publicSettings: {
      shield_owe_mode: (map.get('shield_owe_mode') || 'owe_5g') as 'off' | 'transition' | 'owe_5g' | 'owe_all',
      shield_client_isolation: (map.get('shield_client_isolation') || 'true') as 'true' | 'false',
      shield_anti_tethering: (map.get('shield_anti_tethering') || 'false') as 'true' | 'false',
      shield_block_random_mac_trial: (map.get('shield_block_random_mac_trial') || 'true') as 'true' | 'false',
      shield_storm_shield_enabled: (map.get('shield_storm_shield_enabled') || 'true') as 'true' | 'false',
      shield_wids_enabled: (map.get('shield_wids_enabled') || 'true') as 'true' | 'false',
      shield_iot_ssid: map.get('shield_iot_ssid') || '',
      has_iot_passphrase: Boolean(passphrase),
    },
    iotPassphrase: passphrase,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const [{ publicSettings }, live] = await Promise.all([
      loadShieldSettingsFromDb(),
      getDaemonShieldStatus(),
    ]);

    return NextResponse.json({
      settings: publicSettings,
      live,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch OpenPiso Shield status';
    return NextResponse.json(
      { error: message },
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

    if (body.action === 'clear_alerts') {
      const result = await clearDaemonShieldAlerts();
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'Failed to clear Shield alerts' },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, message: 'Security event log cleared' });
    }

    if (body.action === 'channel_hop_2g') {
      const result = await hopDaemonChannel2g();
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'Failed to hop 2.4GHz channel' },
          { status: 502 }
        );
      }
      return NextResponse.json({
        success: true,
        previousChannel: result.previousChannel,
        newChannel: result.newChannel,
        message: result.newChannel
          ? `Hopped 2.4GHz radio to Channel ${result.newChannel}`
          : '2.4GHz channel hop executed',
      });
    }

    const nonSecretShieldKeys = [
      'shield_owe_mode',
      'shield_client_isolation',
      'shield_anti_tethering',
      'shield_block_random_mac_trial',
      'shield_storm_shield_enabled',
      'shield_wids_enabled',
      'shield_iot_ssid',
    ] as const;

    const validOweModes = new Set(['off', 'transition', 'owe_5g', 'owe_all']);
    if (body.shield_owe_mode !== undefined && !validOweModes.has(String(body.shield_owe_mode))) {
      return NextResponse.json({ error: 'Invalid OWE mode' }, { status: 400 });
    }

    for (const key of nonSecretShieldKeys) {
      if (body[key] !== undefined) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: String(body[key]) },
          create: { key, value: String(body[key]) },
        });
      }
    }

    if (body.clear_iot_passphrase === true) {
      await prisma.setting.upsert({
        where: { key: 'shield_iot_passphrase' },
        update: { value: '' },
        create: { key: 'shield_iot_passphrase', value: '' },
      });
    } else if (!isBlankOrMaskedSecret(body.shield_iot_passphrase)) {
      await prisma.setting.upsert({
        where: { key: 'shield_iot_passphrase' },
        update: { value: String(body.shield_iot_passphrase).trim() },
        create: { key: 'shield_iot_passphrase', value: String(body.shield_iot_passphrase).trim() },
      });
    }

    const { publicSettings, iotPassphrase } = await loadShieldSettingsFromDb();

    const daemonResult = await applyDaemonShieldConfig({
      shield_owe_mode: publicSettings.shield_owe_mode,
      shield_client_isolation: publicSettings.shield_client_isolation,
      shield_anti_tethering: publicSettings.shield_anti_tethering,
      shield_storm_shield_enabled: publicSettings.shield_storm_shield_enabled,
      shield_wids_enabled: publicSettings.shield_wids_enabled,
      shield_iot_ssid: publicSettings.shield_iot_ssid,
      ...(iotPassphrase ? { shield_iot_passphrase: iotPassphrase } : {}),
    });

    const live = await getDaemonShieldStatus();

    return NextResponse.json({
      success: true,
      daemonApplied: daemonResult.success,
      daemonError: daemonResult.error,
      message: daemonResult.success
        ? 'OpenPiso Shield configuration saved and applied to router.'
        : 'Shield settings saved to database (daemon offline or could not reach router).',
      settings: publicSettings,
      live,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save OpenPiso Shield configuration';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
