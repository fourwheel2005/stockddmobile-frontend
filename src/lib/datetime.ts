/**
 * Boundary เดียวสำหรับแปลง "เวลาจาก API" → "เวลาที่มนุษย์อ่าน"
 *
 * Backend เก็บและคำนวณเป็น UTC เสมอ แต่ payload บาง endpoint ยังเป็น
 * `LocalDateTime` ที่ serialize ออกมาแบบไม่มี offset (เช่น "2026-07-22T03:35:12")
 * ซึ่ง `new Date(...)` ของ JS จะตีความว่าเป็นเวลา "ของเครื่อง" ตาม ECMA-262
 * ทำให้ใบเสร็จพิมพ์ 03:35 แทนที่จะเป็น 10:35 (FIX-098)
 *
 * กติกา:
 *  1. string ที่ไม่มี offset → ถือว่าเป็น UTC (เติม `Z`)
 *  2. การแสดงผลทุกจุดผูกกับโซนเวลาของร้าน ไม่ผูกกับนาฬิกาเครื่อง POS
 *     (เครื่องพิมพ์/แท็บเล็ตหน้าร้านตั้งโซนผิดได้ แต่ใบเสร็จต้องถูกเสมอ)
 */

/** โซนเวลาของร้าน — ใบเสร็จ/รายงานทุกใบอ้างอิงโซนนี้ ไม่ใช่โซนของอุปกรณ์ */
export const SHOP_TIME_ZONE = 'Asia/Bangkok';

/** ISO ที่ระบุโซนแล้ว: ลงท้ายด้วย Z หรือมี ±hh:mm หลังส่วนเวลา */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
/** วันที่ล้วน (LocalDate จาก backend) เช่น "2026-07-22" */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * แปลง timestamp จาก API เป็น Date โดยไม่กำกวม
 * @returns null ถ้า input ว่างหรือ parse ไม่ได้ (caller ตัดสินใจว่าจะโชว์อะไร)
 */
export function parseServerDateTime(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const raw = iso.trim();
  if (!raw) return null;

  // วันที่ล้วนปล่อยให้ JS parse เป็น UTC midnight ตาม spec แล้วค่อย format ตามโซนร้าน
  const normalized = DATE_ONLY.test(raw) || HAS_ZONE.test(raw) ? raw : `${raw}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function partsInShopZone(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** `dd/MM/yyyy HH:mm` ตามโซนร้าน — รูปแบบที่ใช้บนใบเสร็จความร้อน */
export function formatShopDateTimeCompact(iso: string | null | undefined): string {
  const d = parseServerDateTime(iso);
  if (!d) return '-';
  const p = partsInShopZone(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** `YYYY-MM-DD` ตามโซนร้าน — ใช้จับกลุ่ม/เทียบ "วันทำการ" ไม่ใช่วันของเครื่อง */
export function shopDayKey(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : parseServerDateTime(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  // en-CA ให้รูปแบบ ISO (YYYY-MM-DD) เป็น calendar เกรกอเรียนเสมอ
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * "วันนี้" ของร้าน แบบ `YYYY-MM-DD`
 * ห้ามใช้ `new Date().toISOString().slice(0,10)` แทน — นั่นคือวันที่ UTC
 * ซึ่งจะย้อนไป 1 วันทุกครั้งที่เปิดใช้ก่อน 07:00 น. ตามเวลาไทย
 */
export function shopToday(): string {
  return shopDayKey(new Date());
}

/** format อิสระตามโซนร้าน — ใช้เมื่อต้องการ locale/ตัวเลือกเฉพาะหน้าจอ */
export function formatInShopZone(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = 'th-TH',
): string {
  const d = parseServerDateTime(iso);
  if (!d) return '-';
  return new Intl.DateTimeFormat(locale, { timeZone: SHOP_TIME_ZONE, ...options }).format(d);
}
