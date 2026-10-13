/**
 * In-memory exclusive coinslot session lock manager.
 * 
 * Ensures only ONE customer device can activate the coin slot, insert coins,
 * and redeem internet time at any given moment.
 * 
 * Prevents coin hijacking / session stealing where Device 2 connects
 * using coins inserted by Device 1.
 */

export interface CoinLockHolder {
  ip: string;
  mac?: string;
  sessionToken?: string;
  lockedAt: number;
  expiresAt: number;
  lastPulses: number;
}

// Global reference surviving hot-reloads in Next.js development
declare global {
  var globalCoinLock: CoinLockHolder | null | undefined;
}

let activeLock: CoinLockHolder | null = global.globalCoinLock ?? null;

function setLock(lock: CoinLockHolder | null) {
  activeLock = lock;
  global.globalCoinLock = lock;
}

/**
 * Returns current lock if active and unexpired.
 * Automatically clears expired locks.
 */
export function getActiveLock(): CoinLockHolder | null {
  if (!activeLock) return null;

  if (Date.now() > activeLock.expiresAt) {
    setLock(null);
    return null;
  }
  return activeLock;
}

/**
 * Checks whether a given client (by IP, MAC, or sessionToken) is the current lock holder.
 */
export function isClientLockHolder(
  clientIp: string,
  clientMac?: string | null,
  clientSessionToken?: string | null
): boolean {
  const lock = getActiveLock();
  if (!lock) return false;

  if (clientIp && lock.ip === clientIp) return true;
  if (clientMac && lock.mac && clientMac.toLowerCase() === lock.mac.toLowerCase()) return true;
  if (clientSessionToken && lock.sessionToken && clientSessionToken === lock.sessionToken) return true;

  return false;
}

/**
 * Acquires exclusive lock on the coin slot for a client.
 * Returns success: true if acquired (or already held by this client),
 * or success: false with remainingSeconds if held by another client.
 */
export function acquireCoinLock(
  clientIp: string,
  clientMac?: string | null,
  clientSessionToken?: string | null,
  timeoutSeconds: number = 60
): { success: boolean; error?: string; remainingSeconds?: number } {
  const now = Date.now();
  const currentLock = getActiveLock();

  if (currentLock) {
    // If the same client already holds the lock, refresh expiration and merge identifiers
    if (isClientLockHolder(clientIp, clientMac, clientSessionToken)) {
      currentLock.expiresAt = now + timeoutSeconds * 1000;
      if (clientMac && !currentLock.mac) currentLock.mac = clientMac;
      if (clientSessionToken && !currentLock.sessionToken) currentLock.sessionToken = clientSessionToken;
      return { success: true, remainingSeconds: timeoutSeconds };
    }

    // Another client holds the lock
    const remainingSeconds = Math.max(1, Math.ceil((currentLock.expiresAt - now) / 1000));
    return {
      success: false,
      error: 'COIN_SLOT_BUSY',
      remainingSeconds,
    };
  }

  // Acquire new lock
  setLock({
    ip: clientIp,
    mac: clientMac || undefined,
    sessionToken: clientSessionToken || undefined,
    lockedAt: now,
    expiresAt: now + timeoutSeconds * 1000,
    lastPulses: 0,
  });

  return { success: true, remainingSeconds: timeoutSeconds };
}

/**
 * Refreshes lock expiration whenever new coin pulses are detected from hardware.
 */
export function refreshCoinLockOnPulse(currentPulses: number, timeoutSeconds: number = 60): void {
  const lock = getActiveLock();
  if (!lock) return;

  if (currentPulses > lock.lastPulses) {
    lock.lastPulses = currentPulses;
    lock.expiresAt = Date.now() + timeoutSeconds * 1000;
  }
}

/**
 * Releases the active lock if caller is the holder, or if force is true.
 */
export function releaseCoinLock(
  clientIp?: string,
  clientMac?: string | null,
  clientSessionToken?: string | null,
  force: boolean = false
): boolean {
  const lock = getActiveLock();
  if (!lock) return true;

  if (force || isClientLockHolder(clientIp || '', clientMac, clientSessionToken)) {
    setLock(null);
    return true;
  }

  return false;
}
