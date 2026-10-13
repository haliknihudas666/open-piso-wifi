import { prisma, ensureSqlitePragmas } from './prisma';
import { getMacFromIp } from './arp';
import { authorizeClientMac, deauthorizeClientMac } from './daemon';
import crypto from 'node:crypto';

/**
 * Checks if a requesting client currently has an active, unexpired Wi-Fi session.
 * Supports sessionToken-based auto-migration when devices randomize their MAC or hop bands.
 */
export async function isClientAuthenticated(
  clientIp: string,
  sessionTokenHint?: string | null
): Promise<{
  isAuthenticated: boolean;
  macAddress: string | null;
  remainingSeconds: number;
  isVip?: boolean;
  isBlacklisted?: boolean;
  blacklistNotes?: string;
  deviceName?: string;
  isPaused?: boolean;
  session?: any;
  sessionToken?: string | null;
}> {
  const macAddress = await getMacFromIp(clientIp);
  if (!macAddress) {
    return { isAuthenticated: false, macAddress: null, remainingSeconds: 0 };
  }

  try {
    const normalizedMac = macAddress.toLowerCase();

    // 1. Check if Device is in VIP Whitelist or Blacklist
    const deviceRule = await prisma.deviceRule.findFirst({
      where: {
        OR: [
          { macAddress },
          { macAddress: macAddress.toUpperCase() },
          { macAddress: macAddress.toLowerCase() },
        ],
      },
    });

    if (deviceRule) {
      if (deviceRule.type === 'BLACKLIST') {
        return {
          isAuthenticated: false,
          isBlacklisted: true,
          macAddress,
          remainingSeconds: 0,
          blacklistNotes: deviceRule.notes || undefined,
          deviceName: deviceRule.name || undefined,
        };
      }

      if (deviceRule.type === 'WHITELIST') {
        return {
          isAuthenticated: true,
          isVip: true,
          macAddress,
          remainingSeconds: 31536000, // 1 year unlimited
        };
      }
    }

    const now = new Date();

    // Load auto-resume setting (defaults to true)
    const autoResumeSetting = await prisma.setting.findUnique({
      where: { key: 'auto_resume_on_reconnect' },
    }).catch(() => null);
    const autoResumeEnabled = autoResumeSetting?.value !== 'false';

    // 2. Check for Paused Session directly by current MAC
    let pausedSession = await prisma.session.findFirst({
      where: {
        macAddress,
        isActive: true,
        isPaused: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (pausedSession && pausedSession.pausedRemainingSeconds > 0) {
      if (!pausedSession.sessionToken) {
        const generatedToken = crypto.randomUUID();
        pausedSession = await prisma.session.update({
          where: { id: pausedSession.id },
          data: { sessionToken: generatedToken },
        });
      }

      // If auto_resume_on_reconnect is enabled, automatically resume and authorize client now
      if (autoResumeEnabled) {
        const newEndTime = new Date(now.getTime() + pausedSession.pausedRemainingSeconds * 1000);
        const remainingMinutes = Math.max(1, Math.ceil(pausedSession.pausedRemainingSeconds / 60));

        const resumedSession = await prisma.session.update({
          where: { id: pausedSession.id },
          data: {
            isPaused: false,
            startTime: now,
            endTime: newEndTime,
            pausedRemainingSeconds: 0,
            ipAddress: clientIp,
          },
        });

        // Immediately grant internet forwarding on OpenWrt
        authorizeClientMac(macAddress, remainingMinutes, clientIp).catch((err) => {
          console.warn('[AUTO RESUME] Notice authorizing client MAC:', err);
        });

        console.log(`[AUTO RESUME] Device ${macAddress} actively connected. Resumed session ${pausedSession.id} (${pausedSession.pausedRemainingSeconds}s remaining).`);

        return {
          isAuthenticated: true,
          isPaused: false,
          macAddress,
          remainingSeconds: pausedSession.pausedRemainingSeconds,
          session: resumedSession,
          sessionToken: resumedSession.sessionToken,
        };
      }

      return {
        isAuthenticated: false,
        isPaused: true,
        macAddress,
        remainingSeconds: pausedSession.pausedRemainingSeconds,
        session: pausedSession,
        sessionToken: pausedSession.sessionToken,
      };
    }

    // 3. Check for Active Unexpired Session directly by current MAC
    let activeSession = await prisma.session.findFirst({
      where: {
        macAddress,
        isActive: true,
        isPaused: false,
        endTime: { gt: now },
      },
      orderBy: { endTime: 'desc' },
    });

    if (activeSession) {
      if (!activeSession.sessionToken) {
        const generatedToken = crypto.randomUUID();
        activeSession = await prisma.session.update({
          where: { id: activeSession.id },
          data: { sessionToken: generatedToken },
        });
      }

      const remainingSeconds = Math.max(0, Math.floor((activeSession.endTime.getTime() - now.getTime()) / 1000));
      return {
        isAuthenticated: remainingSeconds > 0,
        macAddress,
        remainingSeconds,
        session: activeSession,
        sessionToken: activeSession.sessionToken,
      };
    }

    // 3b. Detect expired active session directly by current MAC and deauthorize from OpenWrt
    const expiredDirectSession = await prisma.session.findFirst({
      where: {
        macAddress,
        isActive: true,
        endTime: { lte: now },
      },
    });
    if (expiredDirectSession) {
      await prisma.session.update({
        where: { id: expiredDirectSession.id },
        data: { isActive: false },
      });
      deauthorizeClientMac(macAddress).catch((err) => {
        console.warn('[AUTH CHECK] Notice deauthorizing expired MAC:', err);
      });
    }

    // 4. Session Token Fallback: Auto-migrate session if client MAC rotated or switched bands/SSIDs
    if (sessionTokenHint && typeof sessionTokenHint === 'string' && sessionTokenHint.trim().length > 5) {
      const token = sessionTokenHint.trim();
      const tokenSession = await prisma.session.findFirst({
        where: {
          isActive: true,
          AND: [
            {
              OR: [
                { sessionToken: token },
                { transferCode: token },
                { transferCode: token.startsWith('PW-') ? token : `PW-${token}` },
              ],
            },
            {
              OR: [
                { isPaused: true },
                { endTime: { gt: now } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (tokenSession) {
        const oldMac = tokenSession.macAddress;
        if (oldMac.toLowerCase() !== macAddress.toLowerCase()) {
          console.log(`[MAC MIGRATION] Migrating session ${tokenSession.id} from ${oldMac} -> ${macAddress} (IP: ${clientIp})`);
          // Immediately deauthorize the old MAC on OpenWrt so it doesn't leave an open internet hole on the old SSID
          deauthorizeClientMac(oldMac).catch((err) => {
            console.warn('[MAC MIGRATION] Notice deauthorizing old MAC:', err);
          });
        }

        // Update session in DB with the device's new MAC & IP
        const migratedSession = await prisma.session.update({
          where: { id: tokenSession.id },
          data: {
            macAddress,
            ipAddress: clientIp,
          },
        });

        if (migratedSession.isPaused) {
          if (autoResumeEnabled && migratedSession.pausedRemainingSeconds > 0) {
            const newEndTime = new Date(now.getTime() + migratedSession.pausedRemainingSeconds * 1000);
            const remainingMinutes = Math.max(1, Math.ceil(migratedSession.pausedRemainingSeconds / 60));

            const resumedSession = await prisma.session.update({
              where: { id: migratedSession.id },
              data: {
                isPaused: false,
                startTime: now,
                endTime: newEndTime,
                pausedRemainingSeconds: 0,
              },
            });

            authorizeClientMac(macAddress, remainingMinutes, clientIp).catch((err) => {
              console.warn('[MAC MIGRATION] Notice authorizing resumed MAC:', err);
            });

            return {
              isAuthenticated: true,
              isPaused: false,
              macAddress,
              remainingSeconds: migratedSession.pausedRemainingSeconds,
              session: resumedSession,
              sessionToken: resumedSession.sessionToken,
            };
          }

          return {
            isAuthenticated: false,
            isPaused: true,
            macAddress,
            remainingSeconds: migratedSession.pausedRemainingSeconds,
            session: migratedSession,
            sessionToken: migratedSession.sessionToken,
          };
        }

        const remainingSeconds = Math.max(0, Math.floor((migratedSession.endTime.getTime() - now.getTime()) / 1000));
        if (remainingSeconds > 0) {
          // Authorize new MAC on OpenWrt immediately
          const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
          authorizeClientMac(macAddress, remainingMinutes, clientIp).catch((err) => {
            console.warn('[MAC MIGRATION] Notice authorizing migrated MAC:', err);
          });

          return {
            isAuthenticated: true,
            macAddress,
            remainingSeconds,
            session: migratedSession,
            sessionToken: migratedSession.sessionToken,
          };
        }
      } else {
        // Check if session for this token has EXPIRED (no remaining time)
        const expiredTokenSession = await prisma.session.findFirst({
          where: {
            OR: [
              { sessionToken: token },
              { transferCode: token },
              { transferCode: token.startsWith('PW-') ? token : `PW-${token}` },
            ],
            isActive: true,
            endTime: { lte: now },
          },
        });
        if (expiredTokenSession) {
          await prisma.session.update({
            where: { id: expiredTokenSession.id },
            data: { isActive: false },
          });

          // Safeguard: only deauthorize macAddress if it has no other active session
          const hasOtherActive = await prisma.session.findFirst({
            where: {
              macAddress,
              isActive: true,
              endTime: { gt: now },
            },
          });
          if (!hasOtherActive) {
            deauthorizeClientMac(macAddress).catch(() => {});
          }

          if (expiredTokenSession.macAddress && expiredTokenSession.macAddress.toLowerCase() !== macAddress.toLowerCase()) {
            deauthorizeClientMac(expiredTokenSession.macAddress).catch(() => {});
          }
        }
      }
    }

    return { isAuthenticated: false, macAddress, remainingSeconds: 0 };
  } catch (error: any) {
    console.error('[AUTH CHECK ERROR]', error);
    return { isAuthenticated: false, macAddress, remainingSeconds: 0 };
  }
}
