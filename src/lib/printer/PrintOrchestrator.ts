import { LocalBridgeStrategy } from './strategies/LocalBridgeStrategy';
import { WebUsbStrategy } from './strategies/WebUsbStrategy';
import { BrowserPrintStrategy } from './strategies/BrowserPrintStrategy';
import type { PrinterStrategy, PrinterStrategyName, PrintJobMeta } from './types';

/**
 * Multi-tier fallback orchestrator.
 *
 * <h3>Priority order (best → worst)</h3>
 *  1. Local Bridge — silent, fast, supports cash drawer
 *  2. WebUSB — silent, fast, no cash drawer
 *  3. Browser Print — slow, manual dialog
 *
 * <h3>Algorithm</h3>
 *  - ลองตามลำดับ — ตัวแรกที่ ready + print success = หยุด
 *  - ถ้าทุกตัว fail → throw "no working strategy"
 *  - retry per strategy: 1 ครั้ง (exponential backoff handled by orchestrator)
 */
export class PrintOrchestrator {
  private strategies: PrinterStrategy[];

  constructor(
    private localBridge = new LocalBridgeStrategy(),
    private webUsb = new WebUsbStrategy(),
    private browserPrint = new BrowserPrintStrategy(),
  ) {
    // Priority: bridge → webusb → browser
    this.strategies = [localBridge, webUsb, browserPrint];
  }

  getLocalBridge(): LocalBridgeStrategy { return this.localBridge; }
  getWebUsb(): WebUsbStrategy { return this.webUsb; }
  getBrowserPrint(): BrowserPrintStrategy { return this.browserPrint; }

  setBridgeToken(token: string | null) {
    this.localBridge.setToken(token);
  }

  /**
   * พิมพ์ — ลองทุก strategy ตามลำดับ
   * คืน strategy ที่สำเร็จ (เพื่อ log audit)
   */
  async print(
    bytes: Uint8Array,
    meta: PrintJobMeta,
  ): Promise<{ strategy: PrinterStrategyName; printerId?: string }> {
    const errors: string[] = [];

    for (const s of this.strategies) {
      try {
        const ready = await s.isReady();
        if (!ready) {
          errors.push(`${s.name}: not ready`);
          continue;
        }
        await s.print(bytes, meta);
        return { strategy: s.name };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${s.name}: ${msg}`);
        // log + ลองตัวถัดไป
        console.warn(`[print] ${s.name} failed:`, msg);
      }
    }

    throw new Error(`ทุก strategy ล้มเหลว:\n${errors.join('\n')}`);
  }

  /**
   * Discover — เช็คว่า strategy ไหนใช้ได้ (สำหรับ status badge)
   */
  async discover(): Promise<Array<{ name: PrinterStrategyName; ready: boolean; label: string }>> {
    const results = await Promise.all(
      this.strategies.map(async (s) => ({
        name: s.name,
        ready: await s.isReady(),
        label: s.label(),
      })),
    );
    return results;
  }
}

/** Singleton instance — ใช้ทั่ว app */
export const printOrchestrator = new PrintOrchestrator();
