#!/usr/bin/env node
// ==============================================================================
// 🏷️ OpenPisoWiFi - Automated Semantic Versioning Pipeline
// ==============================================================================
// Detects code changes across subsystems (portal, daemon, root), determines
// the appropriate SemVer level (major, minor, patch) from Conventional Commits,
// and automatically bumps individual package.json files and the root release tag.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// CLI Arguments
const args = process.argv.slice(2);
let isDryRun = false;
let isCI = false;
let forcedBump = null; // 'major' | 'minor' | 'patch' | null
let targetSubsystem = 'auto'; // 'auto' | 'portal' | 'daemon' | 'root' | 'all'
let customBaseRef = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dry-run') isDryRun = true;
  else if (arg === '--ci') isCI = true;
  else if (arg.startsWith('--bump=')) forcedBump = arg.split('=')[1].toLowerCase();
  else if (arg === '-b' && args[i + 1]) forcedBump = args[++i].toLowerCase();
  else if (arg.startsWith('--target=')) targetSubsystem = arg.split('=')[1].toLowerCase();
  else if (arg === '-t' && args[i + 1]) targetSubsystem = args[++i].toLowerCase();
  else if (arg.startsWith('--from=')) customBaseRef = arg.split('=')[1];
}

console.log('==============================================================');
console.log('🏷️  OpenPisoWiFi Semantic Version Manager');
console.log('==============================================================');

// Read current versions
const rootPkgPath = path.join(ROOT_DIR, 'package.json');
const portalPkgPath = fs.existsSync(path.join(ROOT_DIR, 'portal', 'package.json'))
  ? path.join(ROOT_DIR, 'portal', 'package.json')
  : path.join(ROOT_DIR, 'pisowifi-portal', 'package.json');
const daemonPkgPath = fs.existsSync(path.join(ROOT_DIR, 'daemon', 'package.json'))
  ? path.join(ROOT_DIR, 'daemon', 'package.json')
  : path.join(ROOT_DIR, 'pisowifi-daemon', 'package.json');
const versionJsonPath = path.join(ROOT_DIR, 'version.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const portalPkg = JSON.parse(fs.readFileSync(portalPkgPath, 'utf8'));
const daemonPkg = JSON.parse(fs.readFileSync(daemonPkgPath, 'utf8'));

const currentRootVer = rootPkg.version.replace(/^v/, '');
const currentPortalVer = portalPkg.version.replace(/^v/, '');
const currentDaemonVer = daemonPkg.version.replace(/^v/, '');

console.log('• Current Subsystem Versions:');
console.log(`  - Root System:     v${currentRootVer}`);
console.log(`  - Web Portal:      v${currentPortalVer}`);
console.log(`  - Hardware Daemon: v${currentDaemonVer}`);
console.log('');

// 1. Determine Base Git Reference
function runGit(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

let baseRef = customBaseRef;
if (!baseRef) {
  // Try to find the latest tag matching v*
  const latestTag = runGit('git describe --tags --abbrev=0 --match "v*"');
  if (latestTag) {
    baseRef = latestTag;
  } else {
    // Fallback to HEAD~1 or first commit
    const headPrev = runGit('git rev-parse HEAD~1');
    baseRef = headPrev ? 'HEAD~1' : 'HEAD';
  }
}

console.log(`• Base Reference for Diff: ${baseRef}`);

// 2. Discover Changed Files
const changedFilesSet = new Set();

if (baseRef && baseRef !== 'HEAD') {
  const diffOutput = runGit(`git diff --name-only ${baseRef} HEAD`);
  if (diffOutput) {
    diffOutput.split('\n').map((f) => f.trim()).filter(Boolean).forEach((f) => changedFilesSet.add(f));
  }
}

// Also check uncommitted/staged working tree changes
const statusOutput = runGit('git status --porcelain');
if (statusOutput) {
  statusOutput.split('\n').forEach((line) => {
    const file = line.slice(3).trim();
    if (file) changedFilesSet.add(file);
  });
}

const allChangedFiles = Array.from(changedFilesSet);

// Categorize file changes
let hasPortalChanges = false;
let hasDaemonChanges = false;
let hasRootChanges = false;

for (const file of allChangedFiles) {
  // Ignore version.json and package.json files from triggering circular bumps
  if (file === 'version.json' || file.endsWith('package.json') || file.endsWith('package-lock.json')) {
    continue;
  }

  if (file.startsWith('portal/') || file.startsWith('pisowifi-portal/')) {
    hasPortalChanges = true;
  } else if (file.startsWith('daemon/') || file.startsWith('pisowifi-daemon/')) {
    hasDaemonChanges = true;
  } else {
    hasRootChanges = true;
  }
}

// 3. Determine Bump Level (major, minor, patch)
function detectBumpLevel() {
  if (forcedBump && ['major', 'minor', 'patch'].includes(forcedBump)) {
    return { level: forcedBump, reason: `CLI option --bump=${forcedBump}` };
  }

  // Inspect commit messages between baseRef and HEAD (or last commit)
  let commitLogs = '';
  if (baseRef && baseRef !== 'HEAD') {
    commitLogs = runGit(`git log ${baseRef}..HEAD --pretty=format:%B`);
  }
  if (!commitLogs) {
    commitLogs = runGit('git log -1 --pretty=format:%B');
  }

  const messages = commitLogs.split('\n').map((m) => m.trim()).filter(Boolean);

  let detected = 'patch';
  let reason = 'Default patch bump';

  for (const msg of messages) {
    // Check for breaking changes
    if (msg.includes('BREAKING CHANGE:') || /^[a-z]+(\([^\)]+\))?!:/.test(msg)) {
      return { level: 'major', reason: `Breaking change detected: "${msg.slice(0, 50)}"` };
    }
    // Check for new features
    if (/^feat(\([^\)]+\))?:/.test(msg)) {
      detected = 'minor';
      reason = `Feature commit detected: "${msg.slice(0, 50)}"`;
    }
  }

  return { level: detected, reason };
}

