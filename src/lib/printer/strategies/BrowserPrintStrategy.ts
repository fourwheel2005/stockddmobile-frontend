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

  /** FIX-148: เคลียร์หลังใช้เสมอ — callback ค้างบน singleton จะทำให้งานพิมพ์อื่น (ป้าย/ใบเสร็จ)
   *  ที่ตกมาถึง BROWSER ไป render เนื้อหาเก่าผิดงาน */
  clearPrintCallback() {
    this.printCallback = null;
  }

  label(): string {
    return '🖨 Browser Print (Fallback)';
  }

  async isReady(): Promise<boolean> {
    // FIX-148: งานพิมพ์เป็น ESC/POS bytes — browser render เองไม่ได้ ต้องมี HTML callback เท่านั้น
    // เดิม ready เสมอ → window.print() เปล่า = หน้าขาว (CSS @media print ซ่อนทั้งหน้า และไม่มี
    // .receipt-print ใน DOM) + toast "พิมพ์แล้ว" ปลอม — ไม่มี callback = ไม่พร้อม ให้ orchestrator แจ้ง error จริง
    return typeof window !== 'undefined'
        && typeof window.print === 'function'
        && this.printCallback != null;
  }

  async print(_bytes: Uint8Array, _meta: PrintJobMeta): Promise<void> {
    if (!this.printCallback) {
      throw new Error('Browser print ต้องมีหน้า HTML ให้ render (ไม่มี callback)');
    }
    await this.printCallback();
  }
}
