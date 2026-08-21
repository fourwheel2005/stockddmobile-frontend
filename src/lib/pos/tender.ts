/**
 * เงินทอน (FIX-156) — คณิตแบบ "สตางค์จำนวนเต็ม" ล้วน กัน float noise ทุกรูปแบบ
 * (บทเรียน FIX-151: 599.9899999999998 ชน @Digits(fraction=2) → ปิดบิลไม่ได้)
 *
 * FE เป็นแค่เครื่องคิดเลขโชว์ผล — backend (ChangeCalculator) คำนวณ/บันทึกจริงเสมอ
 */

/** แปลงบาท (float/สตริง) → สตางค์จำนวนเต็ม — ปัด HALF_UP 2 ตำแหน่ง */
export function toSatang(baht: number): number {
  if (!Number.isFinite(baht)) return 0;
  return Math.round(baht * 100);
}

/** ปัดจำนวนเงินเป็น 2 ตำแหน่ง (ค่าที่ปลอดภัยต่อการส่ง API) */
export function round2(baht: number): number {
  return toSatang(baht) / 100;
}

/**
 * เงินทอน (บาท, 2 ตำแหน่ง) — null เมื่อยังไม่ควรแสดง (ไม่ได้กรอก/ยอดสดเป็น 0)
 * ติดลบ = ยังขาด (caller ใช้บล็อกปิดบิล)
 */
export function changeFromTender(tenderedText: string, cashDueBaht: number): number | null {
  const trimmed = tenderedText.trim();
  if (trimmed === '') return null;
  const tendered = Number(trimmed);
  if (!Number.isFinite(tendered) || tendered < 0) return null;
  const dueSatang = toSatang(cashDueBaht);
  if (dueSatang <= 0) return null;
  return (toSatang(tendered) - dueSatang) / 100;
}

/**
 * ปุ่มลัดแบงค์แบบฉลาด — เสนอ "แบงค์ถัดไป" จากยอดจริง (ไม่รวมปุ่ม "พอดี" — caller ใส่เอง)
 * เช่น ยอด 790 → [800, 1000, 2000] · ยอด 24,500 → [25,000, 30,000]
 */
export function suggestTenders(cashDueBaht: number): number[] {
  const due = toSatang(cashDueBaht);
  if (due <= 0) return [];
  // ปัดขึ้นแบบ "ต้องเกินยอดเสมอ" (พอดีมีปุ่มแยก) ตามแบงค์ที่คนยื่นจริง 100/500/1000
  const ceilStrict = (step: number) => {
    const rounded = Math.ceil(due / step) * step;
    return rounded > due ? rounded : rounded + step;
  };
  const out: number[] = [];
  for (const step of [100_00, 500_00, 1000_00]) {
    const c = ceilStrict(step);
    if (!out.includes(c)) out.push(c);
  }
  // ยอดใหญ่ (≥5,000) เพิ่มระดับหมื่น (ลูกค้ายื่นปึกพัน) — ยอดเล็กไม่เสนอเลขเวอร์
  if (due >= 5000_00) {
    const c = ceilStrict(10000_00);
    if (!out.includes(c)) out.push(c);
  }
  // ยังไม่ครบ 3 ตัวเลือก (ยอดเล็กชนกันหมด) → ไล่บวกทีละ 1,000
  while (out.length < 3) out.push(out[out.length - 1] + 1000_00);
  return out.slice(0, 3).map((s) => s / 100);
}
