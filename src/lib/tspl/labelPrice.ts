import type { SerializedItemResponse, VariantResponse } from '@/types/api';

/**
 * ราคาบนสติ๊กเกอร์ (FIX-227):
 *  - เครื่อง (มือถือ/แท็บเล็ต/นาฬิกา ฯลฯ) → **ไม่พิมพ์ราคา** — เอาราคาดาวน์ออกจากป้ายติดหลังเครื่องแล้ว
 *  - อุปกรณ์เสริมแบบมี Serial → ยังพิมพ์ "ราคา ฿…" (ราคาขายเต็ม) เหมือนเดิม (FIX-161)
 */
const ACCESSORY_ROOT = 'อุปกรณ์เสริม';

export function isAccessoryLabelItem(item: SerializedItemResponse): boolean {
  return item.categoryRootName === ACCESSORY_ROOT;
}

function validPrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** ราคาขายของอุปกรณ์เสริม: ราคารายชิ้นก่อน ไม่มีจึงใช้ราคา SKU · null = ยังไม่ได้ตั้งราคา */
export function resolveAccessoryLabelPrice(
  item: SerializedItemResponse,
  variants: VariantResponse[],
): number | null {
  const variant = variants.find((candidate) => candidate.id === item.variantId);
  return validPrice(item.sellingPrice ?? variant?.sellingPrice);
}

export function formatLabelSellingPrice(value: number): string {
  return `ราคา ฿${new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value)}`;
}
