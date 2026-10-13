export interface RateTier {
  amount: number;
  minutes: number;
  label?: string;
  popular?: boolean;
  isPromo?: boolean;
}

export interface PromoRatesConfig {
  enabled: boolean;
  startHour: number; // e.g. 22 (10 PM)
  endHour: number;   // e.g. 6 (6 AM)
  title?: string;    // e.g. "Night Owl Promo"
  tiers: RateTier[];
}

export const DEFAULT_RATE_TIERS: RateTier[] = [
  { amount: 1, minutes: 10, label: '10 Mins', popular: false },
  { amount: 5, minutes: 60, label: '1 Hour', popular: true },
  { amount: 10, minutes: 150, label: '2.5 Hours', popular: false },
  { amount: 20, minutes: 360, label: '6 Hours', popular: false },
  { amount: 50, minutes: 1440, label: '24 Hours (1 Day)', popular: false },
];

export const DEFAULT_PROMO_TIERS: RateTier[] = [
  { amount: 5, minutes: 120, label: '2 Hours (Night Promo)', popular: false, isPromo: true },
  { amount: 10, minutes: 360, label: '6 Hours (Night Promo)', popular: true, isPromo: true },
  { amount: 20, minutes: 720, label: '12 Hours (Night Promo)', popular: false, isPromo: true },
];

/**
 * Checks if current time is within promo hours (handles overnight wraps like 22 to 6).
 */
export function isPromoActive(startHour = 22, endHour = 6, currentHour?: number): boolean {
  const hour = currentHour !== undefined ? currentHour : new Date().getHours();
  if (startHour <= endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

/**
 * Calculates total minutes for an inserted coin amount using tiered rate brackets.
 * 
 * Algorithm:
 * 1. Checks for exact match in configured tiers (e.g. ₱5 -> 60 mins, ₱10 -> 150 mins, ₱20 -> 360 mins, ₱50 -> 1440 mins).
 * 2. If no exact match (e.g. ₱15, ₱25), decomposes into highest matching rate brackets:
 *    - ₱15 = ₱10 tier (150m) + ₱5 tier (60m) = 210 mins (3.5 hours)
 *    - ₱25 = ₱20 tier (360m) + ₱5 tier (60m) = 420 mins (7.0 hours)
 *    - ₱7  = ₱5 tier (60m) + 2x ₱1 tier (20m) = 80 mins
 * 3. Any fractional leftover uses defaultMinutesPerPeso fallback.
 */
export function calculateDurationFromAmount(
  amount: number,
  tiers: RateTier[] = DEFAULT_RATE_TIERS,
  defaultMinutesPerPeso = 10
): number {
  if (amount <= 0) return 0;

  // 1. Direct exact match check
  const exact = tiers.find((t) => t.amount === amount);
  if (exact) {
    return exact.minutes;
  }

  // 2. Multi-tier greedy combination
  const sorted = [...tiers]
    .filter((t) => t.amount > 0 && t.minutes > 0)
    .sort((a, b) => b.amount - a.amount);

  let remaining = amount;
  let totalMinutes = 0;

  for (const tier of sorted) {
    if (remaining >= tier.amount) {
      const count = Math.floor(remaining / tier.amount);
      totalMinutes += count * tier.minutes;
      remaining = remaining % tier.amount;
    }
  }

  // 3. Fallback for any leftover change
  if (remaining > 0) {
    totalMinutes += remaining * defaultMinutesPerPeso;
  }

  return totalMinutes;
}
