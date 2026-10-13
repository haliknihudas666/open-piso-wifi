import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await ensureSqlitePragmas();

  try {
    const { pin } = await request.json();

    if (!pin) {
      return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
    }

    // Check PIN against database setting or environment fallback
    let correctPin = process.env.ADMIN_PIN || '1234';
    const pinSetting = await prisma.setting.findUnique({
      where: { key: 'admin_pin' },
    });

    if (pinSetting && pinSetting.value) {
      correctPin = pinSetting.value;
    }

    if (pin.trim() !== correctPin.trim()) {
      return NextResponse.json({ error: 'Incorrect Admin PIN' }, { status: 401 });
    }

    return NextResponse.json({ success: true, message: 'Authentication successful' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
