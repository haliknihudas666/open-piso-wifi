/**
 * ==============================================================================
 * 🤖 OpenPisoWiFi - Telegram Bot Service (Zero-Dependency Long-Polling)
 * ==============================================================================
 * Features:
 *   - 100% Free CGNAT-friendly remote admin via Telegram Bot API.
 *   - No port-forwarding or public IP needed (uses outbound long-polling).
 *   - Security: Restricts commands strictly to the configured TELEGRAM_ADMIN_CHAT_ID.
 *   - Instant push notifications: coin drops, session authorisations, WAN outages.
 *   - Remote management: /sales, /slots, /emptybox, /wan, /help.
 * ==============================================================================
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TelegramBotConfig {
  token?: string;
  adminChatId?: string;
}

export interface ShieldAlertSummary {
  type: string;
  severity: string;
  message: string;
  timestamp: number;
}

export interface MachineStatsProvider {
  getTodaySales: () => { totalAmount: number; transactionCount: number };
  getCashBoxAmount: () => number;
  resetCashBox: () => number;
  getSlotsStatus: () => Array<{ id: string; name: string; ip: string; status: string; rssi?: number }>;
  isWanOnline: () => boolean;
  getShieldStatus?: () => {
    stormShieldActive: boolean;
    stormShieldRemainingSec: number;
    counts: { deauthStorms: number; evilTwins: number; coinTampers: number; total: number };
    recentAlerts: ShieldAlertSummary[];
  };
}

function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat?: { id: number | string };
    text?: string;
    date: number;
  };
}

export class TelegramBotService {
  private token: string | null = null;
  private adminChatId: string | null = null;
  private isPolling = false;
  private lastUpdateId = 0;
  private statsProvider: MachineStatsProvider | null = null;
  private pollAbortController: AbortController | null = null;
  private bootNotifTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly configFilePath: string;

  constructor(config?: TelegramBotConfig) {
    this.configFilePath = path.join(process.cwd(), '.telegram-config.json');
    const saved = this.loadPersistedConfig();
    this.token = config?.token || saved.token || process.env.TELEGRAM_BOT_TOKEN || null;
    this.adminChatId = config?.adminChatId || saved.adminChatId || process.env.TELEGRAM_ADMIN_CHAT_ID || null;
  }

  private loadPersistedConfig(): { token: string | null; adminChatId: string | null } {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf8');
        const parsed = JSON.parse(raw) as { token?: string; adminChatId?: string };
        return {
          token: parsed.token?.trim() || null,
          adminChatId: parsed.adminChatId?.trim() || null,
        };
      }
    } catch (err: any) {
      console.warn('[TELEGRAM] Could not read persisted config:', err?.message || err);
    }
    return { token: null, adminChatId: null };
  }

  private persistConfig() {
    try {
      const payload = JSON.stringify(
        {
          token: this.token || '',
          adminChatId: this.adminChatId || '',
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      );
      fs.writeFileSync(this.configFilePath, payload, { mode: 0o600 });
    } catch (err: any) {
      console.warn('[TELEGRAM] Could not persist config to disk:', err?.message || err);
    }
  }

  public setStatsProvider(provider: MachineStatsProvider) {
    this.statsProvider = provider;
  }

  public start(options?: { isBoot?: boolean }) {
    if (!this.token || !this.adminChatId) {
      console.log('[TELEGRAM] ℹ️ Bot credentials not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID). Running in offline/disabled mode.');
      return;
    }

    if (this.isPolling) return;
    this.isPolling = true;
    console.log(`[TELEGRAM] 🚀 Starting long-polling service for admin chat ID: ${this.adminChatId}...`);

    const host = os.hostname();
    const portalIp = process.env.PORTAL_IP || '10.0.0.1';
    const bootLabel = options?.isBoot ? '🟢 *OpenPisoWiFi Machine Booted & Online*' : '🟢 *OpenPisoWiFi Daemon Online*';
    const message =
      `${bootLabel}\n\n` +
      `• *Host:* \`${host}\`\n` +
      `• *Portal:* http://${portalIp}/\n` +
      `• *Status:* Active and ready\n\n` +
      `Type /help for remote commands.`;

    this.sendBootNotificationWithRetry(message);
    this.pollLoop();
  }

  /**
   * Retries delivering the startup/boot notification if the machine booted
   * before WAN/router internet connectivity became ready (up to ~60s).
   */
  private sendBootNotificationWithRetry(markdownText: string, attempt = 1) {
    if (this.bootNotifTimer) {
      clearTimeout(this.bootNotifTimer);
      this.bootNotifTimer = null;
    }
    if (!this.isPolling || !this.token || !this.adminChatId) return;

    this.sendNotification(markdownText, { skipDedupe: true }).then((ok) => {
      if (ok) {
        console.log(`[TELEGRAM] ✅ Startup notification delivered (attempt ${attempt}).`);
        return;
      }
      if (attempt < 12 && this.isPolling) {
        console.log(`[TELEGRAM] ⏳ Startup notification deferred (WAN not ready, retry ${attempt}/12 in 5s)...`);
        this.bootNotifTimer = setTimeout(() => {
          this.sendBootNotificationWithRetry(markdownText, attempt + 1);
        }, 5000);
      }
    });
  }

  public stop() {
    this.isPolling = false;
    if (this.bootNotifTimer) {
      clearTimeout(this.bootNotifTimer);
      this.bootNotifTimer = null;
    }
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
  }

  public updateConfig(token?: string | null, adminChatId?: string | null, options?: { isBoot?: boolean }) {
    if (token !== undefined) this.token = token ? token.trim() : null;
    if (adminChatId !== undefined) this.adminChatId = adminChatId ? adminChatId.trim() : null;

    this.persistConfig();

    if (this.isPolling) {
      this.stop();
    }

    if (this.token && this.adminChatId) {
      this.start({ isBoot: options?.isBoot });
    }
  }

  public getStatus() {
    return {
      configured: Boolean(this.token && this.adminChatId),
      hasToken: Boolean(this.token),
      tokenMasked: this.token
        ? (this.token.length > 10 ? `${this.token.slice(0, 6)}...${this.token.slice(-4)}` : '******')
        : null,
      adminChatId: this.adminChatId || '',
      isPolling: this.isPolling,
    };
  }

  private sentHistory = new Map<string, number>();

  private isDuplicate(key: string, cooldownMs: number): boolean {
    const now = Date.now();
    const lastSent = this.sentHistory.get(key);
    if (lastSent && now - lastSent < cooldownMs) {
      return true;
    }
    this.sentHistory.set(key, now);
    // Cleanup old entries
    if (this.sentHistory.size > 200) {
      for (const [k, time] of this.sentHistory.entries()) {
        if (now - time > 3600000) {
          this.sentHistory.delete(k);
        }
      }
    }
    return false;
  }

  public async sendNotification(
    markdownText: string,
    options?: { dedupeKey?: string; cooldownMs?: number; skipDedupe?: boolean }
  ): Promise<boolean> {
    if (!this.token || !this.adminChatId) return false;

    const dedupeKey = options?.dedupeKey || `msg:${markdownText}`;
    const cooldown = options?.cooldownMs ?? 20000; // 20s cooldown for identical messages

    if (!options?.skipDedupe && this.isDuplicate(dedupeKey, cooldown)) {
      console.log(`[TELEGRAM] ⏳ Suppressed duplicate notification within ${cooldown / 1000}s cooldown.`);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.adminChatId,
          text: markdownText,
          parse_mode: 'Markdown',
        }),
      });
      return res.ok;
    } catch (err: any) {
      console.error('[TELEGRAM] ❌ Failed to send notification:', err?.message || err);
      return false;
    }
  }

  // --- Real-Time Push Triggers ---

  public notifyCoinInserted(slotName: string, amount: number, pendingTotal: number) {
    this.sendNotification(
      `🪙 *Coin Inserted!*\n` +
      `• *Location:* ${slotName}\n` +
      `• *Drop:* +₱${amount.toFixed(2)}\n` +
      `• *Current Balance:* ₱${pendingTotal.toFixed(2)}`
    );
  }

  public notifySessionAuthorized(slotName: string, amount: number, durationMinutes: number, mac: string) {
    const normalizedMac = mac.toLowerCase();

    // Safety Gate: If duration represents an unlimited/whitelisted session (e.g. 1 year / 8760h),
    // redirect to VIP notification instead of presenting as a paid coinslot session!
    if (durationMinutes >= 500000) {
      this.notifyVipConnected(mac);
      return;
    }

    const dedupeKey = `session:${normalizedMac}`;
    if (this.isDuplicate(dedupeKey, 2 * 60 * 1000)) {
      console.log(`[TELEGRAM] ⏳ Suppressed duplicate session notification for ${mac}`);
      return;
    }

    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    this.sendNotification(
      `📶 *New Wi-Fi Session Started*\n` +
      `• *Slot:* ${slotName}\n` +
      `• *Paid:* ₱${amount.toFixed(2)}\n` +
      `• *Duration:* ${timeStr}\n` +
      `• *Client MAC:* \`${mac}\``,
      { dedupeKey, cooldownMs: 2 * 60 * 1000 }
    );
  }

  public notifyVipConnected(mac: string, deviceName?: string, notes?: string) {
    const normalizedMac = mac.toLowerCase();
    const dedupeKey = `vip:${normalizedMac}`;

    // Suppress repeated VIP notifications within 30 minutes for the same device
    if (this.isDuplicate(dedupeKey, 30 * 60 * 1000)) {
      return;
    }

    const nameLine = deviceName ? `• *Device:* ${deviceName}\n` : '';
    const notesLine = notes ? `• *Notes:* ${notes}\n` : '';

    this.sendNotification(
      `👑 *VIP / Whitelisted Device Online*\n` +
      `• *Status:* Unlimited Access (Whitelisted)\n` +
      nameLine +
      notesLine +
      `• *Client MAC:* \`${mac}\``,
      { dedupeKey, cooldownMs: 30 * 60 * 1000 }
    );
  }

  public notifyWanStatus(isOnline: boolean) {
    const dedupeKey = `wan:${isOnline ? 'online' : 'offline'}`;
    if (this.isDuplicate(dedupeKey, 60 * 1000)) {
      return;
    }

    if (isOnline) {
      this.sendNotification('🌐 *WAN Recovered*\nInternet connection has been restored.', {
        dedupeKey,
        cooldownMs: 60 * 1000,
      });
    } else {
      this.sendNotification('⚠️ *WAN Outage Alert!*\nInternet connection is DOWN. Coinslots have been inhibited.', {
        dedupeKey,
        cooldownMs: 60 * 1000,
      });
    }
  }

  public notifySlotRegistered(slotId: string, slotName: string, ip: string) {
    this.sendNotification(
      `🔌 *Coinslot Satellite Online*\n` +
      `• *ID:* \`${escapeTelegramMarkdown(slotId)}\`\n` +
      `• *Name:* ${escapeTelegramMarkdown(slotName)}\n` +
      `• *IP:* \`${escapeTelegramMarkdown(ip)}\``
    );
  }

  public notifySecurityAlert(
    type: string,
    severity: 'high' | 'medium' | 'low',
    details: string | Record<string, unknown>,
    cooldownMs = 60000
  ): Promise<boolean> {
    const icon = severity === 'high' ? '🚨' : severity === 'medium' ? '⚠️' : 'ℹ️';
    let detailStr = '';
    let identifier = '';

    if (typeof details === 'string') {
      detailStr = escapeTelegramMarkdown(details);
      identifier = details.slice(0, 64);
    } else if (details && typeof details === 'object') {
      const lines: string[] = [];
      for (const [k, v] of Object.entries(details)) {
        if (v === undefined || v === null || v === '') continue;
        const safeKey = escapeTelegramMarkdown(k);
        const safeVal = escapeTelegramMarkdown(String(v));
        lines.push(`• *${safeKey}:* ${safeVal}`);
      }
      detailStr = lines.join('\n');
      identifier = String(details.bssid || details.mac || details.ssid || details.message || '');
    }

    const dedupeKey = `shield:${type}:${severity}:${identifier}`;
    const headerType = escapeTelegramMarkdown(type.toUpperCase());
    const text =
      `${icon} *OpenPiso Shield Alert*\n` +
      `• *Type:* \`${headerType}\`\n` +
      `• *Severity:* *${severity.toUpperCase()}*\n` +
      (detailStr ? (typeof details === 'string' ? `• *Details:* ${detailStr}` : detailStr) : '');

    return this.sendNotification(text, { dedupeKey, cooldownMs });
  }

  // --- Inbound Long-Polling Engine ---

  private async pollLoop() {
    while (this.isPolling) {
      try {
        this.pollAbortController = new AbortController();
        const timeoutMs = 25000;
        const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=20`;

        const res = await fetch(url, {
          signal: this.pollAbortController.signal,
        });

        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        const data = await res.json() as { ok: boolean; result: TelegramUpdate[] };
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            await this.handleUpdate(update);
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // Pause briefly on network drop
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate) {
    if (!update.message || !update.message.text) return;

    const senderChatId = String(update.message.chat?.id);
    const text = update.message.text.trim();

    // Security Gate: Reject messages from unauthorized senders
    if (this.adminChatId && senderChatId !== this.adminChatId) {
      console.warn(`[TELEGRAM] 🛑 Ignored command from unauthorized chat: ${senderChatId}`);
      return;
    }

    const command = (text.split(' ')[0] || '').toLowerCase().split('@')[0] || '';

    switch (command) {
      case '/start':
      case '/help':
        await this.handleHelpCommand();
        break;

      case '/sales':
        await this.handleSalesCommand();
        break;

      case '/slots':
        await this.handleSlotsCommand();
        break;

      case '/emptybox':
        await this.handleEmptyBoxCommand();
        break;

      case '/wan':
        await this.handleWanCommand();
        break;

      case '/shield':
        await this.handleShieldCommand();
        break;

      default:
        // Ignore non-command messages
        break;
    }
  }

  private async handleHelpCommand() {
    const msg =
      '🤖 *OpenPisoWiFi Remote Commands*\n\n' +
      '• `/sales` — View today\'s total earnings & cash box\n' +
      '• `/slots` — Live status of all ESP32 coin slots\n' +
      '• `/emptybox` — Reset cash box counter after collecting\n' +
      '• `/wan` — Check live internet connectivity status\n' +
      '• `/shield` — Check OpenPiso Shield & security alerts\n' +
      '• `/help` — Display this command menu';
    await this.sendNotification(msg);
  }

  private async handleSalesCommand() {
    if (!this.statsProvider) {
      await this.sendNotification('⚠️ Telemetry provider not initialized.');
      return;
    }

    const today = this.statsProvider.getTodaySales();
    const cashBox = this.statsProvider.getCashBoxAmount();

    const msg =
      '📊 *Sales Summary*\n\n' +
      `• *Today\'s Income:* ₱${today.totalAmount.toFixed(2)}\n` +
      `• *Transactions:* ${today.transactionCount}\n` +
      `• *Current Cash in Box:* ₱${cashBox.toFixed(2)}\n` +
      `• *Last Updated:* ${new Date().toLocaleTimeString('en-PH')}`;
    await this.sendNotification(msg);
  }

  private async handleSlotsCommand() {
    if (!this.statsProvider) return;

    const slots = this.statsProvider.getSlotsStatus();
    if (slots.length === 0) {
      await this.sendNotification('ℹ️ No ESP32 satellite coinslots currently registered.');
      return;
    }

    let msg = '🪙 *Registered Coinslots:*\n\n';
    for (const s of slots) {
      const icon = s.status === 'unlocked' ? '🔓' : '🟢';
      const rssi = s.rssi ? ` (${s.rssi} dBm)` : '';
      msg += `${icon} *${s.name}* (\`${s.id}\`)\n   IP: \`${s.ip}\`${rssi} | Status: *${s.status}*\n\n`;
    }

    await this.sendNotification(msg);
  }

  private async handleEmptyBoxCommand() {
    if (!this.statsProvider) return;

    const collected = this.statsProvider.resetCashBox();
    const msg =
      '💰 *Cash Box Collected!*\n\n' +
      `• *Collected Amount:* ₱${collected.toFixed(2)}\n` +
      `• *Cash Box Reset To:* ₱0.00\n` +
      `• *Timestamp:* ${new Date().toLocaleString('en-PH')}`;
    await this.sendNotification(msg);
  }

  private async handleWanCommand() {
    if (!this.statsProvider) return;

    const online = this.statsProvider.isWanOnline();
    const status = online ? '🟢 Online (Operational)' : '🔴 Offline (Disconnected)';
    await this.sendNotification(`🌐 *WAN Status:* ${status}`);
  }

  private async handleShieldCommand() {
    if (!this.statsProvider?.getShieldStatus) {
      await this.sendNotification('🛡️ *OpenPiso Shield:* Telemetry not initialized.');
      return;
    }

    const shield = this.statsProvider.getShieldStatus();
    const stormText = shield.stormShieldActive
      ? `🔴 ENGAGED (${shield.stormShieldRemainingSec}s remaining)`
      : '🟢 Armed (Standby)';

    let msg =
      '🛡️ *OpenPiso Shield Status*\n\n' +
      `• *Storm Shield:* ${stormText}\n` +
      `• *Deauth Storms:* ${shield.counts.deauthStorms}\n` +
      `• *Evil Twins:* ${shield.counts.evilTwins}\n` +
      `• *Coin Tampers:* ${shield.counts.coinTampers}\n` +
      `• *Total Alerts:* ${shield.counts.total}`;

    if (shield.recentAlerts.length > 0) {
      msg += '\n\n*Recent Alerts:*\n';
      for (const a of shield.recentAlerts.slice(0, 3)) {
        const timeStr = new Date(a.timestamp).toLocaleTimeString('en-PH');
        msg += `• [${escapeTelegramMarkdown(a.severity.toUpperCase())}] \`${escapeTelegramMarkdown(a.type)}\`: ${escapeTelegramMarkdown(a.message)} (${timeStr})\n`;
      }
    }

    await this.sendNotification(msg, { skipDedupe: true });
  }
}
