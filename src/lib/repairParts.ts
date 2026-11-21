import type { RepairPart, RepairPartGroup, RepairPartLine, RepairPartMovementType } from '@/types/api';

/** อะไหล่ซ่อม / ค่าแรง (FIX-235) — ฟังก์ชันคำนวณ/แสดงผลที่ใช้ร่วมกันหลายหน้า */

/** ราคาเปลี่ยนรวมที่บอกลูกค้า = ราคาอะไหล่ + ค่าแรง */
export function replacePriceOf(partPrice: number, laborPrice: number): number {
  return Math.round(((Number(partPrice) || 0) + (Number(laborPrice) || 0)) * 100) / 100;
}

/** กำไรต่อชิ้น = ราคาเปลี่ยนรวม − ต้นทุน */
export function profitOf(partPrice: number, laborPrice: number, cost: number): number {
  return Math.round((replacePriceOf(partPrice, laborPrice) - (Number(cost) || 0)) * 100) / 100;
}

export function partLabel(p: Pick<RepairPart, 'name' | 'grade'>): string {
  return p.grade ? `${p.name} (${p.grade})` : p.name;
}

export function stockStatus(qty: number): { text: string; cls: string } {
  if (qty <= 0) return { text: 'หมด · ต้องสั่ง', cls: 'badge-red' };
  if (qty <= 1) return { text: `เหลือ ${qty}`, cls: 'badge-amber' };
  return { text: `มี ${qty}`, cls: 'badge-green' };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * เดารุ่นจากชื่อเครื่องในใบงาน เช่น "iPhone 13 Pro" → หมวด "iPhone 13 Pro" (ไม่ใช่ "iPhone 13")
 * เลือกชื่อหมวดที่ยาวที่สุดที่อยู่ในชื่อเครื่อง · ไม่เจอ = null
 */
export function suggestGroupId(deviceText: string, groups: Pick<RepairPartGroup, 'id' | 'name' | 'general'>[]): string | null {
  const text = norm(deviceText);
  if (!text) return null;
  let best: { id: string; len: number } | null = null;
  for (const g of groups) {
    if (g.general) continue;
    const name = norm(g.name);
    if (!name) continue;
    const re = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    if (re.test(text) && (!best || name.length > best.len)) best = { id: g.id, len: name.length };
  }
  return best?.id ?? null;
}

/** ค้นในตาราง: ตรงชื่อรุ่น = ทั้งรุ่น · ไม่งั้นกรองชิ้นที่ชื่อ/เกรดตรง */
export function filterCatalog(groups: RepairPartGroup[], query: string): RepairPartGroup[] {
  const q = norm(query);
  if (!q) return groups;
  return groups.flatMap((g) => {
    if (norm(g.name).includes(q)) return [g];
    const parts = g.parts.filter((p) => norm(`${p.name} ${p.grade ?? ''}`).includes(q));
    return parts.length ? [{ ...g, parts }] : [];
  });
}

/** รวมราคาเปลี่ยนของรายการที่เลือกในใบงาน */
export function linesTotal(lines: RepairPartLine[], partsById: Map<string, Pick<RepairPart, 'replacePrice'>>): number {
  const sum = lines.reduce((acc, l) => acc + (partsById.get(l.partId)?.replacePrice ?? 0) * l.quantity, 0);
  return Math.round(sum * 100) / 100;
}

export const MOVEMENT_LABEL: Record<RepairPartMovementType, string> = {
  RECEIVE: 'รับเข้า',
  ADJUST: 'ปรับยอด',
  USE: 'ใช้ในงานซ่อม',
  RETURN: 'คืนจากงานซ่อม',
};

/** ตั้งจำนวนของชิ้นหนึ่งในรายการ — 0 = เอาออก · ชิ้นใหม่ต่อท้าย (คงลำดับที่เลือก) */
export function setLineQty(lines: RepairPartLine[], partId: string, qty: number): RepairPartLine[] {
  if (qty <= 0) return lines.filter((l) => l.partId !== partId);
  return lines.some((l) => l.partId === partId)
    ? lines.map((l) => (l.partId === partId ? { partId, quantity: qty } : l))
    : [...lines, { partId, quantity: qty }];
}

/**
 * FIX-237: ช่างกรอก "ยอดรวม" (ราคาเปลี่ยนที่บอกลูกค้า) แทนค่าแรง — ระบบคิดค่าแรงให้ = ยอดรวม − ราคาอะไหล่
 * คืน null ถ้ายอดรวมน้อยกว่าราคาอะไหล่ (ค่าแรงติดลบ = กรอกผิด)
 */
export function laborFromTotal(total: number, partPrice: number): number | null {
  const labor = Math.round(((Number(total) || 0) - (Number(partPrice) || 0)) * 100) / 100;
  return labor < 0 ? null : labor;
}

/** ตัวเลือกด่วนช่องรับประกัน — พิมพ์เองได้เสมอ */
export const WARRANTY_PRESETS = ['ไม่มีประกัน', '1 เดือน', '3 เดือน', '6 เดือน', '1 ปี', '2 ปี'];
