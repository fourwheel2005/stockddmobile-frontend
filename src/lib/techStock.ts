/** แสดงผลหน้า "สต็อกเครื่อง" ของช่าง (FIX-234) — ไม่มีราคาใด ๆ */

/** สีแบตบนจอ (ช่วยช่างกวาดตา): ≥85 เขียว · 80–84 เหลือง · <80 แดง — แสดงผลอย่างเดียว ไม่กระทบข้อมูล */
export function batteryTone(health: number | null | undefined): 'good' | 'fair' | 'replace' | 'unknown' {
  if (health == null) return 'unknown';
  if (health >= 85) return 'good';
  if (health >= 80) return 'fair';
  return 'replace';
}

export function batteryText(health: number | null | undefined): string {
  return health == null ? '—' : `${health}%`;
}

/** อุปกรณ์ที่มากับเครื่อง — null = ไม่ได้บันทึก */
export function accessoriesText(hasBox: boolean | null | undefined, hasCharger: boolean | null | undefined): string {
  if (hasBox == null && hasCharger == null) return 'ไม่ระบุ';
  const parts = [hasBox ? 'มีกล่อง' : hasBox === false ? 'ไม่มีกล่อง' : null,
    hasCharger ? 'มีที่ชาร์จ' : hasCharger === false ? 'ไม่มีที่ชาร์จ' : null];
  return parts.filter(Boolean).join(' · ');
}
