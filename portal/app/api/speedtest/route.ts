import { NextResponse } from 'next/server';
import { prisma, ensureSqlitePragmas } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface SpeedTestResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  grade: string;
  gamingReady: boolean;
  streamingReady: boolean;
  testedAt: number;
  source: 'real_probe' | 'fallback_qos';
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Hour Cache

/**
 * Executes a lightweight live network speed and latency probe
 * using fast global CDN endpoints. Runs in ~0.5s with minimal data usage.
 */
async function runRealSpeedProbe(): Promise<SpeedTestResult> {
  try {
    // 1. Latency Probe (Ping)
    const pingStart = performance.now();
    await fetch('https://1.1.1.1/cdn-cgi/trace', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const pingMs = Math.max(5, Math.round(performance.now() - pingStart));

    // 2. Download Speed Probe (2.5MB payload)
    const dlStart = performance.now();
    const dlRes = await fetch('https://speed.cloudflare.com/__down?bytes=2500000', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const dlBuf = await dlRes.arrayBuffer();
    const dlElapsedSec = Math.max(0.05, (performance.now() - dlStart) / 1000);
    const downloadMbps = parseFloat(((dlBuf.byteLength * 8) / (dlElapsedSec * 1000000)).toFixed(1));

    // 3. Upload Speed Probe (250KB payload)
    let uploadMbps = Math.round(downloadMbps * 0.35 * 10) / 10;
    try {
      const upStart = performance.now();
      const testBuffer = new Uint8Array(250000);
      const upRes = await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body: testBuffer,
        signal: AbortSignal.timeout(4000),
      });
      if (upRes.ok) {
        const upElapsedSec = Math.max(0.05, (performance.now() - upStart) / 1000);
        uploadMbps = parseFloat(((testBuffer.byteLength * 8) / (upElapsedSec * 1000000)).toFixed(1));
      }
    } catch {
      // Keep estimated upload if probe blocked
    }

    const grade =
      downloadMbps >= 50
        ? 'Ultra High-Speed Fiber'
        : downloadMbps >= 25
        ? 'High-Speed Fiber'
        : downloadMbps >= 10
        ? 'Fast Broadband'
        : 'Standard Wi-Fi';

    return {
      downloadMbps,
      uploadMbps,
      pingMs,
      grade,
      gamingReady: pingMs <= 45,
      streamingReady: downloadMbps >= 10,
      testedAt: Date.now(),
      source: 'real_probe',
    };
  } catch (error) {
    // If external WAN is unreachable (e.g. offline dev or blocked router), fallback to QoS settings
    return getFallbackQoSSpeed();
  }
}

/**
 * Fallback benchmark based on configured OpenWrt QoS cap
 */
async function getFallbackQoSSpeed(): Promise<SpeedTestResult> {
  let down = 25.0;
  let up = 10.0;

  try {
    const qosSetting = await prisma.setting.findUnique({ where: { key: 'speed_limit' } });
    if (qosSetting?.value === '50mbps') {
      down = 50.0;
      up = 20.0;
    } else if (qosSetting?.value === '100mbps') {
      down = 100.0;
      up = 50.0;
    }
  } catch {}

  return {
    downloadMbps: down,
    uploadMbps: up,
    pingMs: 16,
    grade: 'Gateway Rated Speed',
    gamingReady: true,
    streamingReady: true,
    testedAt: Date.now(),
    source: 'fallback_qos',
  };
}

export async function GET() {
  await ensureSqlitePragmas();

  try {
    // Check cached speed test in database
    const cached = await prisma.setting.findUnique({
      where: { key: 'latest_speedtest' },
    });

    if (cached) {
      try {
        const parsed: SpeedTestResult = JSON.parse(cached.value);
        const ageMs = Date.now() - parsed.testedAt;

        // If cached test is less than 1 hour old, return immediately
        if (ageMs < CACHE_TTL_MS && parsed.downloadMbps > 0) {
          return NextResponse.json({
            ...parsed,
            ageMinutes: Math.floor(ageMs / 60000),
            cached: true,
          });
        }
      } catch {}
    }

    // Run new probe if expired or missing
    const freshResult = await runRealSpeedProbe();

    // Cache to DB
    await prisma.setting.upsert({
      where: { key: 'latest_speedtest' },
      update: { value: JSON.stringify(freshResult) },
      create: { key: 'latest_speedtest', value: JSON.stringify(freshResult) },
    });

    return NextResponse.json({
      ...freshResult,
      ageMinutes: 0,
      cached: false,
    });
  } catch (error: any) {
    const fallback = await getFallbackQoSSpeed();
    return NextResponse.json({ ...fallback, ageMinutes: 0, cached: false });
  }
}

/**
 * POST /api/speedtest
 * Force re-run an on-demand speed test and update cache
 */
export async function POST() {
  await ensureSqlitePragmas();

  try {
    const freshResult = await runRealSpeedProbe();

    await prisma.setting.upsert({
      where: { key: 'latest_speedtest' },
      update: { value: JSON.stringify(freshResult) },
      create: { key: 'latest_speedtest', value: JSON.stringify(freshResult) },
    });

    return NextResponse.json({
      ...freshResult,
      ageMinutes: 0,
      cached: false,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Speed test failed' }, { status: 500 });
  }
}
