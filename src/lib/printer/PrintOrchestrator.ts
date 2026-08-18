import { LocalBridgeStrategy } from './strategies/LocalBridgeStrategy';
import { CloudQueueStrategy } from './strategies/CloudQueueStrategy';
import { WebUsbStrategy } from './strategies/WebUsbStrategy';
import { BrowserPrintStrategy } from './strategies/BrowserPrintStrategy';
import type { PrinterStrategy, PrinterStrategyName, PrintJobMeta } from './types';

export interface PrintExecutionOptions {
  /** HTML ที่ตรงกับงานนี้เท่านั้น — สร้าง strategy ต่อ invocation เพื่อไม่ให้ callback เก่าค้าง */
  browserPrint?: () => Promise<void>;
}

/**
 * Multi-tier fallback orchestrator.
 *
 * <h3>Priority order (best → worst)</h3>
 *  1. Local Bridge — silent, fast, cash drawer (เครื่องเดียวกับปริ้นเตอร์)
 *  2. Pull-Agent (cloud queue) — iPad/มือถือทุกสาขา, ไม่ต้อง tunnel
 *  3. WebUSB — silent, no cash drawer
 *  4. Browser Print — slow, manual dialog
 *
 * <h3>Algorithm</h3>
 *  - ลองตามลำดับ — ตัวแรกที่ ready + print success = หยุด
 *  - ถ้าทุกตัว fail → throw "no working strategy"
 */
export class PrintOrchestrator {
  private strategies: PrinterStrategy[];

  constructor(
    private localBridge = new LocalBridgeStrategy(),
    private cloudQueue = new CloudQueueStrategy(),
    private webUsb = new WebUsbStrategy(),
  ) {
    // Priority: bridge (direct) → pull-agent (cloud) → webusb
    this.strategies = [localBridge, cloudQueue, webUsb];
  }

  getLocalBridge(): LocalBridgeStrategy { return this.localBridge; }
  getCloudQueue(): CloudQueueStrategy { return this.cloudQueue; }
  getWebUsb(): WebUsbStrategy { return this.webUsb; }

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
    options: PrintExecutionOptions = {},
  ): Promise<{ strategy: PrinterStrategyName; printerId?: string }> {
    const errors: string[] = [];
    const strategies = [
      ...this.strategies,
      new BrowserPrintStrategy(options.browserPrint),
    ];

    for (const s of strategies) {
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

    // FIX-148: ข้อความ actionable — เดิมตกถึง BROWSER แล้ว window.print() หน้าขาว + ตอบสำเร็จปลอม ตอนนี้ fail ชัด
    throw new Error(
      'ไม่พบเครื่องพิมพ์ความร้อนที่พร้อมใช้ — เปิด Local Bridge บนเครื่องที่เสียบปริ้นเตอร์ '
      + 'หรือเชื่อม WebUSB ใน "ตั้งค่าเครื่องพิมพ์" แล้วลองใหม่ '
      + `(รายละเอียด: ${errors.join(' · ')})`,
    );
  }

  /**
   * Discover — เช็คว่า strategy ไหนใช้ได้ (สำหรับ status badge)
   */
  async discover(): Promise<Array<{ name: PrinterStrategyName; ready: boolean; label: string }>> {
    const strategies = [...this.strategies, new BrowserPrintStrategy()];
    const results = await Promise.all(
      strategies.map(async (s) => ({
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
