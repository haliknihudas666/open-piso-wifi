import { PrismaClient } from '@prisma/client';

import path from 'path';
import fs from 'fs';

/**
 * Determine the actual SQLite database path and prevent "Error code 14: Unable to open the database file".
 * Prisma resolves relative URLs starting with 'file:./' relative to schema.prisma location (./prisma/).
 * If DATABASE_URL is 'file:./prisma/dev.db', Prisma resolves it to 'prisma/prisma/dev.db' which fails.
 */
function getResolvedDatabaseUrl(): string {
  let dbUrl = process.env.DATABASE_URL || 'file:./dev.db';

  if (!dbUrl.startsWith('file:')) {
    return dbUrl;
  }

  // Parse existing query string and ensure connection_limit=1 to prevent SQLite lock contention
  const [filePathPart, queryString] = dbUrl.replace(/^file:/, '').split('?');
  const params = new URLSearchParams(queryString || '');
  if (!params.has('connection_limit')) {
    params.set('connection_limit', '1');
  }

  const cwd = process.cwd();
  let resolvedFilePath = filePathPart;

  if (path.isAbsolute(filePathPart) && fs.existsSync(filePathPart)) {
    resolvedFilePath = filePathPart;
  } else {
    // Search known standard locations for dev.db
    const candidates = [
      path.resolve(cwd, 'prisma', 'dev.db'),
      path.resolve(cwd, 'portal', 'prisma', 'dev.db'),
      path.resolve(cwd, 'pisowifi-portal', 'prisma', 'dev.db'),
      path.resolve(cwd, 'dev.db'),
      path.resolve(cwd, 'portal', 'dev.db'),
      path.resolve(cwd, 'pisowifi-portal', 'dev.db'),
      path.resolve(/*turbopackIgnore: true*/ cwd, filePathPart),
    ];

    const found = candidates.find((c) => fs.existsSync(c));
    if (found) {
      resolvedFilePath = found;
    } else {
      resolvedFilePath = path.resolve(cwd, 'prisma', 'dev.db');
    }
  }

  // Normalize Windows backslashes to forward slashes for Prisma URI parser
  const normalizedPath = resolvedFilePath.replace(/\\/g, '/');
  return `file:${normalizedPath}?${params.toString()}`;
}

const resolvedDbUrl = getResolvedDatabaseUrl();
process.env.DATABASE_URL = resolvedDbUrl;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  isPragmaInitialized: boolean | undefined;
  pragmaInitPromise: Promise<void> | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolvedDbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Always store singleton on globalThis to prevent multiple connection pools in production standalone
globalForPrisma.prisma = prisma;

/**
 * Configure SQLite PRAGMAs for Raspberry Pi performance:
 * - WAL (Write-Ahead Logging): Drastically reduces SD card wear & permits concurrent reads/writes
 * - synchronous = NORMAL: Balances durability and SD card write cycles
 * - busy_timeout = 15000: Prevents database locked errors during concurrent traffic bursts
 * - Deduplicated across all concurrent route handlers via shared promise
 */
export async function ensureSqlitePragmas(): Promise<void> {
  if (globalForPrisma.isPragmaInitialized) return;
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  if (globalForPrisma.pragmaInitPromise) {
    return globalForPrisma.pragmaInitPromise;
  }

  globalForPrisma.pragmaInitPromise = (async () => {
    try {
      // 1. Set busy_timeout FIRST so SQLite queues instead of immediately throwing lock errors
      await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 15000;').catch(() => {});
      await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
      await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {});
      await prisma.$queryRawUnsafe('PRAGMA wal_autocheckpoint = 250;').catch(() => {});
      await ensureSchemaColumns();
    } catch (error) {
      if (process.env.NEXT_PHASE !== 'phase-production-build') {
        console.error('Failed to configure SQLite pragmas:', error);
      }
    } finally {
      globalForPrisma.isPragmaInitialized = true;
      globalForPrisma.pragmaInitPromise = undefined;
    }
  })();

  return globalForPrisma.pragmaInitPromise;
}

/**
 * Auto-migrate newly added columns into existing SQLite databases safely.
 * Prevents "The column main.Session.sessionToken does not exist" errors
 * when restoring from backups or older templates without running prisma db push manually.
 */
