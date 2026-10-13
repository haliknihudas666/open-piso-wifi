#!/usr/bin/env node
// ==============================================================================
// 📦 OpenPisoWiFi - Automated Pre-Built Release Packaging Pipeline
// ==============================================================================
// Builds Next.js Standalone Portal, Bundles Hardware Daemon, Pre-seeds SQLite DB,
// and packages everything into a distribution tarball for GitHub Releases.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STAGING_DIR = path.join(DIST_DIR, 'release');
const TARBALL_PATH = path.join(DIST_DIR, 'piso-wifi-release.tar.gz');

console.log('==============================================================');
console.log('🚀 Building OpenPisoWiFi Pre-Built Production Release Bundle');
console.log('==============================================================');
console.log(`• Root Directory:    ${ROOT_DIR}`);
console.log(`• Staging Directory: ${STAGING_DIR}`);
console.log(`• Target Archive:    ${TARBALL_PATH}`);
console.log('');

const startTime = Date.now();

// 1. Determine Version directly from Root package.json (Single Source of Truth)
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const version = `v${rootPkg.version.replace(/^v/, '')}`;
let commitSha = 'dev';

try {
  commitSha = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {}

console.log(`📦 Packaging Release Version: ${version} (${commitSha})`);

// 2. Prepare Clean Directories
console.log('\n[1/6] Cleaning and preparing dist directory...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// 3. Build Web Portal (Prisma Multi-Arch & Next.js Standalone)
console.log('\n[2/6] Building Web Portal (Next.js Standalone & Prisma multi-arch)...');
const portalDir = fs.existsSync(path.join(ROOT_DIR, 'portal'))
  ? path.join(ROOT_DIR, 'portal')
  : path.join(ROOT_DIR, 'pisowifi-portal');
const buildEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
};

console.log('  • Generating Prisma client with Linux ARM64 & Debian engines...');
execSync('npx prisma generate', { cwd: portalDir, env: buildEnv, stdio: 'inherit' });

console.log('  • Preparing template database (prisma/dev.db.template)...');
const templateDbPath = path.join(portalDir, 'prisma', 'dev.db.template');
if (!fs.existsSync(templateDbPath)) {
  const currentDbPath = path.join(portalDir, 'prisma', 'dev.db');
  if (fs.existsSync(currentDbPath)) {
    fs.copyFileSync(currentDbPath, templateDbPath);
  } else {
    // Generate fresh database schema
    execSync('npx prisma db push --skip-generate', {
      cwd: portalDir,
      env: { ...process.env, DATABASE_URL: 'file:./dev.db.template' },
      stdio: 'inherit',
    });
  }
}

console.log('  • Building Next.js Standalone bundle...');
execSync('npm run build', { cwd: portalDir, env: buildEnv, stdio: 'inherit' });

// 4. Build Hardware Daemon
console.log('\n[3/6] Bundling Hardware Daemon...');
const daemonDir = fs.existsSync(path.join(ROOT_DIR, 'daemon'))
  ? path.join(ROOT_DIR, 'daemon')
  : path.join(ROOT_DIR, 'pisowifi-daemon');
execSync('npm run build', { cwd: daemonDir, stdio: 'inherit' });

// 5. Assemble Files in Staging Directory
console.log('\n[4/6] Assembling release staging directory...');

// Portal Standalone Output
const standaloneDir = path.join(portalDir, '.next', 'standalone');
const stagingPortalDir = path.join(STAGING_DIR, 'portal');
fs.mkdirSync(stagingPortalDir, { recursive: true });

// If Next.js created a subfolder inside standalone (e.g. .next/standalone/portal/)
let sourceStandaloneAppDir = standaloneDir;
if (fs.existsSync(path.join(standaloneDir, 'portal'))) {
  sourceStandaloneAppDir = path.join(standaloneDir, 'portal');
} else if (fs.existsSync(path.join(standaloneDir, 'pisowifi-portal'))) {
  sourceStandaloneAppDir = path.join(standaloneDir, 'pisowifi-portal');
}

// Copy standalone files with symlinks dereferenced
console.log('  • Copying Next.js standalone runtime (dereferencing symlinks)...');
fs.cpSync(sourceStandaloneAppDir, stagingPortalDir, { recursive: true, dereference: true });

// Also ensure root node_modules from standalone is copied if it was at parent level
const standaloneRootNodeModules = path.join(standaloneDir, 'node_modules');
if (fs.existsSync(standaloneRootNodeModules) && !fs.existsSync(path.join(stagingPortalDir, 'node_modules'))) {
  fs.cpSync(standaloneRootNodeModules, path.join(stagingPortalDir, 'node_modules'), { recursive: true, dereference: true });
}

// Explicitly ensure @prisma and .prisma runtime with multi-arch engines are present
console.log('  • Bundling multi-architecture Prisma client & engines...');
const srcPrismaClient = path.join(portalDir, 'node_modules', '@prisma');
const destPrismaClient = path.join(stagingPortalDir, 'node_modules', '@prisma');
if (fs.existsSync(srcPrismaClient)) {
  fs.cpSync(srcPrismaClient, destPrismaClient, { recursive: true, dereference: true });
}

const srcDotPrisma = path.join(portalDir, 'node_modules', '.prisma');
const destDotPrisma = path.join(stagingPortalDir, 'node_modules', '.prisma');
if (fs.existsSync(srcDotPrisma)) {
  fs.cpSync(srcDotPrisma, destDotPrisma, { recursive: true, dereference: true });
}

// Resolve any Turbopack hashed external modules in .next/node_modules/@prisma
const stagingNextPrismaDir = path.join(stagingPortalDir, '.next', 'node_modules', '@prisma');
if (fs.existsSync(stagingNextPrismaDir)) {
  const entries = fs.readdirSync(stagingNextPrismaDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('client-')) {
      const fullEntryPath = path.join(stagingNextPrismaDir, entry.name);
      try {
        fs.rmSync(fullEntryPath, { recursive: true, force: true });
      } catch {}
      if (fs.existsSync(path.join(portalDir, 'node_modules', '@prisma', 'client'))) {
        fs.cpSync(path.join(portalDir, 'node_modules', '@prisma', 'client'), fullEntryPath, { recursive: true, dereference: true });
        console.log(`  • Resolved Turbopack Prisma module bundle: ${entry.name}`);
      }
    }
  }
}

