import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { normalizeMac } from '@/lib/arp';
import { isInternalDaemonRequest } from '@/lib/admin-auth';
import {
  authorizeClientMac,
  deauthorizeClientMac,
  triggerDaemonStormShield,
} from '@/lib/daemon';

export const dynamic = 'force-dynamic';

const STORM_SHIELD_DURATION_MS = 90 * 1000;
const TICK_COMPENSATION_MS = 15 * 1000;

declare global {
  var globalStationDisconnectTimers: Map<string, number> | undefined;
  var globalStormShieldUntil: number | undefined;
  var globalPrevOnlineActiveMacs: Set<string> | undefined;
}

// Map of normalized MAC -> timestamp (ms) when device was first noticed absent from Wi-Fi stations
const disconnectedTimers: Map<string, number> =
  global.globalStationDisconnectTimers ?? new Map<string, number>();
global.globalStationDisconnectTimers = disconnectedTimers;

const prevOnlineActiveMacs: Set<string> =
  global.globalPrevOnlineActiveMacs ?? new Set<string>();
global.globalPrevOnlineActiveMacs = prevOnlineActiveMacs;

export async function GET(request: NextRequest) {
  if (!isInternalDaemonRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request' }, { status: 401 });
  }

  const nowMs = Date.now();
  const stormShieldUntil = global.globalStormShieldUntil ?? 0;
  const stormShieldActive = nowMs < stormShieldUntil;

  return NextResponse.json({
    status: 'online',
    trackedDisconnectedStations: disconnectedTimers.size,
    stormShieldActive,
    stormShieldRemainingSec: stormShieldActive
      ? Math.max(0, Math.ceil((stormShieldUntil - nowMs) / 1000))
      : 0,
  });
}

