import { NextResponse } from 'next/server';
import { getRouterConnectedClients } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

export async function GET() {
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