// Copy public assets & static chunks (required by Next.js standalone)
console.log('  • Copying public and static assets...');
const publicSrc = path.join(portalDir, 'public');
const publicDest = path.join(stagingPortalDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

const staticSrc = path.join(portalDir, '.next', 'static');
const staticDest = path.join(stagingPortalDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true });
}

// Copy Prisma schema and template db
const prismaDest = path.join(stagingPortalDir, 'prisma');
fs.mkdirSync(prismaDest, { recursive: true });
fs.copyFileSync(path.join(portalDir, 'prisma', 'schema.prisma'), path.join(prismaDest, 'schema.prisma'));
if (fs.existsSync(templateDbPath)) {
  fs.copyFileSync(templateDbPath, path.join(prismaDest, 'dev.db.template'));
}

// CRITICAL: Ensure release tarball NEVER contains live database files (dev.db, dev.db-wal, dev.db-shm).
// Only dev.db.template is allowed, so client updates never overwrite user settings, vouchers, or whitelist/blacklist.
function removeLiveDbFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeLiveDbFilesRecursively(fullPath);
    } else if (
      entry.name === 'dev.db' ||
      entry.name === 'dev.db-wal' ||
      entry.name === 'dev.db-shm' ||
      entry.name === 'dev.db-journal'
    ) {
      fs.rmSync(fullPath, { force: true });
      console.log(`  • Stripped live database artifact: ${path.relative(STAGING_DIR, fullPath)}`);
    }
  }
}
removeLiveDbFilesRecursively(STAGING_DIR);

// Copy .env.example
if (fs.existsSync(path.join(portalDir, '.env.example'))) {
  fs.copyFileSync(path.join(portalDir, '.env.example'), path.join(stagingPortalDir, '.env.example'));
}

