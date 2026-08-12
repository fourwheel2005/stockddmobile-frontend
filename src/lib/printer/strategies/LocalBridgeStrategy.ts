import type { PrinterStrategy, PrinterStrategyName, PrintJobMeta } from '../types';

/** Bridge URL — default localhost:8765, override ผ่าน localStorage หรือ env */
function getBridgeUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('ddmobile.bridge.url');
    if (custom && custom.trim()) return custom.trim().replace(/\/$/, '');
  }
  return 'http://localhost:8765';
}

/**
 * Talk to local print bridge daemon — fastest + cash drawer support.
 *
 * <h3>Security</h3>
 *  - URL = localhost only → ไม่ leak ออก network
 *  - Token = สร้างตอน install bridge (ผู้ใช้ paste ใน POS settings)
 *  - CORS = bridge whitelist Vercel domain
 *
 * <h3>Circuit Breaker</h3>
 *  - ถ้า health fail 3 ครั้งติด → mark unhealthy (skip ไป strategy ถัดไป)
 *  - reset หลัง 30 วินาที
 */
export class LocalBridgeStrategy implements PrinterStrategy {
  readonly name: PrinterStrategyName = 'LOCAL_BRIDGE';

  private healthFailures = 0;
  private circuitOpenUntil = 0;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_AFTER_MS = 30_000;

  constructor(private token: string | null = null) {}

  setToken(token: string | null) {
    this.token = token;
  }

  label(): string {
    return '🔌 Local Bridge (PC)';
  }

  async isReady(): Promise<boolean> {
    if (Date.now() < this.circuitOpenUntil) return false;

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1000);
      const res = await fetch(`${getBridgeUrl()}/health`, {
        signal: ctrl.signal,
        // ngrok-skip-browser-warning → ข้ามหน้าเตือน interstitial ของ ngrok free (กัน bridge ตรวจไม่เจอ)
        headers: {
          'ngrok-skip-browser-warning': 'true',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.healthFailures = 0;
      return true;
    } catch {
      this.healthFailures++;
      if (this.healthFailures >= this.FAILURE_THRESHOLD) {
        this.circuitOpenUntil = Date.now() + this.RESET_AFTER_MS;
      }
      return false;
    }
  }

  async print(bytes: Uint8Array, meta: PrintJobMeta): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'ngrok-skip-browser-warning': 'true',
      'X-Bill-No': meta.billNo,
      'X-Duplicate': meta.duplicate ? '1' : '0',
      'X-Open-Drawer': meta.openDrawer ? '1' : '0',
      // FIX-149: label = TSC TTP-247 (TSPL) · receipt = Epson (ESC/POS) — bridge เลือกเครื่องตามนี้
      'X-Printer-Target': meta.target ?? 'receipt',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    // Copy to plain ArrayBuffer (BodyInit-safe across TS lib variations)
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const res = await fetch(`${getBridgeUrl()}/print`, {
      method: 'POST',
      headers,
      body: buf,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Bridge: HTTP ${res.status} ${txt}`);
    }
  }

  /** เปิดลิ้นชักโดยตรง (ไม่พิมพ์) */
  async openDrawer(): Promise<void> {
    const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${getBridgeUrl()}/drawer/open`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      throw new Error(`Bridge drawer open: HTTP ${res.status}`);
    }
  }
}
