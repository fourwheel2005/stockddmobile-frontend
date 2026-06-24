/**
 * ตัวเลือกรายเครื่อง (ประกัน/สี/ความจุ) — ใช้ร่วมกันระหว่าง
 * หน้ารับสต๊อก (ProductRegisterPage) และ modal "เพิ่มสี/เครื่อง" (ProductDetailPage)
 * เพื่อให้ฟอร์ม "ครบเหมือนกัน" และเพิ่ม option ที่เดียว (กัน drift).
 */

export const WARRANTY_NEW = 'ประกันศูนย์ 1 ปี (Apple)';
export const WARRANTY_APPLE_ACTIVATED = 'ประกัน Apple (activate แล้ว)';
export const WARRANTY_OPTIONS = [
  WARRANTY_NEW,
  WARRANTY_APPLE_ACTIVATED,
  'ประกันร้าน 7 วัน',
  'ประกันร้าน 1 เดือน',
  'ประกันร้าน 3 เดือน',
  'ประกันร้าน 6 เดือน',
  'ไม่มีประกัน',
];

export const COLOR_OPTIONS = [
  'Black', 'White', 'Blue', 'Pink', 'Yellow', 'Green', 'Red', 'Purple',
  'Natural Titanium', 'Blue Titanium', 'Black Titanium', 'White Titanium', 'Desert Titanium',
];

export const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];

/** ต้องกรอกวันหมดประกันไหม — ประกัน Apple ที่ activate แล้ว นับจากวัน activate */
export const warrantyNeedsExpire = (terms: string) =>
  terms === WARRANTY_APPLE_ACTIVATED || /activate/i.test(terms);
