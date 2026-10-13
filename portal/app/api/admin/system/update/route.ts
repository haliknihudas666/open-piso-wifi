import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';
import { syncDaemonDeviceRules } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

interface UpdateState {
  status: 'idle' | 'updating' | 'completed' | 'error';
  logs: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

let globalUpdateState: UpdateState = {
  status: 'idle',
  logs: [],
};

export async function GET() {
  return NextResponse.json(globalUpdateState);
}

export async function POST(req: NextRequest) {
  if (globalUpdateState.status === 'updating') {
    return NextResponse.json(
      { error: 'An update is already in progress.', state: globalUpdateState },
      { status: 409 }
    );
  }

  let isForce = false;
  try {
    const body = await req.json();
    isForce = !!body?.force;
  } catch {}

  const rootDir = path.resolve(process.cwd(), '..');
  const updateScript = path.join(rootDir, 'scripts', 'update.sh');
  const isLinux = process.platform === 'linux';

  globalUpdateState = {
    status: 'updating',
    logs: [`[${new Date().toLocaleTimeString()}] Initializing OpenPisoWiFi High-Speed Pre-Built Update...`],
    startedAt: new Date().toISOString(),
  };

  const addLog = (text: string) => {
    const lines = text.split('\n');
    for (const line of lines) {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (clean) {
        globalUpdateState.logs.push(`[${new Date().toLocaleTimeString()}] ${clean}`);
      }
    }
    // Keep max 200 log lines
    if (globalUpdateState.logs.length > 200) {
      globalUpdateState.logs = globalUpdateState.logs.slice(-200);
    }
  };

  if (!isLinux) {
    // Development / Simulation Mode on Windows
    setTimeout(() => {
      addLog('--> [DEV] Checking latest pre-compiled release on GitHub...');
      setTimeout(() => {
        addLog('--> [DEV] Backing up SQLite database (dev.db) & configurations (.env)...');
        setTimeout(() => {
          addLog('--> [DEV] Downloading and extracting pre-built software bundle (Zero client-side build)...');
          setTimeout(() => {
            addLog('--> [DEV] Restoring database and configurations...');
            setTimeout(() => {
              addLog('--> [DEV] Running smart OpenWrt router update (Preserving active sessions & MAC tables)...');
              setTimeout(() => {
                addLog('✓ [DEV] Services restarted successfully! Update completed in 3.5s.');
                globalUpdateState.status = 'completed';
                globalUpdateState.completedAt = new Date().toISOString();
              }, 700);
            }, 600);
          }, 800);
        }, 600);
      }, 700);
    }, 400);

    return NextResponse.json({ success: true, message: 'Update process started (Dev Simulation)', state: globalUpdateState });
  }

  // Production on Raspberry Pi / Linux SBC
  try {
    const args = [updateScript];
    if (isForce) args.push('--force');

    addLog(`--> Spawning update script: ${updateScript} ${isForce ? '--force' : ''}`);
    const proc = spawn('bash', args, {
      cwd: rootDir,
      env: { ...process.env, PATH: process.env.PATH },
    });

    proc.stdout.on('data', (data) => {
      addLog(data.toString());
    });

    proc.stderr.on('data', (data) => {
      addLog(`[STDERR] ${data.toString()}`);
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        addLog('🎉 Update completed successfully!');
        try {
          await ensureSqlitePragmas();
          const devices = await prisma.deviceRule.findMany();
          const whitelist = devices.filter((d) => d.type === 'WHITELIST').map((d) => d.macAddress);
          const blacklist = devices.filter((d) => d.type === 'BLACKLIST').map((d) => d.macAddress);
          if (whitelist.length > 0 || blacklist.length > 0) {
            addLog(`--> Auto-syncing ${whitelist.length} whitelisted and ${blacklist.length} blacklisted devices to router...`);
            await syncDaemonDeviceRules(whitelist, blacklist);
            addLog('✓ Router device whitelist and blacklist synchronized.');
          }
        } catch (syncErr: any) {
          addLog(`[Notice] Device rules auto-sync: ${syncErr.message}`);
        }
        globalUpdateState.status = 'completed';
      } else {
        addLog(`❌ Update script exited with error code ${code}`);
        globalUpdateState.status = 'error';
        globalUpdateState.error = `Exit code ${code}`;
      }
      globalUpdateState.completedAt = new Date().toISOString();
    });

    proc.on('error', (err) => {
      addLog(`❌ Process execution error: ${err.message}`);
      globalUpdateState.status = 'error';
      globalUpdateState.error = err.message;
      globalUpdateState.completedAt = new Date().toISOString();
    });

    return NextResponse.json({ success: true, message: 'System update started', state: globalUpdateState });
  } catch (error: any) {
    globalUpdateState.status = 'error';
    globalUpdateState.error = error.message;
    return NextResponse.json({ error: error.message || 'Failed to start update' }, { status: 500 });
  }
}
