import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import { getRouterTelemetry } from '@/lib/daemon';

const execAsync = promisify(exec);
export const dynamic = 'force-dynamic';

export async function GET() {
  // 1. Raspberry Pi CPU Temperature
  let cpuTempC = 42.5; // Default/mock temp
  try {
    if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
      const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
      cpuTempC = Math.round((parseInt(raw.trim(), 10) / 1000) * 10) / 10;
    } else {
      const { stdout } = await execAsync('vcgencmd measure_temp');
      const match = stdout.match(/temp=([0-9.]+)'C/);
      if (match && match[1]) {
        cpuTempC = parseFloat(match[1]);
      }
    }
  } catch {}

  // 2. Raspberry Pi Memory Usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = Math.round((usedMem / totalMem) * 100);

  // 3. Disk Space Usage
  let diskTotalGb = 32;
  let diskUsedGb = 4.2;
  let diskPercent = 14;
  try {
    const { stdout } = await execAsync('df -k /');
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      const totalKb = parseInt(parts[1], 10);
      const usedKb = parseInt(parts[2], 10);
      diskTotalGb = Math.round((totalKb / (1024 * 1024)) * 10) / 10;
      diskUsedGb = Math.round((usedKb / (1024 * 1024)) * 10) / 10;
      diskPercent = Math.round((usedKb / totalKb) * 100);
    }
  } catch {}

  // 4. Load Average & Uptime
  const loadAvg = os.loadavg().map((n) => Math.round(n * 100) / 100).join(', ');
  const rpiUptimeSeconds = Math.floor(os.uptime());

  // 5. OpenWrt Router Telemetry
  let routerStats = {
    uptimeSeconds: 0,
    loadAvg: '0.00, 0.00, 0.00',
    memTotalMb: 128,
    memFreeMb: 64,
    clients2g: 0,
    clients5g: 0,
    totalClients: 0,
    dhcpLeasesCount: 0,
  };

  try {
    routerStats = await getRouterTelemetry();
  } catch {}

  return NextResponse.json({
    rpi: {
      cpuTempC,
      memTotalMb: Math.round(totalMem / (1024 * 1024)),
      memUsedMb: Math.round(usedMem / (1024 * 1024)),
      memUsagePercent,
      diskTotalGb,
      diskUsedGb,
      diskPercent,
      loadAvg,
      uptimeSeconds: rpiUptimeSeconds,
      platform: `${os.type()} ${os.arch()}`,
    },
    router: routerStats,
  });
}
