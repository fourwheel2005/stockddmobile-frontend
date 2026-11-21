/**
 * รุ่น iPhone สำหรับ dropdown "เพิ่มรุ่น" ในตารางอะไหล่ซ่อม (FIX-236) — ใหม่ → เก่า แบ่งตามรุ่นปี
 * อัปเดตล่าสุด พ.ย. 2026: iPhone Duo (พับได้) + iPhone 18 Pro/Pro Max (ก.ย. 2026), iPhone 17e (มี.ค. 2026)
 * รุ่นใหม่ออก → เพิ่มบรรทัดบนสุด · ชื่อต้องตรงกับที่หน้าร้านพิมพ์ในใบงาน (ระบบเดารุ่นจากชื่อนี้)
 */
export const IPHONE_MODEL_SERIES: { series: string; models: string[] }[] = [
  { series: '2026', models: ['iPhone Duo', 'iPhone 18 Pro Max', 'iPhone 18 Pro', 'iPhone 17e'] },
  { series: '2025', models: ['iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone Air', 'iPhone 17', 'iPhone 16e'] },
  { series: '2024', models: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16'] },
  { series: '2023', models: ['iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15'] },
  { series: '2022', models: ['iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14', 'iPhone SE 3'] },
  { series: '2021', models: ['iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 mini'] },
  { series: '2020', models: ['iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 mini', 'iPhone SE 2'] },
  { series: '2019', models: ['iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11'] },
  { series: '2018', models: ['iPhone XS Max', 'iPhone XS', 'iPhone XR'] },
  { series: '2017', models: ['iPhone X', 'iPhone 8 Plus', 'iPhone 8'] },
  { series: '2016', models: ['iPhone 7 Plus', 'iPhone 7', 'iPhone SE'] },
  { series: '2015', models: ['iPhone 6s Plus', 'iPhone 6s'] },
  { series: '2014', models: ['iPhone 6 Plus', 'iPhone 6'] },
];

export const IPHONE_MODELS: string[] = IPHONE_MODEL_SERIES.flatMap((s) => s.models);

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** รุ่นนี้มีในตารางแล้วหรือยัง (ไม่สนตัวพิมพ์/ช่องว่าง — backend ก็กันชื่อซ้ำแบบเดียวกัน) */
export function hasModel(existingNames: string[], model: string): boolean {
  const k = key(model);
  return existingNames.some((n) => key(n) === k);
}
