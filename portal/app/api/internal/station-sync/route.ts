import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { normalizeMac } from '@/lib/arp';
import { authorizeClientMac, deauthorizeClientMac } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

// Map of normalized MAC -> timestamp (ms) when device was first noticed absent from Wi-Fi stations
const disconnectedTimers = new Map<string, number>();

export async function GET() {
  return NextResponse.json({
    status: 'online',
    trackedDisconnectedStations: disconnectedTimers.size,
  });
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const rawActiveMacs: string[] = Array.isArray(body.activeMacs) ? body.activeMacs : [];

    // Load auto-pause and auto-resume settings
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['auto_pause_on_disconnect', 'auto_pause_grace_seconds', 'auto_resume_on_reconnect'],
        },
      },
    });
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const autoPauseEnabled = settingsMap.get('auto_pause_on_disconnect') !== 'false';
    const graceSeconds = Math.max(15, parseInt(settingsMap.get('auto_pause_grace_seconds') || '60', 10));
    const autoResumeEnabled = settingsMap.get('auto_resume_on_reconnect') !== 'false';

    const currentAssociatedMacs = new Set<string>(
      rawActiveMacs.map((m) => normalizeMac(m).toLowerCase())
    );

    const now = new Date();
    const nowMs = now.getTime();

    // 1. CLEANUP EXPIRED ACTIVE SESSIONS (endTime <= now)
    // When time runs out, immediately mark session inactive, revoke OpenWrt firewall access,
    // flush conntrack connections, and kick the station from the Wi-Fi AP.
    const expiredSessions = await prisma.session.findMany({
      where: {
        isActive: true,
        isPaused: false,
        endTime: { lte: now },
      },
    });

    let expiredCount = 0;
    for (const exp of expiredSessions) {
      await prisma.session.update({
        where: { id: exp.id },
        data: { isActive: false },
      });
      await deauthorizeClientMac(exp.macAddress);
      const normMac = normalizeMac(exp.macAddress).toLowerCase();
      disconnectedTimers.delete(normMac);
      expiredCount++;
      console.log(`[SESSION EXPIRED] Device ${exp.macAddress} time ran out. Revoked from OpenWrt and Wi-Fi station kicked.`);
    }

    // Load VIP whitelist to prevent disconnecting whitelisted devices
    const whitelistedDevices = await prisma.deviceRule.findMany({
      where: { type: 'WHITELIST' },
    });
    const whitelistSet = new Set(whitelistedDevices.map((w) => normalizeMac(w.macAddress).toLowerCase()));

    // Query active unexpired unpaused sessions
    const validActiveSessions = await prisma.session.findMany({
      where: {
        isActive: true,
        isPaused: false,
        endTime: { gt: now },
      },
    });
    const validMacSet = new Set(validActiveSessions.map((s) => normalizeMac(s.macAddress).toLowerCase()));

    let pausedCount = 0;
    let resumedCount = 0;

    // 2. AUTO-PAUSE & AUTO-RESUME (When enabled)
    // Safeguard: If the AP reported 0 active stations while active sessions exist,
    // do NOT assume all stations simultaneously disconnected (likely AP query timeout or driver glitch).
    const skipAutoPauseEvaluation = currentAssociatedMacs.size === 0 && validActiveSessions.length > 0;
    if (skipAutoPauseEvaluation) {
      console.warn(
        `[STATION SYNC] Station scan returned 0 devices while ${validActiveSessions.length} active sessions exist. Skipping auto-pause to prevent false mass-disconnections.`
      );
    }

    if (autoPauseEnabled && !skipAutoPauseEvaluation) {
      // Detect Disconnect & Grace Period for unpaused sessions
      for (const session of validActiveSessions) {
        const normMac = normalizeMac(session.macAddress).toLowerCase();

        if (!currentAssociatedMacs.has(normMac)) {
          // Device is not currently associated with any Wi-Fi AP radio
          if (!disconnectedTimers.has(normMac)) {
            disconnectedTimers.set(normMac, nowMs);
          } else {
            const firstSeenDisconnected = disconnectedTimers.get(normMac)!;
            const elapsedSeconds = (nowMs - firstSeenDisconnected) / 1000;

            if (elapsedSeconds >= graceSeconds) {
              const remainingSeconds = Math.max(
                0,
                Math.floor((session.endTime.getTime() - nowMs) / 1000)
              );

              if (remainingSeconds > 5) {
                // Freeze the remaining time in database
                await prisma.session.update({
                  where: { id: session.id },
                  data: {
                    isPaused: true,
                    pausedRemainingSeconds: remainingSeconds,
                  },
                });

                // Cut off OpenWrt firewall forwarding immediately
                await deauthorizeClientMac(session.macAddress);

                pausedCount++;
                console.log(
                  `[AUTO-PAUSE] Device ${session.macAddress} disconnected for ${Math.round(
                    elapsedSeconds
                  )}s (grace: ${graceSeconds}s). Paused with ${remainingSeconds}s remaining.`
                );
              }

              disconnectedTimers.delete(normMac);
            }
          }
        } else {
          // Device IS associated with Wi-Fi: clear any pending disconnect timer
          disconnectedTimers.delete(normMac);
        }
      }

      // PAUSED SESSIONS: Detect Re-Association & Auto-Resume
      if (autoResumeEnabled) {
        const pausedSessions = await prisma.session.findMany({
          where: {
            isActive: true,
            isPaused: true,
            pausedRemainingSeconds: { gt: 0 },
          },
        });

        for (const session of pausedSessions) {
          const normMac = normalizeMac(session.macAddress).toLowerCase();
          if (currentAssociatedMacs.has(normMac)) {
            // Device returned and re-associated to the AP!
            const newEndTime = new Date(nowMs + session.pausedRemainingSeconds * 1000);
            const remainingMinutes = Math.max(1, Math.ceil(session.pausedRemainingSeconds / 60));

            await prisma.session.update({
              where: { id: session.id },
              data: {
                isPaused: false,
                startTime: now,
                endTime: newEndTime,
                pausedRemainingSeconds: 0,
              },
            });

            // Re-authorize client on OpenWrt firewall
            await authorizeClientMac(session.macAddress, remainingMinutes, session.ipAddress || undefined);

            resumedCount++;
            disconnectedTimers.delete(normMac);
            console.log(
              `[AUTO-RESUME] Device ${session.macAddress} reconnected to Wi-Fi. Resumed session with ${session.pausedRemainingSeconds}s remaining.`
            );
          }
        }
      }
    } else {
      disconnectedTimers.clear();
    }

    // Purge stale timers for MACs no longer in activeSessions
    for (const mac of disconnectedTimers.keys()) {
      if (!validMacSet.has(mac)) {
        disconnectedTimers.delete(mac);
      }
    }

    return NextResponse.json({
      success: true,
      autoPauseEnabled,
      graceSeconds,
      autoResumeEnabled,
      associatedStationsCount: currentAssociatedMacs.size,
      activeSessionsCount: validActiveSessions.length,
      expiredCleanedCount: expiredCount,
      pausedCount,
      resumedCount,
      pendingDisconnectTimers: disconnectedTimers.size,
    });
  } catch (error: any) {
    console.error('[STATION SYNC ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Internal error during station sync' },
      { status: 500 }
    );
  }
}
