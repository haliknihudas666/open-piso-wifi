import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const DRAWER_FLOAT_KEY = 'cash_box_float';
const AUDIT_PREFIX = '__AUDIT_V1__:';

interface CashAuditPayload {
  expectedAmount: number;
  recordedSales: number;
  startingFloat: number;
  actualCounted: number;
  variance: number;
  leftInDrawer: number;
  netCollected: number;
  remarks: string;
}

function parseCollectionAudit(col: {
  id: string;
  amount: number;
  collectedBy: string;
  notes: string | null;
  createdAt: Date;
}) {
  if (col.notes && col.notes.startsWith(AUDIT_PREFIX)) {
    try {
      const parsed = JSON.parse(col.notes.slice(AUDIT_PREFIX.length)) as Partial<CashAuditPayload>;
      return {
        ...col,
        expectedAmount: typeof parsed.expectedAmount === 'number' ? parsed.expectedAmount : col.amount,
        recordedSales: typeof parsed.recordedSales === 'number' ? parsed.recordedSales : col.amount,
        startingFloat: typeof parsed.startingFloat === 'number' ? parsed.startingFloat : 0,
        actualCounted: typeof parsed.actualCounted === 'number' ? parsed.actualCounted : col.amount,
        variance: typeof parsed.variance === 'number' ? parsed.variance : 0,
        leftInDrawer: typeof parsed.leftInDrawer === 'number' ? parsed.leftInDrawer : 0,
        netCollected: typeof parsed.netCollected === 'number' ? parsed.netCollected : col.amount,
        remarks: parsed.remarks || '',
      };
    } catch {
      // Fall through to legacy plain-text note handling
    }
  }

  return {
    ...col,
    expectedAmount: col.amount,
    recordedSales: col.amount,
    startingFloat: 0,
    actualCounted: col.amount,
    variance: 0,
    leftInDrawer: 0,
    netCollected: col.amount,
    remarks: col.notes || '',
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    // 1. Fetch total all-time sales from coin insertions
    const totalCoinSales = await prisma.sale.aggregate({
      where: { source: 'COIN' },
      _sum: { amount: true },
    });
    const allTimeCoinRevenue = totalCoinSales._sum.amount || 0;

    // 2. Fetch last collection record & current drawer starter float
    const [lastCollectionRaw, floatSetting] = await Promise.all([
      prisma.cashCollection.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
      prisma.setting.findUnique({
        where: { key: DRAWER_FLOAT_KEY },
      }),
    ]);

    const parsedFloat = floatSetting ? parseFloat(floatSetting.value) : 0;
    const drawerFloat = Number.isFinite(parsedFloat) && parsedFloat > 0 ? parsedFloat : 0;
    const lastCollectedAt = lastCollectionRaw?.createdAt || new Date(0);

    // 3. Compute uncollected cash inserted after last collection date
    const uncollectedSalesAgg = await prisma.sale.aggregate({
      where: {
        source: 'COIN',
        createdAt: { gt: lastCollectedAt },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const recordedSales = uncollectedSalesAgg._sum.amount || 0;
    const uncollectedCount = uncollectedSalesAgg._count.id || 0;
    const uncollectedCash = Number((recordedSales + drawerFloat).toFixed(2));

    // 4. Fetch collection audit history
    const historyRaw = await prisma.cashCollection.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const history = historyRaw.map(parseCollectionAudit);
    const lastCollection = lastCollectionRaw ? parseCollectionAudit(lastCollectionRaw) : null;

    return NextResponse.json({
      allTimeCoinRevenue,
      drawerFloat,
      recordedSales,
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
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const {
      amount,
      actualCounted: rawActual,
      leftInDrawer: rawLeft = 0,
      collectedBy = 'Admin',
      notes = '',
    } = body;

    // Recompute authoritative expected cash on server from DB
    const [lastCollectionRaw, floatSetting] = await Promise.all([
      prisma.cashCollection.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.setting.findUnique({ where: { key: DRAWER_FLOAT_KEY } }),
    ]);

    const startingFloat = Math.max(0, parseFloat(floatSetting?.value || '0') || 0);
    const lastCollectedAt = lastCollectionRaw?.createdAt || new Date(0);

    const uncollectedSalesAgg = await prisma.sale.aggregate({
      where: {
        source: 'COIN',
        createdAt: { gt: lastCollectedAt },
      },
      _sum: { amount: true },
    });

    const recordedSales = uncollectedSalesAgg._sum.amount || 0;
    const expectedAmount = Number((recordedSales + startingFloat).toFixed(2));

    const actualCounted = rawActual !== undefined && rawActual !== null && rawActual !== ''
      ? parseFloat(rawActual)
      : parseFloat(amount);
    const leftInDrawer = rawLeft !== undefined && rawLeft !== null && rawLeft !== ''
      ? parseFloat(rawLeft)
      : 0;

    if (!Number.isFinite(actualCounted) || actualCounted < 0) {
      return NextResponse.json({ error: 'Please enter a valid actual counted amount (₱0 or greater).' }, { status: 400 });
    }
    if (!Number.isFinite(leftInDrawer) || leftInDrawer < 0) {
      return NextResponse.json({ error: 'Coins left in drawer must be ₱0 or greater.' }, { status: 400 });
    }
    if (leftInDrawer > actualCounted) {
      return NextResponse.json(
        { error: 'Coins left in drawer cannot exceed the actual coins counted.' },
        { status: 400 }
      );
    }
    if (expectedAmount <= 0 && actualCounted <= 0) {
      return NextResponse.json({ error: 'The cash box is currently empty (₱0).' }, { status: 400 });
    }

    const netCollected = Number((actualCounted - leftInDrawer).toFixed(2));
    const variance = Number((actualCounted - expectedAmount).toFixed(2));
    const cleanRemarks = typeof notes === 'string' ? notes.trim() : '';

    const auditPayload: CashAuditPayload = {
      expectedAmount,
      recordedSales,
      startingFloat,
      actualCounted,
      variance,
      leftInDrawer,
      netCollected,
      remarks: cleanRemarks,
    };

    const [collection] = await prisma.$transaction([
      prisma.cashCollection.create({
        data: {
          amount: netCollected,
          collectedBy: (typeof collectedBy === 'string' && collectedBy.trim()) || 'Admin',
          notes: `${AUDIT_PREFIX}${JSON.stringify(auditPayload)}`,
        },
      }),
      prisma.setting.upsert({
        where: { key: DRAWER_FLOAT_KEY },
        update: { value: String(leftInDrawer) },
        create: { key: DRAWER_FLOAT_KEY, value: String(leftInDrawer) },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Recorded collection: ₱${netCollected.toLocaleString()} taken (₱${actualCounted.toLocaleString()} counted, ₱${leftInDrawer.toLocaleString()} left in drawer)`,
      collection: parseCollectionAudit(collection),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to record cash collection' }, { status: 500 });
  }
}