export async function POST(request: NextRequest) {
  if (!isInternalDaemonRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request' }, { status: 401 });
  }

  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const rawActiveMacs: string[] = Array.isArray(body.activeMacs) ? body.activeMacs : [];
    const scanOk = body.scanOk === true;
    const daemonReportedStorm = body.stormShieldActive === true;

    // Load auto-pause, auto-resume, and Storm Shield settings
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'auto_pause_on_disconnect',
            'auto_pause_grace_seconds',
            'auto_resume_on_reconnect',
            'shield_storm_shield_enabled',
          ],
        },
      },
    });
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const autoPauseEnabled = settingsMap.get('auto_pause_on_disconnect') !== 'false';
    const graceSeconds = Math.max(15, parseInt(settingsMap.get('auto_pause_grace_seconds') || '60', 10));
    const autoResumeEnabled = settingsMap.get('auto_resume_on_reconnect') !== 'false';
    const stormShieldEnabled = settingsMap.get('shield_storm_shield_enabled') !== 'false';

    const currentAssociatedMacs = new Set<string>(
      rawActiveMacs.map((m) => normalizeMac(m).toLowerCase())
    );

    const now = new Date();
    const nowMs = now.getTime();

    // Load active unexpired unpaused sessions to evaluate Storm Shield mass disconnect
    const preSyncValidSessions = await prisma.session.findMany({
      where: {
        isActive: true,
        isPaused: false,
        endTime: { gt: now },
      },
    });

    // Determine currently associated active session MACs
    const currentOnlineActiveMacs = new Set<string>();
    for (const s of preSyncValidSessions) {
      const norm = normalizeMac(s.macAddress).toLowerCase();
      if (currentAssociatedMacs.has(norm)) {
        currentOnlineActiveMacs.add(norm);
      }
    }

    // Detect mass disconnect: if >=3 active sessions previously existed (associated) and >=50% drop together
    let stormShieldUntil = global.globalStormShieldUntil ?? 0;
    if (stormShieldEnabled && scanOk && prevOnlineActiveMacs.size >= 3) {
      let droppedCount = 0;
      for (const prevMac of prevOnlineActiveMacs) {
        if (!currentAssociatedMacs.has(prevMac)) {
          droppedCount++;
        }
      }

      if (droppedCount / prevOnlineActiveMacs.size >= 0.5) {
        const wasAlreadyActive = nowMs < stormShieldUntil;
        stormShieldUntil = nowMs + STORM_SHIELD_DURATION_MS;
        global.globalStormShieldUntil = stormShieldUntil;

        if (!wasAlreadyActive) {
          const reason = `Mass disconnect detected: ${droppedCount}/${prevOnlineActiveMacs.size} active sessions dropped simultaneously`;
          console.warn(`[STORM SHIELD] 🛡️ Engaged 90s protection freeze! ${reason}`);
          triggerDaemonStormShield({
            durationSeconds: 90,
            reason,
            active: true,
          }).catch(() => {});
        }
      }
    }

    if (stormShieldEnabled && daemonReportedStorm && nowMs >= stormShieldUntil) {
      stormShieldUntil = nowMs + STORM_SHIELD_DURATION_MS;
      global.globalStormShieldUntil = stormShieldUntil;
    }

    // Update baseline of associated active sessions for next tick
    if (scanOk) {
      prevOnlineActiveMacs.clear();
      for (const mac of currentOnlineActiveMacs) {
        prevOnlineActiveMacs.add(mac);
      }
    }

    const stormShieldActive = stormShieldEnabled && (daemonReportedStorm || nowMs < stormShieldUntil);

    // If Storm Shield is active:
    // - Do NOT auto-pause/deauthorize disconnected sessions
    // - Shift active unexpired sessions' endTime forward by 15s so paying users don't lose time during a deauth storm
    if (stormShieldActive) {
      disconnectedTimers.clear();
      let compensatedSessionsCount = 0;

      for (const session of preSyncValidSessions) {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            endTime: new Date(session.endTime.getTime() + TICK_COMPENSATION_MS),
          },
        });
        compensatedSessionsCount++;
      }

      return NextResponse.json({
        success: true,
        stormShieldActive: true,
        stormShieldRemainingSec: Math.max(0, Math.ceil((stormShieldUntil - nowMs) / 1000)),
        compensatedSessionsCount,
        autoPauseEnabled,
        graceSeconds,
        autoResumeEnabled,
        associatedStationsCount: currentAssociatedMacs.size,
        activeSessionsCount: preSyncValidSessions.length,
        expiredCleanedCount: 0,
        pausedCount: 0,
        resumedCount: 0,
        pendingDisconnectTimers: 0,
      });
    }

    // 1. CLEANUP EXPIRED ACTIVE SESSIONS (endTime <= now)
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

    const validActiveSessions = preSyncValidSessions;
    const validMacSet = new Set(validActiveSessions.map((s) => normalizeMac(s.macAddress).toLowerCase()));

    let pausedCount = 0;
    let resumedCount = 0;

    // 2. AUTO-PAUSE & AUTO-RESUME (When enabled)
    const skipAutoPauseEvaluation = !scanOk && currentAssociatedMacs.size === 0 && validActiveSessions.length > 0;
    if (skipAutoPauseEvaluation) {
      console.warn(
        `[STATION SYNC] Unverified empty station scan while ${validActiveSessions.length} active sessions exist. Skipping auto-pause.`
      );
    }

    if (autoPauseEnabled && !skipAutoPauseEvaluation) {
      // Detect Disconnect & Grace Period for unpaused sessions
      for (const session of validActiveSessions) {
        const normMac = normalizeMac(session.macAddress).toLowerCase();

        if (!currentAssociatedMacs.has(normMac)) {
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
                await prisma.session.update({
                  where: { id: session.id },
                  data: {
                    isPaused: true,
                    pausedRemainingSeconds: remainingSeconds,
                  },
                });

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

            await authorizeClientMac(session.macAddress, remainingMinutes, session.ipAddress || undefined, {
              amount: 0,
              isNewSession: false,
              notify: false,
            });

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
      stormShieldActive: false,
      stormShieldRemainingSec: 0,
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
