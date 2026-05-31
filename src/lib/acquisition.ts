import type { AcquisitionType } from '@/types/api';

/** ป้ายไทย + คำอธิบายสำหรับ "ที่มาเครื่อง" (acquisition type) ใช้ร่วมทั้งระบบ. */
export const ACQ_INFO: Record<AcquisitionType, { th: string; help: string; group: 'TXN' | 'SUPPLIER' }> = {
  // ─── ประเภทธุรกรรม ─────────────────────────────────────────
  PURCHASE:   { th: 'ซื้อมา',         help: 'ซื้อเครื่องเข้าร้านปกติ',          group: 'TXN' },
  TRADE_IN:   { th: 'เทิร์น',         help: 'รับเทิร์นจากลูกค้า (มักเป็นมือ 2)', group: 'TXN' },
  OUTRIGHT:   { th: 'ซื้อขายขาด',     help: 'ซื้อขายขาด — ไม่รับคืน/เคลม',      group: 'TXN' },
  // ─── ซัพพลายเออร์ (nickname หน้าร้าน) ─────────────────────
  ICE:        { th: 'น้ำแข็ง',        help: 'รับจากซัพพลายเออร์ "น้ำแข็ง"',     group: 'SUPPLIER' },
  BORROW:     { th: 'ยืมมั้ย',        help: 'รับจาก "ยืมมั้ย"',                 group: 'SUPPLIER' },
  P_GREEN:    { th: 'พี่เขียว',       help: 'รับจาก "พี่เขียว"',                group: 'SUPPLIER' },
  GREETER:    { th: 'กรีทเตอร์',      help: 'รับจาก "กรีทเตอร์"',               group: 'SUPPLIER' },
  RED_HEAT:   { th: 'เรด ฮีท',        help: 'รับจาก "เรด ฮีท"',                 group: 'SUPPLIER' },
  AMP_MOBILE: { th: 'แอมป์ โมบาย',    help: 'รับจาก "แอมป์ โมบาย"',             group: 'SUPPLIER' },
};

/** ลำดับการแสดงผลใน dropdown — ธุรกรรมก่อน แล้วซัพพลายเออร์ */
export const ACQ_ORDER: AcquisitionType[] = [
  'PURCHASE', 'TRADE_IN', 'OUTRIGHT',
  'ICE', 'BORROW', 'P_GREEN', 'GREETER', 'RED_HEAT', 'AMP_MOBILE',
];

/** label ไทยสั้นๆ (เผื่อจุดที่ต้องการแค่ label) */
export const acqLabel = (t: AcquisitionType | null | undefined): string =>
  t ? ACQ_INFO[t]?.th ?? t : '-';