// Daemon Files
console.log('  • Copying Hardware Daemon bundle...');
const stagingDaemonDir = path.join(STAGING_DIR, 'daemon');
fs.mkdirSync(stagingDaemonDir, { recursive: true });
fs.cpSync(path.join(daemonDir, 'dist'), path.join(stagingDaemonDir, 'dist'), { recursive: true });
fs.copyFileSync(path.join(daemonDir, 'package.json'), path.join(stagingDaemonDir, 'package.json'));
if (fs.existsSync(path.join(daemonDir, '.env.example'))) {
  fs.copyFileSync(path.join(daemonDir, '.env.example'), path.join(stagingDaemonDir, '.env.example'));
}

// Preserve independent package.json versions for each subsystem
const portalPkg = JSON.parse(fs.readFileSync(path.join(portalDir, 'package.json'), 'utf8'));
const daemonPkg = JSON.parse(fs.readFileSync(path.join(daemonDir, 'package.json'), 'utf8'));

const stagedPortalPkgPath = path.join(stagingPortalDir, 'package.json');
if (fs.existsSync(stagedPortalPkgPath)) {
  const pPkg = JSON.parse(fs.readFileSync(stagedPortalPkgPath, 'utf8'));
  pPkg.version = portalPkg.version;
  fs.writeFileSync(stagedPortalPkgPath, JSON.stringify(pPkg, null, 2) + '\n');
}

const stagedDaemonPkgPath = path.join(stagingDaemonDir, 'package.json');
if (fs.existsSync(stagedDaemonPkgPath)) {
  const dPkg = JSON.parse(fs.readFileSync(stagedDaemonPkgPath, 'utf8'));
  dPkg.version = daemonPkg.version;
  fs.writeFileSync(stagedDaemonPkgPath, JSON.stringify(dPkg, null, 2) + '\n');
}

// OpenWrt, Scripts & Firmware
console.log('  • Copying router setup and installer scripts...');
fs.cpSync(path.join(ROOT_DIR, 'openwrt'), path.join(STAGING_DIR, 'openwrt'), { recursive: true });
fs.cpSync(path.join(ROOT_DIR, 'scripts'), path.join(STAGING_DIR, 'scripts'), { recursive: true });
if (fs.existsSync(path.join(ROOT_DIR, 'firmware'))) {
  console.log('  • Copying microcontroller firmware scaffold...');
  fs.cpSync(path.join(ROOT_DIR, 'firmware'), path.join(STAGING_DIR, 'firmware'), { recursive: true });
}

// Root package.json
fs.copyFileSync(path.join(ROOT_DIR, 'package.json'), path.join(STAGING_DIR, 'package.json'));

// Version Metadata
const versionMeta = {
  version,
  systemVersion: version,
  portalVersion: `v${portalPkg.version.replace(/^v/, '')}`,
  daemonVersion: `v${daemonPkg.version.replace(/^v/, '')}`,
  commit: commitSha,
  builtAt: new Date().toISOString(),
  target: 'all-linux',
};
fs.writeFileSync(path.join(STAGING_DIR, 'version.json'), JSON.stringify(versionMeta, null, 2));
fs.writeFileSync(path.join(DIST_DIR, 'version.json'), JSON.stringify(versionMeta, null, 2));
fs.writeFileSync(path.join(ROOT_DIR, 'version.json'), JSON.stringify(versionMeta, null, 2));

// 6. Create Tarball Archive (Dereference symlinks with -h)
console.log('\n[5/6] Creating compressed release archive (tar.gz with dereferenced assets)...');
try {
  execSync(`tar -chzf "${TARBALL_PATH}" -C "${STAGING_DIR}" .`, { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to create tarball using system tar:', err);
  process.exit(1);
}

const stats = fs.statSync(TARBALL_PATH);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n[6/6] Finalizing Release...');
console.log(`✓ Archive: ${TARBALL_PATH} (${sizeMb} MB)`);
console.log(`✓ Version file: ${path.join(DIST_DIR, 'version.json')}`);

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('\n==============================================================');
console.log(`🎉 Release bundle ${version} successfully built in ${elapsedSec}s!`);
console.log('==============================================================');
