import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin-auth';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const rootDir = path.resolve(process.cwd(), '..');
    const deployScript = path.join(rootDir, 'scripts', 'deploy-router.sh');

    if (process.platform !== 'linux') {
      return NextResponse.json({
        success: true,
        message: 'OpenWrt router deployment simulated in development environment.',
      });
    }

    const { stdout, stderr } = await execFileAsync('bash', [deployScript], {
      cwd: rootDir,
      timeout: 30000,
    });

    return NextResponse.json({
      success: true,
      message: 'OpenWrt router configuration & firewall successfully deployed!',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || 'Router deployment failed. Please check network connection to 192.168.1.1.',
        stderr: error.stderr,
      },
      { status: 500 }
    );
  }
}
