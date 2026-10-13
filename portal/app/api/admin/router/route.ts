import { NextRequest, NextResponse } from 'next/server';
import { getRouterStatus, testRouterConnection } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getRouterStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch router status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await testRouterConnection(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Router test failed' }, { status: 500 });
  }
}
