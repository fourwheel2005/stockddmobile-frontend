/**
 * ช่องค้นหาที่ใช้กับเครื่องยิงบาร์โค้ด (FIX-218) — กัน "เลขเบิ้ล" เช่น DD00451DD00451
 *
 * เครื่องยิงแบบคีย์บอร์ดพิมพ์ตัวอักษรต่อท้ายข้อความเดิมในช่อง ถ้าช่องยังค้างผลค้นหาก่อนหน้า
 * เลขใหม่จะไปต่อท้ายเลขเก่า → ค้นไม่เจอ · ตัวอักษรจากเครื่องยิงมาถี่มาก (ไม่กี่ ms ต่อตัว)
 * ส่วนคนพิมพ์ห่างกันเป็นร้อย ms → ถ้าเจอชุดตัวอักษรถี่ ๆ เริ่มต่อจากคำค้นที่ค้นไปแล้ว = ยิงใหม่ → แทนที่ของเดิม
 */

/** ช่วงห่างระหว่างตัวอักษรที่ถือว่า "ยิงต่อเนื่อง" */
export const SCAN_KEY_GAP_MS = 35;
/** ต้องมาถี่ติดกันอย่างน้อยกี่ตัวถึงจะถือว่าเป็นการยิง (กันคนพิมพ์เร็ว 2-3 ตัว) */
export const SCAN_MIN_CHARS = 4;

export interface ScanBurst {
  /** ข้อความในช่องก่อนชุดนี้เริ่ม */
  base: string;
  /** จำนวน input ที่มาถี่ต่อเนื่องในชุดนี้ */
  count: number;
}

/** อัปเดตชุดตัวอักษร: ห่างจากตัวก่อนเกินเกณฑ์ = เริ่มชุดใหม่ (base = ข้อความก่อนพิมพ์ตัวนี้) */
export function nextBurst(prev: ScanBurst | null, gapMs: number, textBefore: string): ScanBurst {
  if (!prev || gapMs > SCAN_KEY_GAP_MS) return { base: textBefore, count: 1 };
  return { base: prev.base, count: prev.count + 1 };
}

/**
 * ข้อความที่ควรอยู่ในช่องหลัง input นี้
 * ยิงต่อท้ายคำค้นที่ค้นไปแล้ว (committed) → ตัดของเก่าออก เหลือเฉพาะเลขที่ยิงใหม่
 */
export function scanReplace(next: string, burst: ScanBurst | null, committed: string): string {
  if (!burst || burst.count < SCAN_MIN_CHARS) return next;
  const base = burst.base;
  if (!base.trim() || base !== committed) return next;
  if (!next.startsWith(base) || next.length <= base.length) return next;
  return next.slice(base.length);
}
