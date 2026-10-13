import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { authorizeClientMac, deauthorizeClientMac, getRouterDhcpLeases, setDaemonWhitelist, setDaemonBlacklist } from '@/lib/daemon';
import { normalizeMac } from '@/lib/arp';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSqlitePragmas();

  try {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        isActive: true,
        OR: [
          { endTime: { gt: now } },
          { isPaused: true },
        ],
      },
      orderBy: { endTime: 'desc' },
    });

    let leases: Array<{ mac: string; ip: string; hostname?: string }> = [];
    try {
      leases = await getRouterDhcpLeases();
    } catch {}

    const deviceRules = await prisma.deviceRule.findMany();
    const ruleMap = new Map(deviceRules.map((d) => [d.macAddress.toLowerCase(), d]));
    const leaseMap = new Map(leases.map((l) => [l.mac.toLowerCase(), l]));

    const enrichedSessions = sessions.map((s) => {
      const macLower = s.macAddress.toLowerCase();
      const rule = ruleMap.get(macLower);
      const lease = leaseMap.get(macLower);

      let finalDeviceName = s.deviceName;
      if (rule) {
        finalDeviceName = `${rule.name} (VIP)`;
      } else if (!finalDeviceName && lease?.hostname) {
        finalDeviceName = lease.hostname;
      }

      return {
        ...s,
        deviceName: finalDeviceName || 'Wi-Fi Client',
        remainingSeconds: s.isPaused
          ? s.pausedRemainingSeconds
          : Math.max(0, Math.floor((s.endTime.getTime() - now.getTime()) / 1000)),
      };
    });

    return NextResponse.json({ sessions: enrichedSessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch sessions' }, { status: 500 });
  }
}

// Disconnect, Add Time, or Whitelist a Session / Device
export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { action, sessionId, macAddress: rawMac, additionalMinutes = 15, deviceName } = await request.json();

    let targetMac = rawMac ? normalizeMac(rawMac) : '';
    let session = sessionId
      ? await prisma.session.findUnique({ where: { id: sessionId } })
      : null;

    if (session) {
      targetMac = session.macAddress;
    }

    if (!targetMac && !session) {
      return NextResponse.json({ error: 'Session ID or valid MAC address is required' }, { status: 400 });
    }

    // ACTION 1: KICK / DISCONNECT
    if (action === 'disconnect') {
      if (session) {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            isActive: false,
            endTime: new Date(),
          },
        });
      } else if (targetMac) {
        await prisma.session.updateMany({
          where: { macAddress: targetMac, isActive: true },
          data: {
            isActive: false,
            endTime: new Date(),
          },
        });
      }

      // Revoke rule from OpenWrt router firewall via daemon and kick station
      if (targetMac) {
        await deauthorizeClientMac(targetMac, { kickStation: true });
      }

      return NextResponse.json({ success: true, message: `Device ${targetMac} disconnected / kicked` });
    }

    // ACTION 2: ADD TIME
    if (action === 'add_time') {
      const minutesToAdd = Number(additionalMinutes) || 15;

      if (session) {
        const currentEnd = new Date(Math.max(Date.now(), session.endTime.getTime()));
        const newEndTime = new Date(currentEnd.getTime() + minutesToAdd * 60 * 1000);

        await prisma.session.update({
          where: { id: session.id },
          data: {
            endTime: newEndTime,
            durationMinutes: session.durationMinutes + minutesToAdd,
            isActive: true,
            isPaused: false,
          },
        });

        const totalRemainingMinutes = Math.ceil((newEndTime.getTime() - Date.now()) / (60 * 1000));
        await authorizeClientMac(session.macAddress, totalRemainingMinutes);

        return NextResponse.json({
          success: true,
          message: `Added ${minutesToAdd} minutes to ${session.deviceName || session.macAddress}`,
          newEndTime: newEndTime.toISOString(),
        });
      } else if (targetMac) {
        // Create new session grant for connected client
        const newEndTime = new Date(Date.now() + minutesToAdd * 60 * 1000);
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let transferCode = 'PW-';
        for (let i = 0; i < 6; i++) {
          transferCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const newSession = await prisma.session.create({
          data: {
            sessionToken: crypto.randomUUID(),
            transferCode,
            macAddress: targetMac,
            ipAddress: null,
            deviceName: deviceName || 'Wi-Fi Client',
            startTime: new Date(),
            endTime: newEndTime,
            durationMinutes: minutesToAdd,
            amountPaid: 0,
            type: 'BONUS',
            isActive: true,
          },
        });

        await authorizeClientMac(targetMac, minutesToAdd);

        return NextResponse.json({
          success: true,
          message: `Granted ${minutesToAdd} minutes to ${targetMac}`,
          sessionId: newSession.id,
          newEndTime: newEndTime.toISOString(),
        });
      }
    }

    // ACTION 3: ONE-TAP WHITELIST
    if (action === 'whitelist') {
      if (!targetMac) {
        return NextResponse.json({ error: 'Valid MAC address required for whitelist' }, { status: 400 });
      }

      await prisma.deviceRule.upsert({
        where: { macAddress: targetMac },
        update: {
          name: deviceName || 'Whitelisted Device',
          type: 'WHITELIST',
          notes: 'Whitelisted from Live Control Sessions table',
        },
        create: {
          macAddress: targetMac,
          name: deviceName || 'Whitelisted Device',
          type: 'WHITELIST',
          notes: 'Whitelisted from Live Control Sessions table',
        },
      });

      await setDaemonBlacklist(targetMac, 'remove');
      await setDaemonWhitelist(targetMac, 'add');

      return NextResponse.json({
        success: true,
        message: `Device ${targetMac} successfully whitelisted for free permanent access!`,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to process session action' }, { status: 500 });
  }
}
