import { NextRequest, NextResponse } from 'next/server';
import { getRouterWifiConfig, updateRouterWifiConfig } from '@/lib/daemon';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSqlitePragmas();
  try {
    const config = await getRouterWifiConfig();
    const unifiedSetting = await prisma.setting.findUnique({
      where: { key: 'wifi_unified_ssid' },
    });

    const isUnified =
      unifiedSetting?.value === 'true' ||
      (Boolean(config.ssid2g) && config.ssid2g === config.ssid5g);

    return NextResponse.json({
      ...config,
      isUnified,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch Wi-Fi config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();
  try {
    const body = await request.json();
    let { ssid2g, ssid5g, channel2g, channel5g, unified } = body;

    if (unified) {
      if (!ssid2g) {
        return NextResponse.json({ error: 'SSID name is required.' }, { status: 400 });
      }
      ssid5g = ssid2g;
    } else if (!ssid2g || !ssid5g) {
      return NextResponse.json({ error: 'Both 2.4GHz and 5GHz SSIDs are required.' }, { status: 400 });
    }

    const result = await updateRouterWifiConfig({
      ssid2g,
      ssid5g,
      channel2g,
      channel5g,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to update Wi-Fi on OpenWrt' }, { status: 500 });
    }

    // Save unified setting
    if (unified !== undefined) {
      await prisma.setting.upsert({
        where: { key: 'wifi_unified_ssid' },
        update: { value: unified ? 'true' : 'false' },
        create: { key: 'wifi_unified_ssid', value: unified ? 'true' : 'false' },
      });
    }

    return NextResponse.json({ success: true, message: 'Wi-Fi configuration applied and broadcasted!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error updating Wi-Fi' }, { status: 500 });
  }
}
