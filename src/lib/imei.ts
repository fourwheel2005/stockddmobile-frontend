/** IMEI มาตรฐาน = เลขล้วน 15 หลัก (FIX-211) */
export const IMEI_LENGTH = 15;

/** เหลือเฉพาะตัวเลข ไม่เกิน 15 หลัก — ใช้ตอนพิมพ์/วาง/ยิงสแกน */
export const cleanImei = (value: string): string => value.replace(/\D/g, '').slice(0, IMEI_LENGTH);

/** จำนวนหลักที่กรอกแล้ว (นับเฉพาะตัวเลข) */
export const imeiDigits = (value: string | null | undefined): number => (value ?? '').replace(/\D/g, '').length;

/**
 * IMEI ใช้ได้ไหม — ว่าง = ได้ (ช่องไม่บังคับ) · ต้องเป็นเลขล้วนครบ 15 หลัก
 * @returns ข้อความผิด หรือ null ถ้าใช้ได้
 */
export function imeiProblem(value: string | null | undefined, label = 'IMEI'): string | null {
  const v = (value ?? '').trim();
  if (v === '') return null;
  if (!/^\d+$/.test(v)) return `${label} ต้องเป็นตัวเลขล้วน (${v})`;
  if (v.length !== IMEI_LENGTH) return `${label} ต้องมี ${IMEI_LENGTH} หลัก (ตอนนี้ ${v.length}/${IMEI_LENGTH})`;
  return null;
}
