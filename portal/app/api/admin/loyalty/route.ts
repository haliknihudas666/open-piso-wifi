import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import {
  getLoyaltyConfig,
  DEFAULT_LOYALTY_MILESTONES,
  getPstDateString,
  getYesterdayPstDateString,
  normalizeSessionCode,
} from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().toUpperCase() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '25', 10)));
    const skip = (page - 1) * limit;

    const config = await getLoyaltyConfig();

    const todayStr = getPstDateString();
    const yesterdayStr = getYesterdayPstDateString();

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { sessionCode: { contains: search } },
        { macAddress: { contains: search } },
        { deviceName: { contains: search } },
      ];
    }

    const [totalRecords, records, claims, allStreaks] = await Promise.all([
      prisma.loyaltyStreak.count({ where: whereClause }),
      prisma.loyaltyStreak.findMany({
        where: whereClause,
        orderBy: [{ currentStreak: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.loyaltyClaim.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.loyaltyStreak.findMany({
        select: {
          currentStreak: true,
          highestStreak: true,
          totalBonusMinutes: true,
          lastCreditDate: true,
        },
      }),
    ]);

    // Aggregate metrics
    let activeStreakersCount = 0;
    let maxStreak = 0;
    let totalBonusMinutes = 0;

    for (const s of allStreaks) {
      const isAlive = s.lastCreditDate === todayStr || s.lastCreditDate === yesterdayStr;
      if (isAlive && s.currentStreak > 0) {
        activeStreakersCount++;
      }
      if (s.highestStreak > maxStreak) {
        maxStreak = s.highestStreak;
      }
      totalBonusMinutes += s.totalBonusMinutes;
    }

    // Format records with live alive/broken status
    const formattedRecords = records.map((r) => {
      const isAlive = r.lastCreditDate === todayStr || r.lastCreditDate === yesterdayStr;
      return {
        ...r,
        isStreakAlive: isAlive,
        effectiveStreak: isAlive ? r.currentStreak : 0,
        creditedToday: r.lastCreditDate === todayStr,
      };
    });

    return NextResponse.json({
      config,
      stats: {
        totalCustomers: allStreaks.length,
        activeStreakersCount,
        highestStreak: maxStreak,
        totalBonusMinutes,
        totalClaimsCount: claims.length,
      },
      records: formattedRecords,
      pagination: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
      recentClaims: claims,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch loyalty data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'save_config') {
      const { enabled, minAmount, milestones } = body;

      if (enabled !== undefined) {
        await prisma.setting.upsert({
          where: { key: 'loyalty_enabled' },
          update: { value: String(enabled) },
          create: { key: 'loyalty_enabled', value: String(enabled) },
        });
      }

      if (minAmount !== undefined) {
        const val = Math.max(1, parseInt(String(minAmount), 10) || 1);
        await prisma.setting.upsert({
          where: { key: 'loyalty_min_amount' },
          update: { value: String(val) },
          create: { key: 'loyalty_min_amount', value: String(val) },
        });
      }

      if (Array.isArray(milestones)) {
        const cleaned = milestones
          .map((m: any) => ({
            days: Math.max(1, parseInt(m.days, 10) || 1),
            bonusMinutes: Math.max(1, parseInt(m.bonusMinutes, 10) || 1),
            rewardName: String(m.rewardName || `${m.days}-Day Streak Bonus`).trim(),
          }))
          .sort((a, b) => a.days - b.days);

        await prisma.setting.upsert({
          where: { key: 'loyalty_milestones' },
          update: { value: JSON.stringify(cleaned) },
          create: { key: 'loyalty_milestones', value: JSON.stringify(cleaned) },
        });
      }

      return NextResponse.json({ success: true, message: 'Loyalty configuration saved successfully.' });
    }

    if (action === 'reset_streak') {
      const sessionCode = normalizeSessionCode(body.sessionCode);
      await prisma.loyaltyStreak.update({
        where: { sessionCode },
        data: {
          currentStreak: 0,
          lastCreditDate: null,
        },
      });
      return NextResponse.json({ success: true, message: `Streak reset for session ${sessionCode}` });
    }

    if (action === 'adjust_streak') {
      const sessionCode = normalizeSessionCode(body.sessionCode);
      const newStreak = Math.max(0, parseInt(body.streak, 10) || 0);
      const todayStr = getPstDateString();

      await prisma.loyaltyStreak.update({
        where: { sessionCode },
        data: {
          currentStreak: newStreak,
          highestStreak: Math.max(newStreak, body.highestStreak || newStreak),
          lastCreditDate: newStreak > 0 ? todayStr : null,
        },
      });
      return NextResponse.json({ success: true, message: `Streak updated to ${newStreak} for ${sessionCode}` });
    }

    if (action === 'delete_record') {
      const sessionCode = normalizeSessionCode(body.sessionCode);
      await prisma.loyaltyStreak.delete({
        where: { sessionCode },
      });
      return NextResponse.json({ success: true, message: `Record deleted for ${sessionCode}` });
    }

    return NextResponse.json({ error: 'Unknown action specified' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Loyalty operation failed' }, { status: 500 });
  }
}
