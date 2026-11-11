import { formatDate } from '@/lib/format';
import type { RepairTicket } from '@/types/api';

/** การรับประกันงานซ่อม (FIX-225) — นับจากวันที่ลูกค้ารับเครื่องคืน */
export type RepairWarranty = 'NONE' | 'M1' | 'M3' | 'M6' | 'Y1';

export const REPAIR_WARRANTY_OPTIONS: { value: RepairWarranty; label: string }[] = [
  { value: 'NONE', label: 'ไม่มีประกัน' },
  { value: 'M1', label: 'รับประกัน 1 เดือน' },
  { value: 'M3', label: 'รับประกัน 3 เดือน' },
  { value: 'M6', label: 'รับประกัน 6 เดือน' },
  { value: 'Y1', label: 'รับประกัน 1 ปี' },
];

export function repairWarrantyLabel(code: string | null | undefined): string | null {
  return REPAIR_WARRANTY_OPTIONS.find((o) => o.value === code)?.label ?? null;
}

/** ข้อความประกันบนใบ/รายการ — รับเครื่องแล้วบอกวันหมด · ยังไม่รับ = บอกว่าเริ่มนับวันรับเครื่อง */
export function repairWarrantyText(t: Pick<RepairTicket, 'warranty' | 'warrantyUntil' | 'pickedUpAt'>): string | null {
  const label = repairWarrantyLabel(t.warranty);
  if (!label) return null;
  if (t.warranty === 'NONE') return label;
  if (t.warrantyUntil) return `${label} (ถึง ${formatDate(t.warrantyUntil)})`;
  return `${label} (นับจากวันรับเครื่องคืน)`;
}
