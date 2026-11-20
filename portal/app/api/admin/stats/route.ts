import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Sales today
    const salesToday = await prisma.sale.aggregate({
      where: {
        createdAt: { gte: startOfToday },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // 2. All time sales
    const allTimeSales = await prisma.sale.aggregate({
      _sum: { amount: true },
      _count: { id: true },
    });

    // 3. Active sessions count
    const activeSessionsCount = await prisma.session.count({
      where: {
        isActive: true,
        endTime: { gt: now },
      },
    });

    // 4. Voucher metrics
    const totalVouchersCount = await prisma.voucher.count();
    const unusedVouchersCount = await prisma.voucher.count({
      where: { isUsed: false, isRevoked: false },
    });
    const revokedVouchersCount = await prisma.voucher.count({
      where: { isRevoked: true },
    });

    // 5. Recent 10 sales
    const recentSales = await prisma.sale.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // 6. Unique customers served (distinct MACs across sessions & sales), top streak & cached speedtest
    const [sessionMacs, saleMacs, topStreakRecord, speedSetting] = await Promise.all([
      prisma.session.findMany({
        select: { macAddress: true },
        distinct: ['macAddress'],
      }),
      prisma.sale.findMany({
        where: { macAddress: { not: null } },
        select: { macAddress: true },
        distinct: ['macAddress'],
      }),
      prisma.loyaltyStreak.findFirst({
        orderBy: { highestStreak: 'desc' },
        select: { highestStreak: true, currentStreak: true },
      }),
      prisma.setting.findUnique({
        where: { key: 'latest_speedtest' },
      }),
    ]);

    const uniqueMacSet = new Set<string>();
    for (const s of sessionMacs) {
      if (s.macAddress) uniqueMacSet.add(s.macAddress.toLowerCase());
    }
    for (const s of saleMacs) {
      if (s.macAddress) uniqueMacSet.add(s.macAddress.toLowerCase());
    }

    let latestSpeedMbps: number | null = null;
    if (speedSetting?.value) {
      try {
        const parsed = JSON.parse(speedSetting.value) as { downloadMbps?: number };
        if (typeof parsed.downloadMbps === 'number' && parsed.downloadMbps > 0) {
          latestSpeedMbps = parsed.downloadMbps;
        }
      } catch {}
    }

    const topStreak = Math.max(
      topStreakRecord?.highestStreak || 0,
      topStreakRecord?.currentStreak || 0
    );

    return NextResponse.json({
      todayRevenue: salesToday._sum.amount || 0,
      todayTransactions: salesToday._count.id || 0,
      allTimeRevenue: allTimeSales._sum.amount || 0,
      allTimeTransactions: allTimeSales._count.id || 0,
      activeSessions: activeSessionsCount,
      uniqueUsers: uniqueMacSet.size,
      topStreak,
      latestSpeedMbps,
      totalVouchers: totalVouchersCount,
      unusedVouchers: unusedVouchersCount,
      revokedVouchers: revokedVouchersCount,
      recentSales,
    });
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch admin stats' }, { status: 500 });
  }
}
