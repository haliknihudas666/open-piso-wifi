/**
 * ==============================================================================
 * ☁️ OpenPisoWiFi - Supabase Cloud Sync Service (Zero-Dependency REST)
 * ==============================================================================
 * Features:
 *   - Real PostgreSQL cloud sync via Supabase PostgREST API.
 *   - No heavy @supabase/supabase-js package needed (uses native fetch).
 *   - Offline resiliency: Queues events when internet is offline and flushes on recovery.
 *   - Multi-branch support: Tags events with MACHINE_ID for multi-location operators.
 *   - Fail-soft: If unconfigured, gracefully remains idle with zero runtime impact.
 * ==============================================================================
 */

export interface SupabaseConfig {
  url?: string;
  key?: string;
  machineId?: string;
}

export interface TransactionSyncPayload {
  slotId: string;
  slotName: string;
  amount: number;
  durationMinutes: number;
  macAddress: string;
  type?: 'COIN' | 'VOUCHER' | 'FREE_TRIAL';
}

export interface MachineHeartbeatPayload {
  uptimeSeconds: number;
  activeSlots: number;
  isWanOnline: boolean;
  currentCashBox: number;
  todayTotal: number;
}

export class SupabaseSyncService {
  private url: string | null = null;
  private key: string | null = null;
  private machineId: string = 'openpiso-kiosk-1';
  private isEnabled = false;
  private offlineQueue: Array<{ table: string; payload: any }> = [];
  private readonly MAX_OFFLINE_QUEUE = 150;
  private isFlushing = false;

  constructor(config?: SupabaseConfig) {
    this.url = config?.url || process.env.SUPABASE_URL || null;
    this.key = config?.key || process.env.SUPABASE_KEY || null;
    this.machineId = config?.machineId || process.env.MACHINE_ID || 'openpiso-kiosk-1';

    if (this.url && this.key) {
      // Normalize URL (strip trailing slash)
      this.url = this.url.replace(/\/+$/, '');
      this.isEnabled = true;
      console.log(`[SUPABASE] ☁️ Cloud sync enabled for machine: '${this.machineId}' -> ${this.url}`);
    } else {
      console.log('[SUPABASE] ℹ️ Credentials not configured (SUPABASE_URL / SUPABASE_KEY). Cloud sync running in offline/disabled mode.');
    }
  }

  public get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Records a completed coin/voucher transaction to Supabase.
   */
  public async recordTransaction(data: TransactionSyncPayload): Promise<void> {
    if (!this.isEnabled) return;

    const row = {
      machine_id: this.machineId,
      slot_id: data.slotId,
      slot_name: data.slotName,
      amount: data.amount,
      duration_minutes: data.durationMinutes,
      mac_address: data.macAddress,
      payment_type: data.type || 'COIN',
      created_at: new Date().toISOString(),
    };

    await this.postOrQueue('piso_transactions', row);
  }

  /**
   * Syncs periodic heartbeat / live telemetry to Supabase.
   */
  public async syncHeartbeat(data: MachineHeartbeatPayload): Promise<void> {
    if (!this.isEnabled) return;

    const row = {
      machine_id: this.machineId,
      uptime_seconds: data.uptimeSeconds,
      active_slots: data.activeSlots,
      is_wan_online: data.isWanOnline,
      cash_box_amount: data.currentCashBox,
      today_total: data.todayTotal,
      last_seen: new Date().toISOString(),
    };

    // Upsert into piso_machines table
    await this.postOrQueue('piso_machines', row, { upsert: true });
  }

  /**
   * Logs a cash box collection audit event.
   */
  public async recordCashCollection(amount: number, collectedBy = 'Admin'): Promise<void> {
    if (!this.isEnabled) return;

    const row = {
      machine_id: this.machineId,
      amount_collected: amount,
      collected_by: collectedBy,
      collected_at: new Date().toISOString(),
    };

    await this.postOrQueue('piso_collections', row);
  }

  /**
   * Flushes any queued offline records once internet is restored.
   */
  public async flushOfflineQueue(): Promise<void> {
    if (!this.isEnabled || this.offlineQueue.length === 0 || this.isFlushing) return;
    this.isFlushing = true;

    console.log(`[SUPABASE] 🔄 Flushing ${this.offlineQueue.length} offline records to cloud...`);
    const remaining: typeof this.offlineQueue = [];

    for (const item of this.offlineQueue) {
      const ok = await this.sendRestRequest(item.table, item.payload);
      if (!ok) {
        remaining.push(item);
      }
    }

    this.offlineQueue = remaining;
    this.isFlushing = false;
    if (this.offlineQueue.length === 0) {
      console.log('[SUPABASE] ✅ All offline records successfully synced.');
    }
  }