const { level: bumpLevel, reason: bumpReason } = detectBumpLevel();
console.log(`• Bump Level:            ${bumpLevel.toUpperCase()} (${bumpReason})`);

// 4. SemVer Math
function incrementVersion(versionStr, type) {
  const parts = versionStr.split('.').map(Number);
  let [major, minor, patch] = parts;
  if (isNaN(major)) major = 1;
  if (isNaN(minor)) minor = 0;
  if (isNaN(patch)) patch = 0;

  if (type === 'major') {
    return `${major + 1}.0.0`;
  } else if (type === 'minor') {
    return `${major}.${minor + 1}.0`;
  } else {
    return `${major}.${minor}.${patch + 1}`;
  }
}

// 5. Decide Which Subsystems to Bump
let bumpPortal = false;
let bumpDaemon = false;
let bumpRoot = false;

if (targetSubsystem === 'all') {
  bumpPortal = true;
  bumpDaemon = true;
  bumpRoot = true;
} else if (targetSubsystem === 'portal') {
  bumpPortal = true;
  bumpRoot = true;
} else if (targetSubsystem === 'daemon') {
  bumpDaemon = true;
  bumpRoot = true;
} else if (targetSubsystem === 'root') {
  bumpRoot = true;
} else {
  // auto detection
  if (hasPortalChanges) bumpPortal = true;
  if (hasDaemonChanges) bumpDaemon = true;
  if (hasPortalChanges || hasDaemonChanges || hasRootChanges) bumpRoot = true;
}

const newPortalVer = bumpPortal ? incrementVersion(currentPortalVer, bumpLevel) : currentPortalVer;
const newDaemonVer = bumpDaemon ? incrementVersion(currentDaemonVer, bumpLevel) : currentDaemonVer;
const newRootVer = bumpRoot ? incrementVersion(currentRootVer, bumpLevel) : currentRootVer;

console.log('\n• Subsystem Status & Plan:');
console.log(`  - Portal:  v${currentPortalVer} -> v${newPortalVer} ${bumpPortal ? '(WILL BUMP)' : '(unchanged)'}`);
console.log(`  - Daemon:  v${currentDaemonVer} -> v${newDaemonVer} ${bumpDaemon ? '(WILL BUMP)' : '(unchanged)'}`);
console.log(`  - Root:    v${currentRootVer} -> v${newRootVer} ${bumpRoot ? '(WILL BUMP)' : '(unchanged)'}`);
console.log('');

if (!bumpPortal && !bumpDaemon && !bumpRoot) {
  console.log('ℹ️  No changes detected in portal, daemon, or root files. Versions remain unchanged.');
  if (isCI && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `bumped=false\ntag=v${currentRootVer}\nroot_version=${currentRootVer}\n`);
  }
  process.exit(0);
}

// 6. Apply Version Changes
if (isDryRun) {
  console.log('🔍 [DRY-RUN] No files were modified.');
} else {
  if (bumpPortal) {
    portalPkg.version = newPortalVer;
    fs.writeFileSync(portalPkgPath, JSON.stringify(portalPkg, null, 2) + '\n');
    console.log(`✓ Updated portal/package.json -> v${newPortalVer}`);
  }

  if (bumpDaemon) {
    daemonPkg.version = newDaemonVer;
    fs.writeFileSync(daemonPkgPath, JSON.stringify(daemonPkg, null, 2) + '\n');
    console.log(`✓ Updated daemon/package.json -> v${newDaemonVer}`);
  }

  if (bumpRoot) {
    rootPkg.version = newRootVer;
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
    console.log(`✓ Updated root package.json -> v${newRootVer}`);
  }

  // Update root version.json
  const versionData = {
    version: `v${newRootVer}`,
    systemVersion: `v${newRootVer}`,
    portalVersion: `v${newPortalVer}`,
    daemonVersion: `v${newDaemonVer}`,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log(`✓ Updated version.json -> System: v${newRootVer}, Portal: v${newPortalVer}, Daemon: v${newDaemonVer}`);

  console.log('\n==============================================================');
  console.log(`🎉 Version bump complete! New System Release: v${newRootVer}`);
  console.log('==============================================================');
}

// Write to GitHub Actions output if in CI
if (isCI && process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `bumped=true\ntag=v${newRootVer}\nroot_version=${newRootVer}\nportal_version=${newPortalVer}\ndaemon_version=${newDaemonVer}\n`
  );
}
