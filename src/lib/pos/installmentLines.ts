import { hasRealImei } from '@/lib/escpos/ddmobileReceipt';

interface PayTodayDefaultInput {
  serialized: boolean;
  /** จาก backend (StockCountClassifier) — undefined = backend เก่าที่ยังไม่ส่ง flag */
  accessory?: boolean | null;
  imei?: string | null;
}

/**
 * บิลผ่อน: บรรทัดนี้ควร default เป็น "จ่ายวันนี้" (ไม่รวมยอดผ่อน) หรือไม่ — FIX-198.
 *
 *  - นับจำนวน (bulk) = อุปกรณ์เสริม → จ่ายวันนี้เสมอ
 *  - มี Serial → ยึด flag "อุปกรณ์เสริม" จากหมวดสินค้า (iPad WiFi / Apple Watch ไม่มี IMEI แต่เป็นเครื่องที่ผ่อน)
 *  - backend เก่าไม่ส่ง flag → fallback เดิม (FIX-096): ไม่มี IMEI จริง = อุปกรณ์เสริม
 * พนักงานยังกดสลับต่อบรรทัดได้เหมือนเดิม
 */
export function defaultPayToday(input: PayTodayDefaultInput): boolean {
  if (!input.serialized) return true;
  if (typeof input.accessory === 'boolean') return input.accessory;
  return !hasRealImei(input.imei);
}
