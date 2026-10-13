import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

function generateVoucherCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid 0, O, 1, I for readability
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return result;
}

export async function POST(request: NextRequest) {
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
      let code = generateVoucherCode(6);
      // Ensure unique code
      let exists = await prisma.voucher.findUnique({ where: { code } });
      while (exists) {
        code = generateVoucherCode(6);
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
