import { prisma, ensureSqlitePragmas } from '../lib/prisma';
import {
  processLoyaltyCredit,
  getLoyaltyStatus,
  getLoyaltyConfig,
  getPstDateString,
  getYesterdayPstDateString,
  normalizeSessionCode,
  DEFAULT_LOYALTY_MILESTONES,
} from '../lib/loyalty';

async function runLoyaltyTests() {
  console.log('🧪 Starting Loyalty & Streak System Tests...\n');
  await ensureSqlitePragmas();

  const testSessionCode = 'PW-TESTSTREAK99';

  // Cleanup any existing test data
  await prisma.loyaltyClaim.deleteMany({ where: { sessionCode: testSessionCode } }).catch(() => {});
  await prisma.loyaltyStreak.deleteMany({ where: { sessionCode: testSessionCode } }).catch(() => {});

  // Test 1: Config loading
  console.log('Test 1: Loading Loyalty Config...');
  const config = await getLoyaltyConfig();
  console.log('✓ Config loaded:', {
    enabled: config.enabled,
    minAmount: config.minAmount,
    milestonesCount: config.milestones.length,
  });
  if (!config.enabled || config.milestones.length === 0) {
    throw new Error('Default config failed to load');
  }

  // Test 2: Initial Status for new customer
  console.log('\nTest 2: Initial status for brand new customer...');
  const initialStatus = await getLoyaltyStatus(testSessionCode);
  console.log('✓ Initial streak:', initialStatus.currentStreak);
  console.log('✓ Next milestone target:', initialStatus.nextMilestone?.days, 'days');
  if (initialStatus.currentStreak !== 0 || initialStatus.nextMilestone?.days !== 3) {
    throw new Error('Expected 0 initial streak and 3-day target');
  }

  // Test 3: Day 1 Credit
  console.log('\nTest 3: Processing Day 1 Credit (₱5)...');
  const day1Result = await processLoyaltyCredit({
    sessionCode: testSessionCode,
    macAddress: 'aa:bb:cc:dd:ee:ff',
    deviceName: 'Test Phone',
    amountPaid: 5,
  });
  console.log('✓ Day 1 result:', {
    currentStreak: day1Result.currentStreak,
    isBonusAwarded: day1Result.isBonusAwarded,
  });
  if (day1Result.currentStreak !== 1 || day1Result.isBonusAwarded) {
    throw new Error('Day 1 should have streak 1 and no bonus yet');
  }

  // Test 4: Same-day duplicate credit
  console.log('\nTest 4: Same-day duplicate credit (should not jump streak)...');
  const sameDayResult = await processLoyaltyCredit({
    sessionCode: testSessionCode,
    macAddress: 'aa:bb:cc:dd:ee:ff',
    deviceName: 'Test Phone',
    amountPaid: 10,
  });
  console.log('✓ Same-day result:', {
    currentStreak: sameDayResult.currentStreak,
    creditedTodayAlready: sameDayResult.creditedTodayAlready,
  });
  if (sameDayResult.currentStreak !== 1 || !sameDayResult.creditedTodayAlready) {
    throw new Error('Same day credit should keep streak at 1');
  }

  // Test 5: Simulate Day 2 by backdating lastCreditDate to yesterday
  console.log('\nTest 5: Simulating Day 2 (consecutive credit)...');
  const yesterdayStr = getYesterdayPstDateString();
  await prisma.loyaltyStreak.update({
    where: { sessionCode: testSessionCode },
    data: {
      currentStreak: 1,
      lastCreditDate: yesterdayStr,
    },
  });

  const day2Result = await processLoyaltyCredit({
    sessionCode: testSessionCode,
    macAddress: 'aa:bb:cc:dd:ee:ff',
    deviceName: 'Test Phone',
    amountPaid: 5,
  });
  console.log('✓ Day 2 result:', {
    currentStreak: day2Result.currentStreak,
    isConsecutiveDay: day2Result.isConsecutiveDay,
    isBonusAwarded: day2Result.isBonusAwarded,
  });
  if (day2Result.currentStreak !== 2 || !day2Result.isConsecutiveDay || day2Result.isBonusAwarded) {
    throw new Error('Day 2 should reach streak 2 with no bonus');
  }

  // Test 6: Simulate Day 3 milestone hit (+60 mins reward)
  console.log('\nTest 6: Simulating Day 3 (Milestone Hit: +60 mins reward)...');
  await prisma.loyaltyStreak.update({
    where: { sessionCode: testSessionCode },
    data: {
      currentStreak: 2,
      lastCreditDate: yesterdayStr,
    },
  });

  const day3Result = await processLoyaltyCredit({
    sessionCode: testSessionCode,
    macAddress: 'aa:bb:cc:dd:ee:ff',
    deviceName: 'Test Phone',
    amountPaid: 5,
  });
  console.log('✓ Day 3 milestone result:', {
    currentStreak: day3Result.currentStreak,
    isBonusAwarded: day3Result.isBonusAwarded,
    bonusMinutes: day3Result.bonusMinutes,
    rewardName: day3Result.rewardName,
  });
  if (day3Result.currentStreak !== 3 || !day3Result.isBonusAwarded || day3Result.bonusMinutes !== 60) {
    throw new Error('Day 3 milestone should award +60 mins');
  }

  // Test 7: Verify claim record
  const claimRecord = await prisma.loyaltyClaim.findFirst({
    where: { sessionCode: testSessionCode, streakDays: 3 },
  });
  console.log('✓ Claim logged in LoyaltyClaim table:', claimRecord?.rewardTitle);
  if (!claimRecord) throw new Error('Claim record not found in DB');

  // Test 8: Simulate Broken Streak (last credit 3 days ago)
  console.log('\nTest 8: Simulating Broken Streak (missed days)...');
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await prisma.loyaltyStreak.update({
    where: { sessionCode: testSessionCode },
    data: {
      currentStreak: 3,
      lastCreditDate: threeDaysAgo,
    },
  });

  const brokenResult = await processLoyaltyCredit({
    sessionCode: testSessionCode,
    macAddress: 'aa:bb:cc:dd:ee:ff',
    deviceName: 'Test Phone',
    amountPaid: 5,
  });
  console.log('✓ Broken streak result:', {
    currentStreak: brokenResult.currentStreak,
    highestStreak: brokenResult.highestStreak,
  });
  if (brokenResult.currentStreak !== 1 || brokenResult.highestStreak !== 3) {
    throw new Error('Broken streak should reset to 1 while keeping highestStreak at 3');
  }

  // Cleanup test data
  await prisma.loyaltyClaim.deleteMany({ where: { sessionCode: testSessionCode } });
  await prisma.loyaltyStreak.deleteMany({ where: { sessionCode: testSessionCode } });

  console.log('\n🎉 ALL 8 LOYALTY & STREAK SYSTEM TESTS PASSED SUCCESSFULLY!');
}

runLoyaltyTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