async function ensureSchemaColumns() {
  try {
    const tableInfo = (await prisma.$queryRawUnsafe(
      `PRAGMA table_info("Session");`
    )) as Array<{ name: string }>;

    if (Array.isArray(tableInfo) && tableInfo.length > 0) {
      const columnNames = new Set(tableInfo.map((col) => col.name));

      if (!columnNames.has('sessionToken')) {
        await prisma.$queryRawUnsafe(`ALTER TABLE "Session" ADD COLUMN "sessionToken" TEXT;`).catch(() => {});
        await prisma.$queryRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");`).catch(() => {});
        await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "Session_sessionToken_idx" ON "Session"("sessionToken");`).catch(() => {});
      }

      if (!columnNames.has('deviceName')) {
        await prisma.$queryRawUnsafe(`ALTER TABLE "Session" ADD COLUMN "deviceName" TEXT;`).catch(() => {});
      }

      if (!columnNames.has('transferCode')) {
        await prisma.$queryRawUnsafe(`ALTER TABLE "Session" ADD COLUMN "transferCode" TEXT;`).catch(() => {});
        await prisma.$queryRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Session_transferCode_key" ON "Session"("transferCode");`).catch(() => {});
        await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "Session_transferCode_idx" ON "Session"("transferCode");`).catch(() => {});
      }
    }

    const voucherTableInfo = (await prisma.$queryRawUnsafe(
      `PRAGMA table_info("Voucher");`
    )) as Array<{ name: string }>;

    if (Array.isArray(voucherTableInfo) && voucherTableInfo.length > 0) {
      const voucherColumnNames = new Set(voucherTableInfo.map((col) => col.name));

      if (!voucherColumnNames.has('isRevoked')) {
        await prisma.$queryRawUnsafe(`ALTER TABLE "Voucher" ADD COLUMN "isRevoked" BOOLEAN NOT NULL DEFAULT 0;`).catch(() => {});
        await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "Voucher_isRevoked_idx" ON "Voucher"("isRevoked");`).catch(() => {});
      }

      if (!voucherColumnNames.has('revokedAt')) {
        await prisma.$queryRawUnsafe(`ALTER TABLE "Voucher" ADD COLUMN "revokedAt" DATETIME;`).catch(() => {});
      }
    }

    // Auto-create Loyalty tables for streak tracking by sessionCode
    await prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LoyaltyStreak" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "sessionCode" TEXT UNIQUE NOT NULL,
        "macAddress" TEXT,
        "deviceName" TEXT,
        "currentStreak" INTEGER NOT NULL DEFAULT 0,
        "highestStreak" INTEGER NOT NULL DEFAULT 0,
        "lastCreditDate" TEXT,
        "lastCreditedAt" DATETIME,
        "totalCredits" INTEGER NOT NULL DEFAULT 0,
        "totalAmountSpent" REAL NOT NULL DEFAULT 0,
        "totalBonusMinutes" INTEGER NOT NULL DEFAULT 0,
        "lastBonusReward" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    await prisma.$queryRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyStreak_sessionCode_key" ON "LoyaltyStreak"("sessionCode");`).catch(() => {});
    await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "LoyaltyStreak_sessionCode_idx" ON "LoyaltyStreak"("sessionCode");`).catch(() => {});
    await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "LoyaltyStreak_macAddress_idx" ON "LoyaltyStreak"("macAddress");`).catch(() => {});
    await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "LoyaltyStreak_currentStreak_idx" ON "LoyaltyStreak"("currentStreak");`).catch(() => {});

    await prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LoyaltyClaim" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "sessionCode" TEXT NOT NULL,
        "streakDays" INTEGER NOT NULL,
        "bonusMinutes" INTEGER NOT NULL,
        "rewardTitle" TEXT NOT NULL,
        "macAddress" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "LoyaltyClaim_sessionCode_idx" ON "LoyaltyClaim"("sessionCode");`).catch(() => {});
    await prisma.$queryRawUnsafe(`CREATE INDEX IF NOT EXISTS "LoyaltyClaim_createdAt_idx" ON "LoyaltyClaim"("createdAt");`).catch(() => {});
  } catch (err) {
    // Suppress non-fatal schema migration errors
  }
}

// Automatically invoke pragma configuration at runtime (skipped during static builds)
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  ensureSqlitePragmas().catch(() => {});
}

export default prisma;

