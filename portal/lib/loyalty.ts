import { prisma, ensureSqlitePragmas } from './prisma';

export interface LoyaltyMilestone {
  days: number;           // e.g. 3, 7, 14, 30
  bonusMinutes: number;   // e.g. 60 (1 hr), 360 (6 hrs)
  rewardName: string;     // e.g. "3-Day Streak (1 Free Hour)"
}

export interface LoyaltyConfig {
  enabled: boolean;
  minAmount: number;      // e.g. 1 (in PHP)
  milestones: LoyaltyMilestone[];
}

export const DEFAULT_LOYALTY_MILESTONES: LoyaltyMilestone[] = [
  { days: 3, bonusMinutes: 60, rewardName: '3-Day Streak (1 Free Hour)' },
  { days: 7, bonusMinutes: 360, rewardName: '7-Day Streak (6 Free Hours)' },
  { days: 14, bonusMinutes: 720, rewardName: '14-Day Streak (12 Free Hours)' },
  { days: 30, bonusMinutes: 1440, rewardName: '30-Day Legend (24 Free Hours)' },
];

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: true,
  minAmount: 1,
  milestones: DEFAULT_LOYALTY_MILESTONES,
};

/**
 * Returns date in YYYY-MM-DD format using Philippine Standard Time (PST / UTC+8).
 * Standard for Piso Wi-Fi installations in the Philippines.
 */
export function getPstDateString(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function getYesterdayPstDateString(date: Date = new Date()): string {
  const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getPstDateString(yesterday);
}

/**
 * Normalizes customer session codes to consistent format (e.g. PW-GDQLWK)
 */
export function normalizeSessionCode(code: string): string {
  const cleaned = code.trim().toUpperCase();
  if (cleaned.startsWith('PW-')) return cleaned;
  return `PW-${cleaned}`;
}

/**
 * Loads current Loyalty configuration from database settings
 */
export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  await ensureSqlitePragmas();

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['loyalty_enabled', 'loyalty_min_amount', 'loyalty_milestones'],
        },
      },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));

    const enabled = map.has('loyalty_enabled') ? map.get('loyalty_enabled') === 'true' : true;
    const minAmount = map.has('loyalty_min_amount')
      ? Math.max(1, parseInt(map.get('loyalty_min_amount') || '1', 10) || 1)
      : 1;

    let milestones = DEFAULT_LOYALTY_MILESTONES;
    if (map.has('loyalty_milestones')) {
      try {
        const parsed = JSON.parse(map.get('loyalty_milestones')!);
        if (Array.isArray(parsed) && parsed.length > 0) {
          milestones = parsed
            .map((m: any) => ({
              days: Math.max(1, parseInt(m.days, 10) || 1),
              bonusMinutes: Math.max(1, parseInt(m.bonusMinutes, 10) || 1),
              rewardName: String(m.rewardName || `${m.days}-Day Streak Bonus`),
            }))
            .sort((a: LoyaltyMilestone, b: LoyaltyMilestone) => a.days - b.days);
        }
      } catch {}
    }

    return { enabled, minAmount, milestones };
  } catch (error) {
    console.warn('[LOYALTY] Failed to load loyalty config, using defaults:', error);
    return DEFAULT_LOYALTY_CONFIG;
  }
}

export interface LoyaltyCustomerStatus {
  enabled: boolean;
  sessionCode: string;
  currentStreak: number;
  highestStreak: number;
  lastCreditDate: string | null;
  creditedToday: boolean;
  streakAlive: boolean; // true if credited today or yesterday
  nextMilestone: (LoyaltyMilestone & { daysRemaining: number }) | null;
  allMilestones: LoyaltyMilestone[];
  totalCredits: number;
  totalAmountSpent: number;
  totalBonusMinutes: number;
  lastBonusReward: string | null;
}

/**
 * Retrieves the loyalty status for a given sessionCode or MAC
 */
