import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { normalizeMac } from '@/lib/arp';
import { setDaemonWhitelist, setDaemonBlacklist } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSqlitePragmas();

  try {
    const devices = await prisma.deviceRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ devices });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch device rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json();
    const { macAddress: rawMac, name, type, notes } = body;

    const macAddress = normalizeMac(rawMac || '');
    if (!macAddress || macAddress.length !== 17) {
      return NextResponse.json({ error: 'Valid MAC address required (format: AA:BB:CC:DD:EE:FF)' }, { status: 400 });
    }

    if (type !== 'WHITELIST' && type !== 'BLACKLIST') {
      return NextResponse.json({ error: 'Type must be WHITELIST or BLACKLIST' }, { status: 400 });
    }

    const device = await prisma.deviceRule.upsert({
      where: { macAddress },
      update: {
        name: name || 'Device',
        type,
        notes: notes || null,
      },
      create: {
        macAddress,
        name: name || 'Device',
        type,
        notes: notes || null,
      },
    });

    // Apply to OpenWrt firewall via daemon
    if (type === 'WHITELIST') {
      await setDaemonBlacklist(macAddress, 'remove');
      await setDaemonWhitelist(macAddress, 'add');
    } else {
      await setDaemonWhitelist(macAddress, 'remove');
      await setDaemonBlacklist(macAddress, 'add');
    }

    return NextResponse.json({
      success: true,
      message: `Device ${macAddress} successfully added to ${type === 'WHITELIST' ? 'VIP Whitelist' : 'Blacklist'}!`,
      device,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save device rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const mac = searchParams.get('mac');

    if (!id && !mac) {
      return NextResponse.json({ error: 'Device ID or MAC required' }, { status: 400 });
    }

    const device = id
      ? await prisma.deviceRule.findUnique({ where: { id } })
      : await prisma.deviceRule.findUnique({ where: { macAddress: mac! } });

    if (!device) {
      return NextResponse.json({ error: 'Device rule not found' }, { status: 404 });
    }

    await prisma.deviceRule.delete({ where: { id: device.id } });

    // Remove from OpenWrt
    if (device.type === 'WHITELIST') {
      await setDaemonWhitelist(device.macAddress, 'remove');
    } else {
      await setDaemonBlacklist(device.macAddress, 'remove');
    }

    return NextResponse.json({ success: true, message: `Removed rule for ${device.macAddress}` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete device rule' }, { status: 500 });
  }
}
