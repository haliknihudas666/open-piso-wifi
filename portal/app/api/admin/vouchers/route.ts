import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { generateVoucherCode } from '@/lib/utils';
import { deauthorizeClientMac } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '500', 10)), 1000);

    const vouchers = await prisma.voucher.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ vouchers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch vouchers' }, { status: 500 });
  }
}

interface GenerateVoucherBody {
  durationMinutes: number;
  amountEquivalent?: number;
  quantity?: number;
}

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { durationMinutes, amountEquivalent = 0, quantity = 1 } =
      (await request.json()) as GenerateVoucherBody;

    if (!durationMinutes || durationMinutes <= 0) {
      return NextResponse.json(
        { error: 'Valid duration in minutes is required' },
        { status: 400 }
      );
    }

    const count = Math.min(Math.max(1, quantity), 50); // Limit batch size to 50
    const createdVouchers = [];

    for (let i = 0; i < count; i++) {
      let code = generateVoucherCode(6);
      // Ensure code is unique
      let exists = await prisma.voucher.findUnique({ where: { code } });
      while (exists) {
        code = generateVoucherCode(6);
        exists = await prisma.voucher.findUnique({ where: { code } });
      }

      const voucher = await prisma.voucher.create({
        data: {
          code,
          durationMinutes,
          amountEquivalent,
          isUsed: false,
          isRevoked: false,
        },
      });

      createdVouchers.push(voucher);
    }

    return NextResponse.json({
      success: true,
      count: createdVouchers.length,
      vouchers: createdVouchers,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate vouchers' }, { status: 500 });
  }
}

// Revoke or Restore a Voucher
export async function PATCH(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const body = await request.json().catch(() => ({}));
    const { id, code, action = 'revoke' } = body;

    if (!id && !code) {
      return NextResponse.json({ error: 'Voucher ID or code is required' }, { status: 400 });
    }

    const voucher = id
      ? await prisma.voucher.findUnique({ where: { id } })
      : await prisma.voucher.findUnique({ where: { code: code.toUpperCase() } });

    if (!voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }

    if (action === 'restore') {
      if (voucher.isUsed) {
        return NextResponse.json(
          { error: 'Cannot restore a voucher that has already been redeemed by a customer' },
          { status: 400 }
        );
      }

      const updated = await prisma.voucher.update({
        where: { id: voucher.id },
        data: {
          isRevoked: false,
          revokedAt: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Voucher ${voucher.code} restored to active status`,
        voucher: updated,
      });
    }

    // Default action: REVOKE
    const updated = await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    // If voucher was already redeemed and used by a device, disconnect that device's active session
    let sessionDisconnected = false;
    if (voucher.isUsed && voucher.usedByMac) {
      const activeSession = await prisma.session.findFirst({
        where: {
          macAddress: voucher.usedByMac,
          isActive: true,
          type: 'VOUCHER',
        },
      });

      if (activeSession) {
        await prisma.session.update({
          where: { id: activeSession.id },
          data: {
            isActive: false,
            endTime: new Date(),
          },
        });
        await deauthorizeClientMac(voucher.usedByMac, { kickStation: true }).catch(() => {});
        sessionDisconnected = true;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Voucher ${voucher.code} revoked successfully${sessionDisconnected ? ' (active Wi-Fi session terminated)' : ''}`,
      voucher: updated,
      sessionDisconnected,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update voucher' }, { status: 500 });
  }
}

// Delete single voucher or bulk purge
export async function DELETE(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const code = searchParams.get('code');
    const scope = searchParams.get('scope'); // 'revoked' | 'unused'

    if (scope === 'revoked') {
      const deleted = await prisma.voucher.deleteMany({
        where: { isRevoked: true },
      });
      return NextResponse.json({
        success: true,
        message: `Permanently deleted ${deleted.count} revoked voucher(s)`,
        count: deleted.count,
      });
    }

    if (scope === 'unused') {
      const deleted = await prisma.voucher.deleteMany({
        where: { isUsed: false, isRevoked: true },
      });
      return NextResponse.json({
        success: true,
        message: `Permanently deleted ${deleted.count} unused revoked voucher(s)`,
        count: deleted.count,
      });
    }

    if (!id && !code) {
      return NextResponse.json({ error: 'Voucher ID or code is required' }, { status: 400 });
    }

    const voucher = id
      ? await prisma.voucher.findUnique({ where: { id } })
      : await prisma.voucher.findUnique({ where: { code: code!.toUpperCase() } });

    if (!voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }

    await prisma.voucher.delete({
      where: { id: voucher.id },
    });

    return NextResponse.json({
      success: true,
      message: `Voucher ${voucher.code} deleted permanently`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete voucher' }, { status: 500 });
  }
}
