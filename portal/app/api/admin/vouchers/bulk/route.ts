import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-auth';
import { generateSecureVoucherCode } from '@/lib/secure-codes';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  await ensureSqlitePragmas();

  try {
    const body = await request.json();
    const { count = 10, durationMinutes = 60, amountEquivalent = 5 } = body;

    const voucherCount = Math.min(Math.max(1, parseInt(count, 10)), 200);
    const duration = parseInt(durationMinutes, 10);
    const amount = parseFloat(amountEquivalent);

    if (duration <= 0) {
      return NextResponse.json({ error: 'Duration must be greater than 0 minutes' }, { status: 400 });
    }

    const createdVouchers = [];
    for (let i = 0; i < voucherCount; i++) {
      let code = generateSecureVoucherCode();
      // Ensure unique code
      let exists = await prisma.voucher.findUnique({ where: { code } });
      while (exists) {
        code = generateSecureVoucherCode();
        exists = await prisma.voucher.findUnique({ where: { code } });
      }

      const v = await prisma.voucher.create({
        data: {
          code,
          durationMinutes: duration,
          amountEquivalent: amount,
        },
      });
      createdVouchers.push(v);
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${createdVouchers.length} vouchers successfully!`,
      vouchers: createdVouchers,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Bulk generation failed' }, { status: 500 });
  }
}
