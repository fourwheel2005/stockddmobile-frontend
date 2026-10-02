import type { Category, ProductDetail } from '@/types/api';

const ACCESSORY_MARKERS = [
  'อุปกรณ์เสริม',
  'หัวชาร์จ',
  'สายชาร์จ',
  'อะแดปเตอร์',
  'อแดปเตอร์',
  'เคส',
  'ฟิล์ม',
  'หูฟัง',
  'accessor',
  'charger',
  'adapter',
  'cable',
  'airpods',
  'earphone',
  'headphone',
];

const normalize = (value: string | null | undefined) =>
  (value ?? '').trim().toLocaleLowerCase('th-TH');

/**
 * Product API คืน category ปัจจุบันและ parent มาเพียงหนึ่งระดับเท่านั้น
 * จึงเช็คทั้ง parent “อุปกรณ์เสริม” และชื่อหมวด legacy ที่เคยสร้างเป็น root.
 */
export function isAccessoryCategory(category: Category): boolean {
  const labels = [normalize(category.name), normalize(category.parentName)];
  return labels.some((label) =>
    ACCESSORY_MARKERS.some((marker) => label.includes(marker)));
}

export function isAccessoryProduct(product: ProductDetail): boolean {
  return isAccessoryCategory(product.category);
}

/**
 * เครื่องที่ "ไม่มี IMEI" ใช้ Serial แทน (FIX-203) — ตอนนี้เฉพาะ iPad ตามที่ร้านกำหนด
 * (iPad WiFi ไม่มี IMEI · ฟอร์มรับเข้าปิดช่อง IMEI และบังคับ Serial) · เช็คจากชื่อหมวด/หมวดแม่/ชื่อรุ่น
 */
const IMEI_LESS_MARKERS = ['ipad'];

export function isImeiLessName(name: string | null | undefined): boolean {
  const n = normalize(name);
  return IMEI_LESS_MARKERS.some((marker) => n.includes(marker));
}

export function isImeiLessCategory(category: Category | null | undefined): boolean {
  if (!category) return false;
  return isImeiLessName(category.name) || isImeiLessName(category.parentName);
}

export function isImeiLessProduct(product: Pick<ProductDetail, 'name' | 'category'>): boolean {
  return isImeiLessCategory(product.category) || isImeiLessName(product.name);
}