  // --- Remote Cloud Command Bus ---

  private commandHandler: ((commandType: string, payload: any) => Promise<{ success: boolean; result?: any; error?: string }>) | null = null;
  private isPollingCommands = false;

  /**
   * Sets the local daemon command execution callback.
   */
  public setCommandHandler(handler: (commandType: string, payload: any) => Promise<{ success: boolean; result?: any; error?: string }>): void {
    this.commandHandler = handler;
  }

  /**
   * Polls and executes any pending cloud commands from piso_commands table.
   */
  public async pollAndExecuteCommands(): Promise<void> {
    if (!this.isEnabled || !this.commandHandler || this.isPollingCommands) return;
    this.isPollingCommands = true;

    try {
      const endpoint = `${this.url}/rest/v1/piso_commands?machine_id=eq.${this.machineId}&status=eq.pending&order=created_at.asc&limit=5`;
      const res = await fetch(endpoint, {
        headers: {
          'apikey': this.key!,
          'Authorization': `Bearer ${this.key!}`,
        },
      });

      if (!res.ok) return;
      const commands = await res.json();
      if (!Array.isArray(commands) || commands.length === 0) return;

      for (const cmd of commands) {
        const now = new Date();
        const expiresAt = cmd.expires_at ? new Date(cmd.expires_at) : null;

        // Skip expired commands (e.g. sent hours ago during a prolonged power outage)
        if (expiresAt && expiresAt < now) {
          console.log(`[SUPABASE COMMAND] ⏱️ Command ${cmd.id} (${cmd.command_type}) expired. Marking expired.`);
          await this.patchCommandStatus(cmd.id, 'expired', { reason: 'Command expired before execution' });
          continue;
        }

        console.log(`[SUPABASE COMMAND] 📥 Executing remote command: ${cmd.command_type} (ID: ${cmd.id})`);
        // Mark as running
        await this.patchCommandStatus(cmd.id, 'running');

        try {
          const outcome = await this.commandHandler(cmd.command_type, cmd.payload || {});
          if (outcome.success) {
            await this.patchCommandStatus(cmd.id, 'completed', outcome.result || { success: true });
            console.log(`[SUPABASE COMMAND] ✅ Command ${cmd.id} (${cmd.command_type}) completed.`);
          } else {
            await this.patchCommandStatus(cmd.id, 'failed', { error: outcome.error || 'Execution failed' });
            console.warn(`[SUPABASE COMMAND] ⚠️ Command ${cmd.id} failed:`, outcome.error);
          }
        } catch (execErr: any) {
          await this.patchCommandStatus(cmd.id, 'failed', { error: execErr.message || String(execErr) });
          console.error(`[SUPABASE COMMAND] ❌ Error executing ${cmd.id}:`, execErr);
        }
      }
    } catch {
      // Offline / network glitch
    } finally {
      this.isPollingCommands = false;
    }
  }

  private async patchCommandStatus(id: string, status: string, result?: any): Promise<boolean> {
    try {
      const endpoint = `${this.url}/rest/v1/piso_commands?id=eq.${id}`;
      const payload: any = {
        status,
        result: result || {},
      };
      if (status === 'completed' || status === 'failed') {
        payload.executed_at = new Date().toISOString();
      }

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key!,
          'Authorization': `Bearer ${this.key!}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Private HTTP Core ---

  private async postOrQueue(table: string, payload: any, options?: { upsert?: boolean }) {
    const ok = await this.sendRestRequest(table, payload, options);
    if (!ok) {
      if (this.offlineQueue.length < this.MAX_OFFLINE_QUEUE) {
        this.offlineQueue.push({ table, payload });
      }
    }
  }

  private async sendRestRequest(table: string, payload: any, options?: { upsert?: boolean }): Promise<boolean> {
    try {
      const endpoint = `${this.url}/rest/v1/${table}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': this.key!,
        'Authorization': `Bearer ${this.key!}`,
        'Prefer': options?.upsert ? 'resolution=merge-duplicates,return=representation' : 'return=minimal',
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      return res.ok;
    } catch {
      return false;
    }
  }
}

