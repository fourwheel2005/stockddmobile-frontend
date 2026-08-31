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
