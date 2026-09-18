/**
 * ตารางผ่อน (มือ 1 / มือ 2) แบบ "คอลัมน์ = จำนวนเดือน" — FIX-200
 *
 * เดิมล็อคคอลัมน์ไว้ [10,12,15,18] และมีดาวน์ค่าเดียวต่อแถว ทำให้ (1) ยืดงวดเป็น 20/24/36 เดือนไม่ได้
 * (2) ตั้งดาวน์ต่างกันตามจำนวนเดือนไม่ได้. helper นี้ทำให้คอลัมน์เดือนมาจาก "ค่าเริ่มต้น ∪ เดือนที่มีในข้อมูล ∪
 * เดือนที่ผู้ใช้เพิ่มเอง" และแต่ละช่องเก็บ ค่างวด + ดาวน์เฉพาะงวด (ไม่บังคับ · เว้น = ใช้ดาวน์หลักของแถว)
 *
 * JSON ที่เก็บ = รูปแบบเดิม [{"months":10,"monthly":1990,"down":2000}] (down ใส่เฉพาะช่องที่กรอก)
 * → backend/เว็บหน้าร้านที่อ่านแบบเดิมยังทำงาน (ข้าม down ได้) และตัวที่รองรับจะใช้ down รายงวด
 */

export const DEFAULT_MONTH_COLUMNS: readonly number[] = [10, 12, 15, 18];
export const MAX_INSTALLMENT_MONTHS = 60;

export interface TermCell {
  monthly: string;
  /** ดาวน์เฉพาะงวดนี้ — '' = ใช้ดาวน์หลักของแถว */
  down: string;
}

export type TermTable = Record<number, TermCell>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** JSON terms → ตาราง เดือน→{ค่างวด, ดาวน์} (ทน JSON เพี้ยน → ตารางว่าง) */
export function parseTermTable(json: string | null | undefined): TermTable {
  if (!json) return {};
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return {};
    const out: TermTable = {};
    for (const t of arr as { months?: unknown; monthly?: unknown; down?: unknown }[]) {
      const months = num(t?.months);
      const monthly = num(t?.monthly);
      if (months == null || months <= 0 || monthly == null) continue;
      const down = num(t?.down);
      out[months] = { monthly: String(monthly), down: down != null ? String(down) : '' };
    }
    return out;
  } catch { return {}; }
}

/**
 * ตาราง → JSON terms (เรียงตามเดือน · ข้ามช่องที่ค่างวดว่าง/≤0 · ใส่ down เฉพาะช่องที่กรอกและ ≥ 0)
 * คืน '[]' เมื่อไม่มีงวดที่ใช้ได้ (caller ใช้เช็ค "กรอกอย่างน้อย 1 ช่อง")
 */
export function buildTermTable(table: TermTable): string {
  const rows = Object.entries(table)
    .map(([m, cell]) => ({ months: Number(m), cell }))
    .filter(({ months, cell }) => months > 0 && String(cell?.monthly ?? '').trim() !== '' && Number(cell.monthly) > 0)
    .sort((a, b) => a.months - b.months)
    .map(({ months, cell }) => {
      const down = String(cell.down ?? '').trim() === '' ? null : Number(cell.down);
      return {
        months,
        monthly: Number(cell.monthly),
        ...(down != null && Number.isFinite(down) && down >= 0 ? { down } : {}),
      };
    });
  return JSON.stringify(rows);
}

/** คอลัมน์เดือนที่ต้องแสดง = ค่าเริ่มต้น ∪ เดือนที่มีข้อมูลในแถวใด ๆ ∪ เดือนที่ผู้ใช้เพิ่ม (เรียงน้อย→มาก) */
export function monthColumns(
  tables: Iterable<TermTable>,
  extraMonths: Iterable<number> = [],
  defaults: readonly number[] = DEFAULT_MONTH_COLUMNS,
): number[] {
  const set = new Set<number>(defaults);
  for (const t of tables) for (const m of Object.keys(t)) set.add(Number(m));
  for (const m of extraMonths) set.add(m);
  return [...set].filter((m) => Number.isInteger(m) && m > 0).sort((a, b) => a - b);
}

/** ตรวจเดือนที่ผู้ใช้พิมพ์เพื่อเพิ่มคอลัมน์ — คืน null พร้อมเหตุผลถ้าใช้ไม่ได้ */
export function validateNewMonth(raw: string, existing: readonly number[]): { months: number } | { error: string } {
  const m = Number(String(raw).trim());
  if (!Number.isInteger(m) || m <= 0) return { error: 'จำนวนเดือนต้องเป็นเลขจำนวนเต็มมากกว่า 0' };
  if (m > MAX_INSTALLMENT_MONTHS) return { error: `จำนวนเดือนสูงสุด ${MAX_INSTALLMENT_MONTHS} เดือน` };
  if (existing.includes(m)) return { error: `มีคอลัมน์ ${m} เดือนอยู่แล้ว` };
  return { months: m };
}
