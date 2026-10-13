import { NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    return NextResponse.json({
      todayRevenue: salesToday._sum.amount || 0,
      todayTransactions: salesToday._count.id || 0,
      allTimeRevenue: allTimeSales._sum.amount || 0,
      allTimeTransactions: allTimeSales._count.id || 0,
      activeSessions: activeSessionsCount,
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