export async function getLoyaltyStatus(
  rawSessionCode: string,
  macAddress?: string | null
): Promise<LoyaltyCustomerStatus> {
  const sessionCode = normalizeSessionCode(rawSessionCode);
  const config = await getLoyaltyConfig();

  await ensureSqlitePragmas();

  const todayStr = getPstDateString();
  const yesterdayStr = getYesterdayPstDateString();

  // Find record by sessionCode or macAddress
  let record = await prisma.loyaltyStreak.findUnique({
    where: { sessionCode },
  });

  if (!record && macAddress) {
    record = await prisma.loyaltyStreak.findFirst({
      where: { macAddress },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (!record) {
    // Brand new customer: 0 streak
    const nextMilestone = config.milestones.length > 0
      ? { ...config.milestones[0], daysRemaining: config.milestones[0].days }
      : null;

    return {
      enabled: config.enabled,
      sessionCode,
      currentStreak: 0,
      highestStreak: 0,
      lastCreditDate: null,
      creditedToday: false,
      streakAlive: true,
      nextMilestone,
      allMilestones: config.milestones,
      totalCredits: 0,
      totalAmountSpent: 0,
      totalBonusMinutes: 0,
      lastBonusReward: null,
    };
  }

  const creditedToday = record.lastCreditDate === todayStr;
  const creditedYesterday = record.lastCreditDate === yesterdayStr;
  const streakAlive = creditedToday || creditedYesterday || !record.lastCreditDate;

  // If the streak was broken (last credit before yesterday), effective current streak is 0
  const effectiveCurrentStreak = streakAlive ? record.currentStreak : 0;

  // Determine the next milestone
  const next = config.milestones.find((m) => m.days > effectiveCurrentStreak) || null;
  const nextMilestone = next
    ? {
        ...next,
        daysRemaining: Math.max(1, next.days - effectiveCurrentStreak),
      }
    : null;

  return {
    enabled: config.enabled,
    sessionCode: record.sessionCode,
    currentStreak: effectiveCurrentStreak,
    highestStreak: record.highestStreak,
    lastCreditDate: record.lastCreditDate,
    creditedToday,
    streakAlive,
    nextMilestone,
    allMilestones: config.milestones,
    totalCredits: record.totalCredits,
    totalAmountSpent: record.totalAmountSpent,
    totalBonusMinutes: record.totalBonusMinutes,
    lastBonusReward: record.lastBonusReward,
  };
}

export interface ProcessLoyaltyCreditResult {
  enabled: boolean;
  sessionCode: string;
  currentStreak: number;
  previousStreak: number;
  isConsecutiveDay: boolean;
  creditedTodayAlready: boolean;
  isBonusAwarded: boolean;
  bonusMinutes: number;
  rewardName: string | null;
  highestStreak: number;
}

/**
 * Called when a customer pays/credits time.
 * Evaluates streak progress, updates LoyaltyStreak record, and awards bonus if milestone is reached.
 */
export async function processLoyaltyCredit(params: {
  sessionCode: string;
  macAddress?: string | null;
  deviceName?: string | null;
  amountPaid: number;
}): Promise<ProcessLoyaltyCreditResult> {
  const { sessionCode: rawCode, macAddress, deviceName, amountPaid } = params;
  const sessionCode = normalizeSessionCode(rawCode);
  const config = await getLoyaltyConfig();

  if (!config.enabled || amountPaid < config.minAmount) {
    const existing = await prisma.loyaltyStreak.findUnique({ where: { sessionCode } });
    return {
      enabled: config.enabled,
      sessionCode,
      currentStreak: existing?.currentStreak || 0,
      previousStreak: existing?.currentStreak || 0,
      isConsecutiveDay: false,
      creditedTodayAlready: false,
      isBonusAwarded: false,
      bonusMinutes: 0,
      rewardName: null,
      highestStreak: existing?.highestStreak || 0,
    };
  }

  await ensureSqlitePragmas();

  const now = new Date();
  const todayStr = getPstDateString(now);
  const yesterdayStr = getYesterdayPstDateString(now);

  let existing = await prisma.loyaltyStreak.findUnique({
    where: { sessionCode },
  });

  if (!existing && macAddress) {
    existing = await prisma.loyaltyStreak.findFirst({
      where: { macAddress },
      orderBy: { updatedAt: 'desc' },
    });
  }

  let currentStreak = 0;
  let previousStreak = 0;
  let isConsecutiveDay = false;
  let creditedTodayAlready = false;
  let isBonusAwarded = false;
  let bonusMinutes = 0;
  let rewardName: string | null = null;
  let highestStreak = 0;

  if (!existing) {
    // Brand new streak: Day 1
    currentStreak = 1;
    previousStreak = 0;
    highestStreak = 1;
  } else {
    previousStreak = existing.currentStreak;
    highestStreak = existing.highestStreak;

    if (existing.lastCreditDate === todayStr) {
      // Already credited today: keep streak as-is (prevent duplicate same-day streak jumps)
      currentStreak = Math.max(1, existing.currentStreak);
      creditedTodayAlready = true;
    } else if (existing.lastCreditDate === yesterdayStr) {
      // Consecutive day! Streak continues!
      currentStreak = existing.currentStreak + 1;
      isConsecutiveDay = true;
      highestStreak = Math.max(highestStreak, currentStreak);
    } else {
      // Missed 1 or more days: streak reset to Day 1
      currentStreak = 1;
      highestStreak = Math.max(highestStreak, currentStreak);
    }
  }

  // Check if currentStreak hits any configured milestone
  // Only award if it is a fresh streak jump today (not already credited today)
  if (!creditedTodayAlready) {
    const matchedMilestone = config.milestones.find((m) => m.days === currentStreak);
    if (matchedMilestone) {
      isBonusAwarded = true;
      bonusMinutes = matchedMilestone.bonusMinutes;
      rewardName = matchedMilestone.rewardName;

      // Log claim in LoyaltyClaim history
      await prisma.loyaltyClaim.create({
        data: {
          sessionCode,
          streakDays: currentStreak,
          bonusMinutes,
          rewardTitle: rewardName,
          macAddress: macAddress || null,
        },
      }).catch((err) => console.warn('[LOYALTY CLAIM] Failed to log claim:', err));
    }
  }

  // Upsert the LoyaltyStreak record
  const totalBonusMinutesToAdd = isBonusAwarded ? bonusMinutes : 0;

  await prisma.loyaltyStreak.upsert({
    where: { sessionCode },
    create: {
      sessionCode,
      macAddress: macAddress || null,
      deviceName: deviceName || null,
      currentStreak,
      highestStreak,
      lastCreditDate: todayStr,
      lastCreditedAt: now,
      totalCredits: 1,
      totalAmountSpent: amountPaid,
      totalBonusMinutes: totalBonusMinutesToAdd,
      lastBonusReward: rewardName || null,
    },
    update: {
      macAddress: macAddress || undefined,
      deviceName: deviceName || undefined,
      currentStreak,
      highestStreak,
      lastCreditDate: todayStr,
      lastCreditedAt: now,
      totalCredits: { increment: 1 },
      totalAmountSpent: { increment: amountPaid },
      totalBonusMinutes: { increment: totalBonusMinutesToAdd },
      lastBonusReward: rewardName || undefined,
    },
  });

  return {
    enabled: true,
    sessionCode,
    currentStreak,
    previousStreak,
    isConsecutiveDay,
    creditedTodayAlready,
    isBonusAwarded,
    bonusMinutes,
    rewardName,
    highestStreak,
  };
}
