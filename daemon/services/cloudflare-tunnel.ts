/**
 * ==============================================================================
 * 🌐 OpenPisoWiFi - Cloudflare Tunnel Service (Zero-Config Remote Admin Access)
 * ==============================================================================
 * Features:
 *   - Spawns and supervises `cloudflared` to expose the Admin Panel over HTTPS
 *     without port-forwarding, static IP, or CGNAT workarounds.
 *   - Default: Zero-setup Quick Tunnel (`trycloudflare.com`) with live URL parsing.
 *   - Optional: Named Tunnel (`--token`) for persistent custom hostnames.
 *   - Auto-reconnects with bounded exponential backoff if enabled.
 *   - Persists configuration to `.tunnel-config.json` (mode 0o600).
 * ==============================================================================
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type TunnelMode = 'quick' | 'named';

export interface CloudflareTunnelConfig {
  enabled: boolean;
  mode: TunnelMode;
  tunnelToken: string;
  customHostname: string;
  portalPort: number;
}

export interface CloudflareTunnelStatus {
  installed: boolean;
  version: string | null;
  running: boolean;
  enabled: boolean;
  mode: TunnelMode;
  hasToken: boolean;
  customHostname: string;
  publicUrl: string | null;
  pid: number | null;
  lastStartedAt: string | null;
  lastError: string | null;
}

const TRY_CLOUDFLARE_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export function extractTryCloudflareUrl(output: string): string | null {
  const match = output.match(TRY_CLOUDFLARE_REGEX);
  return match ? match[0] : null;
}

export class CloudflareTunnelService {
  private readonly configFilePath: string;
  private config: CloudflareTunnelConfig;
  private child: ChildProcess | null = null;
  private publicUrl: string | null = null;
  private lastNotifiedUrl: string | null = null;
  private lastStartedAt: string | null = null;
  private lastError: string | null = null;
  private intentionalStop = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  private installedCache: { checkedAt: number; installed: boolean; version: string | null } | null = null;
  private onUrlReadyCallback: ((url: string, mode: TunnelMode) => void) | null = null;

  constructor(portalPort?: number) {
    this.configFilePath = path.join(process.cwd(), '.tunnel-config.json');
    const defaultPort = portalPort || parseInt(process.env.PORTAL_PORT || '3000', 10) || 3000;
    const saved = this.loadPersistedConfig();

    const envEnabled = process.env.CLOUDFLARE_TUNNEL_ENABLED;
    const enabled =
      saved.enabled !== undefined
        ? saved.enabled
        : envEnabled === 'true' || envEnabled === '1';

    const envToken = (process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim();
    const tunnelToken = saved.tunnelToken !== undefined ? saved.tunnelToken : envToken;
    const envHostname = (process.env.CLOUDFLARE_TUNNEL_HOSTNAME || '').trim();
    const customHostname = saved.customHostname !== undefined ? saved.customHostname : envHostname;
    const mode: TunnelMode =
      saved.mode === 'named' || (!saved.mode && tunnelToken.length > 0) ? 'named' : 'quick';

    this.config = {
      enabled,
      mode,
      tunnelToken,
      customHostname,
      portalPort: defaultPort,
    };
  }

  public onUrlReady(cb: (url: string, mode: TunnelMode) => void) {
    this.onUrlReadyCallback = cb;
  }

  public isConfigured(): boolean {
    return this.config.enabled;
  }

  public checkInstalled(forceRefresh = false): { installed: boolean; version: string | null } {
    const now = Date.now();
    if (!forceRefresh && this.installedCache && now - this.installedCache.checkedAt < 60_000) {
      return { installed: this.installedCache.installed, version: this.installedCache.version };
    }

    try {
      const output = execFileSync('cloudflared', ['--version'], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      const firstLine = output.split(/\r?\n/)[0]?.trim() || 'installed';
      this.installedCache = { checkedAt: now, installed: true, version: firstLine };
      return { installed: true, version: firstLine };
    } catch {
      this.installedCache = { checkedAt: now, installed: false, version: null };
      return { installed: false, version: null };
    }
  }

  public getStatus(): CloudflareTunnelStatus {
    const bin = this.checkInstalled();
    const running = Boolean(this.child && this.child.exitCode === null && !this.child.killed);
    const effectiveUrl =
      this.config.mode === 'named' && this.config.customHostname
        ? this.normalizeHostnameUrl(this.config.customHostname)
        : this.publicUrl;

    return {
      installed: bin.installed,
      version: bin.version,
      running,
      enabled: this.config.enabled,
      mode: this.config.mode,
      hasToken: Boolean(this.config.tunnelToken),
      customHostname: this.config.customHostname,
      publicUrl: running ? effectiveUrl : null,
      pid: running && this.child?.pid ? this.child.pid : null,
      lastStartedAt: this.lastStartedAt,
      lastError: this.lastError,
    };
  }

  public getConfigForSync(): {
    enabled: boolean;
    mode: TunnelMode;
    hasToken: boolean;
    customHostname: string;
  } {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      hasToken: Boolean(this.config.tunnelToken),
      customHostname: this.config.customHostname,
    };
  }

  public async updateConfig(input: {
    enabled?: boolean;
    mode?: TunnelMode;
    tunnelToken?: string;
    clearToken?: boolean;
    customHostname?: string;
    persist?: boolean;
  }): Promise<CloudflareTunnelStatus> {
    const prevEnabled = this.config.enabled;
    const prevMode = this.config.mode;
    const prevToken = this.config.tunnelToken;
    const prevHostname = this.config.customHostname;

    if (typeof input.enabled === 'boolean') {
      this.config.enabled = input.enabled;
    }
    if (input.mode === 'quick' || input.mode === 'named') {
      this.config.mode = input.mode;
    }
    if (input.clearToken) {
      this.config.tunnelToken = '';
    } else if (typeof input.tunnelToken === 'string' && input.tunnelToken.trim().length > 0) {
      this.config.tunnelToken = input.tunnelToken.trim();
    }
    if (typeof input.customHostname === 'string') {
      this.config.customHostname = input.customHostname.trim();
    }

    if (input.persist !== false) {
      this.persistConfig();
    }

    const configChanged =
      prevMode !== this.config.mode ||
      prevToken !== this.config.tunnelToken ||
      prevHostname !== this.config.customHostname;

    if (!this.config.enabled) {
      await this.stop({ disable: false });
    } else if (!prevEnabled || configChanged || !this.getStatus().running) {
      await this.restart();
    }

    return this.getStatus();
  }

  public async start(): Promise<CloudflareTunnelStatus> {
    if (!this.config.enabled) {
      this.config.enabled = true;
      this.persistConfig();
    }

    if (this.child && this.child.exitCode === null && !this.child.killed) {
      return this.getStatus();
    }

    this.clearRestartTimer();
    this.intentionalStop = false;

    const bin = this.checkInstalled(true);
    if (!bin.installed) {
      this.lastError = 'cloudflared binary not found on system PATH.';
      console.warn(`[TUNNEL] ⚠️ ${this.lastError}`);
      return this.getStatus();
    }

    if (this.config.mode === 'named' && !this.config.tunnelToken) {
      this.lastError = 'Named Tunnel mode selected, but no Tunnel Token is configured.';
      console.warn(`[TUNNEL] ⚠️ ${this.lastError}`);
      return this.getStatus();
    }

    const args =
      this.config.mode === 'named'
        ? ['tunnel', '--no-autoupdate', 'run', '--token', this.config.tunnelToken]
        : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${this.config.portalPort}`];

    this.publicUrl = null;
    this.lastNotifiedUrl = null;
    this.lastError = null;
    this.lastStartedAt = new Date().toISOString();

    console.log(
      `[TUNNEL] 🌐 Starting Cloudflare ${this.config.mode === 'named' ? 'Named' : 'Quick'} Tunnel -> http://127.0.0.1:${this.config.portalPort}`
    );

    const proc = spawn('cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = proc;

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (this.config.mode === 'quick') {
        const foundUrl = extractTryCloudflareUrl(text);
        if (foundUrl && foundUrl !== this.publicUrl) {
          this.publicUrl = foundUrl;
          this.restartAttempts = 0;
          console.log(`[TUNNEL] ✅ Quick Tunnel URL ready: ${foundUrl}/admin`);
          if (foundUrl !== this.lastNotifiedUrl) {
            this.lastNotifiedUrl = foundUrl;
            this.onUrlReadyCallback?.(foundUrl, 'quick');
          }
        }
      } else if (
        text.includes('Registered tunnel connection') ||
        text.includes('Connection registered')
      ) {
        this.restartAttempts = 0;
        const namedUrl = this.config.customHostname
          ? this.normalizeHostnameUrl(this.config.customHostname)
          : null;
        if (namedUrl && namedUrl !== this.lastNotifiedUrl) {
          this.lastNotifiedUrl = namedUrl;
          this.publicUrl = namedUrl;
          console.log(`[TUNNEL] ✅ Named Tunnel connected: ${namedUrl}/admin`);
          this.onUrlReadyCallback?.(namedUrl, 'named');
        }
      }
    };

    proc.stdout?.on('data', handleOutput);
    proc.stderr?.on('data', handleOutput);

    proc.on('error', (err) => {
      this.lastError = err.message || 'Failed to spawn cloudflared';
      console.error('[TUNNEL] ❌ Process error:', this.lastError);
    });

    proc.on('exit', (code, signal) => {
      if (this.child === proc) {
        this.child = null;
      }
      this.publicUrl = null;

      if (this.intentionalStop || !this.config.enabled) {
        console.log('[TUNNEL] 🛑 Cloudflare Tunnel stopped.');
        return;
      }

      this.lastError = `cloudflared exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
      console.warn(`[TUNNEL] ⚠️ ${this.lastError}`);
      this.scheduleReconnect();
    });

    return this.getStatus();
  }

  public async stop(options?: { disable?: boolean }): Promise<CloudflareTunnelStatus> {
    this.intentionalStop = true;
    this.clearRestartTimer();
    this.restartAttempts = 0;

    if (options?.disable !== false) {
      this.config.enabled = false;
      this.persistConfig();
    }

    const proc = this.child;
    this.child = null;
    this.publicUrl = null;

    if (proc && proc.exitCode === null && !proc.killed) {
      await new Promise<void>((resolve) => {
        const forceTimer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {}
          resolve();
        }, 3000);

        proc.once('exit', () => {
          clearTimeout(forceTimer);
          resolve();
        });

        try {
          proc.kill('SIGTERM');
        } catch {
          clearTimeout(forceTimer);
          resolve();
        }
      });
    }

    return this.getStatus();
  }

  public async restart(): Promise<CloudflareTunnelStatus> {
    await this.stop({ disable: false });
    return this.start();
  }

  private scheduleReconnect() {
    this.clearRestartTimer();
    if (!this.config.enabled || this.intentionalStop) return;

    this.restartAttempts += 1;
    const delayMs = Math.min(60_000, 5000 * Math.pow(2, Math.min(this.restartAttempts - 1, 3)));
    console.log(`[TUNNEL] 🔄 Reconnecting Cloudflare Tunnel in ${Math.round(delayMs / 1000)}s...`);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.config.enabled && !this.intentionalStop) {
        void this.start();
      }
    }, delayMs);
  }

  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private normalizeHostnameUrl(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  private loadPersistedConfig(): Partial<CloudflareTunnelConfig> {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<CloudflareTunnelConfig>;
        return {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : undefined,
          mode: parsed.mode === 'named' || parsed.mode === 'quick' ? parsed.mode : undefined,
          tunnelToken: typeof parsed.tunnelToken === 'string' ? parsed.tunnelToken.trim() : undefined,
          customHostname: typeof parsed.customHostname === 'string' ? parsed.customHostname.trim() : undefined,
        };
      }
    } catch (err: any) {
      console.warn('[TUNNEL] Could not read persisted config:', err?.message || err);
    }
    return {};
  }

  private persistConfig() {
    try {
      const payload = JSON.stringify(
        {
          enabled: this.config.enabled,
          mode: this.config.mode,
          tunnelToken: this.config.tunnelToken,
          customHostname: this.config.customHostname,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      );
      fs.writeFileSync(this.configFilePath, payload, { mode: 0o600 });
    } catch (err: any) {
      console.warn('[TUNNEL] Could not persist config to disk:', err?.message || err);
    }
  }
}
