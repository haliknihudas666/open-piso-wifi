import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSqlitePragmas();

  try {
    // 1. Fetch total all-time sales from coin insertions
    const totalCoinSales = await prisma.sale.aggregate({
      where: { source: 'COIN' },
      _sum: { amount: true },
    });
    const allTimeCoinRevenue = totalCoinSales._sum.amount || 0;

    // 2. Fetch last collection record
    const lastCollection = await prisma.cashCollection.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const lastCollectedAt = lastCollection?.createdAt || new Date(0);

    // 3. Compute uncollected cash inserted after last collection date
    const uncollectedSales = await prisma.sale.aggregate({
      where: {
        source: 'COIN',
        createdAt: { gt: lastCollectedAt },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const uncollectedCash = uncollectedSales._sum.amount || 0;
    const uncollectedCount = uncollectedSales._count.id || 0;

    // 4. Fetch collection audit history
    const history = await prisma.cashCollection.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      allTimeCoinRevenue,
      uncollectedCash,
      uncollectedCount,
      lastCollection,
      history,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch cash box data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const { amount, collectedBy = 'Admin', notes } = body;

    const collectedAmount = parseFloat(amount);
    if (isNaN(collectedAmount) || collectedAmount <= 0) {
      return NextResponse.json({ error: 'Please specify a valid collection amount greater than ₱0.' }, { status: 400 });
    }

    const collection = await prisma.cashCollection.create({
      data: {
        amount: collectedAmount,
        collectedBy: collectedBy || 'Admin',
        notes: notes || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully recorded collection of ₱${collectedAmount.toLocaleString()}`,
      collection,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to record cash collection' }, { status: 500 });
  }
}
