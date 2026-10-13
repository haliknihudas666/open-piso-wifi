import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execAsync = promisify(exec);
export const dynamic = 'force-dynamic';

const GITHUB_REPO = 'haliknihudas666/open-piso-wifi';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache to avoid GitHub API rate limits

interface RemoteVersionCache {
  latestVersion: string;
  releaseNotes: string;
  publishedAt: string;
  cachedAt: number;
}

let cachedRemoteInfo: RemoteVersionCache | null = null;

function findRootDir(): string {
  let curr = process.cwd();
  for (let i = 0; i < 4; i++) {
    const pkgPath = path.join(curr, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'open-piso-wifi' || pkg.name === 'piso-wifi-root' || fs.existsSync(path.join(curr, 'portal')) || fs.existsSync(path.join(curr, 'pisowifi-portal'))) {
          return curr;
        }
      } catch {}
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(process.cwd(), '..');
}

export async function GET() {
  const rootDir = findRootDir();

  let systemVersion = 'v1.0.0';
  let portalVersion = 'v1.0.0';
  let daemonVersion = 'v1.0.0';
  let daemonOnline = false;
  let currentCommit = 'dev';
  let commitDate = new Date().toISOString();
  let commitMessage = 'Release build';

  const rootPkgFile = path.join(rootDir, 'package.json');
  const portalPkgFile = fs.existsSync(path.join(rootDir, 'portal', 'package.json'))
    ? path.join(rootDir, 'portal', 'package.json')
    : path.join(rootDir, 'pisowifi-portal', 'package.json');
  const daemonPkgFile = fs.existsSync(path.join(rootDir, 'daemon', 'package.json'))
    ? path.join(rootDir, 'daemon', 'package.json')
    : path.join(rootDir, 'pisowifi-daemon', 'package.json');
  const versionFile = path.join(rootDir, 'version.json');

  // 1. Read root package.json as the master source of truth for system version
  if (fs.existsSync(rootPkgFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkgFile, 'utf8'));
      if (pkg.version) systemVersion = `v${pkg.version.replace(/^v/, '')}`;
    } catch {}
  } else if (fs.existsSync(versionFile)) {
    try {
      const vData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (vData.version) systemVersion = `v${vData.version.replace(/^v/, '')}`;
    } catch {}
  }

  // 2. Read portal package.json for portal version
  const localPortalPkg = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(portalPkgFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(portalPkgFile, 'utf8'));
      if (pkg.version) portalVersion = `v${pkg.version.replace(/^v/, '')}`;
    } catch {}
  } else if (fs.existsSync(localPortalPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(localPortalPkg, 'utf8'));
      if ((pkg.name === 'open-piso-wifi-portal' || pkg.name === 'pisowifi-portal') && pkg.version) {
        portalVersion = `v${pkg.version.replace(/^v/, '')}`;
      }
    } catch {}
  }
  if (portalVersion === 'v1.0.0' && systemVersion !== 'v1.0.0') {
    portalVersion = systemVersion;
  }

  // 3. Query live daemon API or pisowifi-daemon/package.json
  const daemonUrl = process.env.DAEMON_URL || 'http://127.0.0.1:4000';
  try {
    const dRes = await fetch(`${daemonUrl}/api/version`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1200),
    });
    if (dRes.ok) {
      const dData = await dRes.json();
      if (dData.version) {
        daemonVersion = dData.version;
        daemonOnline = true;
      }
    }
  } catch {}

  if (!daemonOnline) {
    if (fs.existsSync(daemonPkgFile)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(daemonPkgFile, 'utf8'));
        if (pkg.version) daemonVersion = `v${pkg.version.replace(/^v/, '')}`;
      } catch {}
    }
    if (daemonVersion === 'v1.0.0' && systemVersion !== 'v1.0.0') {
      daemonVersion = systemVersion;
    }
  }

  // Load build metadata (commit, date) if version.json is available
  if (fs.existsSync(versionFile)) {
    try {
      const vData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (vData.commit) currentCommit = vData.commit;
      if (vData.builtAt) commitDate = vData.builtAt;
    } catch {}
  } else {
    // Fallback: Check local git in development
    try {
      const { stdout: gitLog } = await execAsync('git log -1 --format="%h|%s|%ci"', {
        cwd: rootDir,
        timeout: 3000,
      });
      const parts = gitLog.trim().split('|');
      if (parts.length >= 3) {
        currentCommit = parts[0];
        commitMessage = parts[1];
        commitDate = parts[2];
      }
    } catch {}
  }

  // 2. Fetch latest GitHub release (with in-memory caching)
  let latestVersion = systemVersion;
  let releaseNotes = '';
  let publishedAt = '';
  const now = Date.now();

  if (cachedRemoteInfo && now - cachedRemoteInfo.cachedAt < CACHE_TTL_MS) {
    latestVersion = cachedRemoteInfo.latestVersion;
    releaseNotes = cachedRemoteInfo.releaseNotes;
    publishedAt = cachedRemoteInfo.publishedAt;
  } else {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const headers: Record<string, string> = {
        'User-Agent': 'OpenPisoWiFi-Updater',
        Accept: 'application/vnd.github.v3+json',
      };
      let token = process.env.GITHUB_TOKEN;
      if (!token) {
        const homeToken = path.join(os.homedir(), '.github_token');
        if (fs.existsSync(homeToken)) {
          try {
            token = fs.readFileSync(homeToken, 'utf8').trim();
          } catch {}
        }
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        latestVersion = data.tag_name || systemVersion;
        releaseNotes = data.body || '';
        publishedAt = data.published_at || '';

        cachedRemoteInfo = {
          latestVersion,
          releaseNotes,
          publishedAt,
          cachedAt: now,
        };
      }
    } catch {
      // Offline or rate-limited
    }
  }

  // Compare versions: if clean semver or tag difference
  const cleanCurrent = systemVersion.replace(/^v/, '');
  const cleanLatest = latestVersion.replace(/^v/, '');
  const updateAvailable = latestVersion !== systemVersion && cleanLatest !== cleanCurrent;

  return NextResponse.json({
    systemVersion,
    portalVersion,
    daemonVersion,
    daemonOnline,
    currentVersion: systemVersion, // Backwards compatibility for existing cards
    currentCommit,
    commitMessage,
    commitDate,
    latestVersion,
    updateAvailable,
    releaseNotes,
    publishedAt,
    hasGithubToken: !!(process.env.GITHUB_TOKEN || (fs.existsSync(path.join(os.homedir(), '.github_token')))),
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    systemUptime: Math.floor(os.uptime()),
  });
}
