/**
 * Sliding-window failure rate limiter with timed lockout.
 * Persisted on globalThis across Next.js dev hot-reloads.
 */

export interface RateLimitPolicy {
  maxFailures: number;
  windowMs: number;
  lockoutMs: number;
}

interface RateLimitBucket {
  failures: number[];
  lockedUntil: number;
}

export const ADMIN_LOGIN_POLICY: RateLimitPolicy = {
  maxFailures: 5,
  windowMs: 5 * 60 * 1000,   // 5 minutes
  lockoutMs: 15 * 60 * 1000, // 15 minutes
};

export const VOUCHER_ATTEMPT_POLICY: RateLimitPolicy = {
  maxFailures: 10,
  windowMs: 5 * 60 * 1000,   // 5 minutes
  lockoutMs: 5 * 60 * 1000,  // 5 minutes
};

declare global {
  var globalRateLimitStore: Map<string, RateLimitBucket> | undefined;
}

const store: Map<string, RateLimitBucket> = global.globalRateLimitStore ?? new Map();
global.globalRateLimitStore = store;

function bucketKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function pruneStoreIfNeeded(now: number, maxWindowMs: number): void {
  if (store.size < 1000) return;
  for (const [k, bucket] of store.entries()) {
    const activeFailures = bucket.failures.filter((ts) => now - ts < maxWindowMs);
    if (bucket.lockedUntil <= now && activeFailures.length === 0) {
      store.delete(k);
    }
  }
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
}

export function checkRateLimit(
  namespace: string,
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now()
): RateLimitCheckResult {
  const fullKey = bucketKey(namespace, key);
  const bucket = store.get(fullKey);
  if (!bucket) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: policy.maxFailures,
    };
  }

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
      remainingAttempts: 0,
    };
  }

  bucket.failures = bucket.failures.filter((ts) => now - ts < policy.windowMs);
  if (bucket.failures.length === 0 && bucket.lockedUntil <= now) {
    store.delete(fullKey);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: policy.maxFailures,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, policy.maxFailures - bucket.failures.length),
  };
}

export interface RateLimitRecordResult {
  locked: boolean;
  failuresCount: number;
  retryAfterSeconds: number;
  remainingAttempts: number;
}

export function recordRateLimitFailure(
  namespace: string,
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now()
): RateLimitRecordResult {
  pruneStoreIfNeeded(now, policy.windowMs);
  const fullKey = bucketKey(namespace, key);
  const bucket = store.get(fullKey) ?? { failures: [], lockedUntil: 0 };

  if (bucket.lockedUntil > now) {
    return {
      locked: true,
      failuresCount: policy.maxFailures,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
      remainingAttempts: 0,
    };
  }

  bucket.failures = bucket.failures.filter((ts) => now - ts < policy.windowMs);
  bucket.failures.push(now);

  if (bucket.failures.length >= policy.maxFailures) {
    bucket.lockedUntil = now + policy.lockoutMs;
    bucket.failures = [];
    store.set(fullKey, bucket);
    return {
      locked: true,
      failuresCount: policy.maxFailures,
      retryAfterSeconds: Math.max(1, Math.ceil(policy.lockoutMs / 1000)),
      remainingAttempts: 0,
    };
  }

  store.set(fullKey, bucket);
  return {
    locked: false,
    failuresCount: bucket.failures.length,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, policy.maxFailures - bucket.failures.length),
  };
}

export function clearRateLimit(namespace: string, key: string): void {
  store.delete(bucketKey(namespace, key));
}

export function resetAllRateLimits(): void {
  store.clear();
}
