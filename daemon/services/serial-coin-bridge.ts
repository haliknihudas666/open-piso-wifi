import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SerialCoinInsertedEvent {
  amount: number;
  pulses: number;
  total?: number;
}

export interface SerialTamperEvent {
  reason: string;
  widthMs?: number;
}

export interface SerialReadyEvent {
  module?: string;
  version?: string;
}

export interface SerialInhibitChangedEvent {
  locked: boolean;
}

export function isValidSerialPortPath(port: string): boolean {
  const trimmed = port.trim();
  if (!trimmed || trimmed.includes('..')) return false;
  return /^\/dev\/(tty[A-Za-z0-9_.-]+|serial\/by-(id|path)\/[A-Za-z0-9_.:+-]+)$/.test(trimmed);
}

/**
 * Linux USB Serial Coin Bridge for firmware/esp32-coin-bridge/esp32-coin-bridge.ino.
 * Uses `stty` (via execFile, no shell) to configure 115200 8N1 raw mode and streams
 * newline-delimited JSON events without requiring native serialport bindings.
 */
export class SerialCoinBridge extends EventEmitter {
  private portPath: string;
  private fd: number | null = null;
  private readStream: fs.ReadStream | null = null;
  private buffer = '';
  private active = false;
  private ready = false;
  private lastError: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(portPath?: string) {
    super();
    this.portPath = (portPath ?? process.env.SERIAL_COIN_PORT ?? '').trim();
  }

  public isEnabled(): boolean {
    return process.platform === 'linux' && Boolean(this.portPath);
  }

  public isActive(): boolean {
    return this.active;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getPort(): string {
    return this.portPath;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public async start(overridePort?: string): Promise<boolean> {
    if (overridePort !== undefined) {
      this.portPath = overridePort.trim();
    }

    this.stopped = false;
    this.cleanupHandles();

    if (process.platform !== 'linux') {
      this.lastError = `Serial coin bridge disabled on ${process.platform} (Linux only).`;
      return false;
    }

    if (!this.portPath) {
      this.lastError = null;
      return false;
    }

    if (!isValidSerialPortPath(this.portPath)) {
      this.lastError = `Invalid serial device path: ${this.portPath}`;
      console.warn(`[SERIAL-BRIDGE] ${this.lastError}`);
      return false;
    }

    if (!fs.existsSync(this.portPath)) {
      this.lastError = `Serial device not found: ${this.portPath}`;
      console.warn(`[SERIAL-BRIDGE] ${this.lastError}`);
      return false;
    }

    try {
      await this.configurePort();

      const fd = fs.openSync(this.portPath, fs.constants.O_RDWR | fs.constants.O_NOCTTY);
      this.fd = fd;
      this.active = true;
      this.lastError = null;

      const stream = fs.createReadStream(this.portPath, {
        fd,
        encoding: 'utf8',
        autoClose: false,
      });
      this.readStream = stream;

      stream.on('data', (chunk: string | Buffer) => {
        this.handleChunk(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      });

      stream.on('error', (err: Error) => {
        this.lastError = err.message;
        console.warn(`[SERIAL-BRIDGE] Stream error on ${this.portPath}: ${err.message}`);
        this.handleDisconnect();
      });

      stream.on('close', () => {
        if (this.active && !this.stopped) {
          this.handleDisconnect();
        }
      });

      console.log(`[SERIAL-BRIDGE] Connected to ESP32 USB serial bridge at ${this.portPath} (115200 raw)`);
      return true;
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      console.warn(`[SERIAL-BRIDGE] Failed to open ${this.portPath}: ${this.lastError}`);
      this.cleanupHandles();
      return false;
    }
  }

  private async configurePort(): Promise<void> {
    try {
      await execFileAsync('stty', [
        '-F',
        this.portPath,
        '115200',
        'raw',
        '-echo',
        '-echoe',
        '-echok',
        '-hupcl',
      ]);
    } catch {
      // BusyBox / minimal stty fallback without -echoe/-echok/-hupcl
      await execFileAsync('stty', ['-F', this.portPath, '115200', 'raw', '-echo']);
    }
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('{')) continue;

      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.status === 'ready') {
          this.ready = true;
          this.emit('ready', {
            module: typeof msg.module === 'string' ? msg.module : undefined,
            version: typeof msg.version === 'string' ? msg.version : undefined,
          } satisfies SerialReadyEvent);
          continue;
        }

        if (msg.event === 'coin_inserted') {
          const pulses = typeof msg.pulses === 'number' && msg.pulses > 0 ? Math.floor(msg.pulses) : 1;
          const amount = typeof msg.amount === 'number' && msg.amount > 0 ? msg.amount : pulses;
          const total = typeof msg.total === 'number' ? msg.total : undefined;
          this.emit('coin_inserted', { amount, pulses, total } satisfies SerialCoinInsertedEvent);
        } else if (msg.event === 'tamper') {
          this.emit('tamper', {
            reason: typeof msg.reason === 'string' ? msg.reason : 'serial_tamper',
            widthMs: typeof msg.widthMs === 'number' ? msg.widthMs : undefined,
          } satisfies SerialTamperEvent);
        } else if (msg.event === 'inhibit_changed') {
          this.emit('inhibit_changed', {
            locked: Boolean(msg.locked),
          } satisfies SerialInhibitChangedEvent);
        }
      } catch {
        // Ignore partial or non-JSON diagnostic serial lines
      }
    }
  }

  private handleDisconnect(): void {
    this.cleanupHandles();
    if (this.stopped || !this.isEnabled()) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) {
        void this.start();
      }
    }, 5000);
  }

  public setInhibit(locked: boolean): boolean {
    return this.writeCommand({ cmd: 'inhibit', state: locked });
  }

  public resetCounter(): boolean {
    return this.writeCommand({ cmd: 'reset' });
  }

  public writeCommand(payload: Record<string, unknown>): boolean {
    if (this.fd === null || !this.active) return false;
    try {
      const line = JSON.stringify(payload) + '\n';
      fs.writeSync(this.fd, line, null, 'utf8');
      return true;
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      console.warn(`[SERIAL-BRIDGE] Write failed on ${this.portPath}: ${this.lastError}`);
      return false;
    }
  }

  private cleanupHandles(): void {
    this.active = false;
    this.ready = false;
    this.buffer = '';
    if (this.readStream) {
      try {
        this.readStream.removeAllListeners();
        this.readStream.destroy();
      } catch {}
      this.readStream = null;
    }
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {}
      this.fd = null;
    }
  }

  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupHandles();
  }
}
