import { NextRequest, NextResponse } from 'next/server';
import { getRouterQoSStatus, setRouterQoS } from '@/lib/daemon';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const status = await getRouterQoSStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch QoS status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { downloadMbps = 0, uploadMbps = 0 } = body;

    const result = await setRouterQoS(downloadMbps, uploadMbps);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to apply QoS on router' },
        { status: 500 }
      );
    }

    const status = await getRouterQoSStatus();
    return NextResponse.json({
      success: true,
      message: `Speed limit configured (${downloadMbps} Mbps Down / ${uploadMbps} Mbps Up)`,
      status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error updating QoS settings' },
      { status: 500 }
    );
  }
}
