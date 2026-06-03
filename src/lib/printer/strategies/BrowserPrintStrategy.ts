import type { PrinterStrategy, PrinterStrategyName, PrintJobMeta } from '../types';

/**
 * Fallback: window.print() — ใช้ ReceiptPrintView (HTML)
 * เรียก setLastBill() + setTimeout window.print() ที่ POS page เดิม.
 *
 * Note: strategy นี้ไม่รับ ESC/POS bytes ตรงๆ — caller ต้อง render HTML แทน
 * และเรียก browserPrint() ของ React component.
 */
export class BrowserPrintStrategy implements PrinterStrategy {
  readonly name: PrinterStrategyName = 'BROWSER';

  /** Callback ที่ caller setup ให้ — render HTML + window.print() */
  private printCallback: (() => Promise<void>) | null = null;

  setPrintCallback(cb: () => Promise<void>) {
    this.printCallback = cb;
  }

  label(): string {
    return '🖨 Browser Print (Fallback)';
  }

  async isReady(): Promise<boolean> {
    return typeof window !== 'undefined' && typeof window.print === 'function';
  }

  async print(_bytes: Uint8Array, _meta: PrintJobMeta): Promise<void> {
    if (!this.printCallback) {
      // fallback minimal — เปิด print dialog
      window.print();
      return;
    }
    await this.printCallback();
  }
}
