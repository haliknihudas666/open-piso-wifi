import { NextRequest, NextResponse } from 'next/server';
import { getRouterConnectedClients } from '@/lib/daemon';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const clients = await getRouterConnectedClients();
    return NextResponse.json({ clients });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch connected clients' },
      { status: 500 }
    );
  }
}
