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

export interface TelegramBotConfig {
  token?: string;
  adminChatId?: string;
}

export interface MachineStatsProvider {
  getTodaySales: () => { totalAmount: number; transactionCount: number };
  getCashBoxAmount: () => number;
  resetCashBox: () => number;
  getSlotsStatus: () => Array<{ id: string; name: string; ip: string; status: string; rssi?: number }>;
  isWanOnline: () => boolean;
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

  constructor(config?: TelegramBotConfig) {
    this.token = config?.token || process.env.TELEGRAM_BOT_TOKEN || null;
    this.adminChatId = config?.adminChatId || process.env.TELEGRAM_ADMIN_CHAT_ID || null;
  }

  public setStatsProvider(provider: MachineStatsProvider) {
    this.statsProvider = provider;
  }

  public start() {
    if (!this.token || !this.adminChatId) {
      console.log('[TELEGRAM] ℹ️ Bot credentials not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID). Running in offline/disabled mode.');
      return;
    }

    if (this.isPolling) return;
    this.isPolling = true;
    console.log(`[TELEGRAM] 🚀 Starting long-polling service for admin chat ID: ${this.adminChatId}...`);

    this.sendNotification(
      '🟢 *OpenPisoWiFi Daemon Online*\n\n' +
      'System is active and ready.\n' +
      'Type /help for remote commands.'
    );

    this.pollLoop();
  }

  public stop() {
    this.isPolling = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
  }

  public updateConfig(token?: string | null, adminChatId?: string | null) {
    if (token !== undefined) this.token = token ? token.trim() : null;
    if (adminChatId !== undefined) this.adminChatId = adminChatId ? adminChatId.trim() : null;

    if (this.isPolling) {
      this.stop();
    }

    if (this.token && this.adminChatId) {
      this.start();
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

  public async sendNotification(markdownText: string): Promise<boolean> {
    if (!this.token || !this.adminChatId) return false;

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
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    this.sendNotification(
      `📶 *New Wi-Fi Session Started*\n` +
      `• *Slot:* ${slotName}\n` +
      `• *Paid:* ₱${amount.toFixed(2)}\n` +
      `• *Duration:* ${timeStr}\n` +
      `• *Client MAC:* \`${mac}\``
    );
  }

  public notifyWanStatus(isOnline: boolean) {
    if (isOnline) {
      this.sendNotification('🌐 *WAN Recovered*\nInternet connection has been restored.');
    } else {
      this.sendNotification('⚠️ *WAN Outage Alert!*\nInternet connection is DOWN. Coinslots have been inhibited.');
    }
  }

  public notifySlotRegistered(slotId: string, slotName: string, ip: string) {
    this.sendNotification(
      `🔌 *Coinslot Satellite Online*\n` +
      `• *ID:* \`${slotId}\`\n` +
      `• *Name:* ${slotName}\n` +
      `• *IP:* \`${ip}\``
    );
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

    const command = (text.split(' ')[0] || '').toLowerCase();

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
}
