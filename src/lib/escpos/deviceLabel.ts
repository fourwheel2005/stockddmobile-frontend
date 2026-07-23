import { EscPosBuilder } from './EscPosBuilder';
import { formatTHB } from '@/lib/format';
import type { SerializedItemResponse } from '@/types/api';

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'รีเฟอร์บิช', DEFECTIVE: 'มีตำหนิ',
};

/**
 * ป้ายแปะหลังเครื่อง (thermal 80mm) — FIX-104.
 *  - QR = ลิงก์หน้าสินค้าบนเว็บลูกค้า → สแกนดูรายละเอียด/กดซื้อได้
 *  - Code128 = รหัสเครื่อง (stockCode/IMEI) → ปืนสแกนในร้านยิงเข้า POS เพื่อดูรายละเอียดได้
 *  - ข้อความ = รุ่น / สี / ความจุ / สภาพ / แบต / ราคา
 *
 * @param url ลิงก์เว็บลูกค้าของเครื่องนี้ (deviceProductUrl)
 */
export function buildDeviceLabel(s: SerializedItemResponse, url: string): Uint8Array {
  const spec = [s.deviceColor, s.deviceStorage].filter(Boolean).join(' / ');
  const condTh = CONDITION_TH[s.condition] ?? s.condition;
  // รหัสสำหรับ Code128 (ปืนสแกนในร้าน) — Code128 CODE B รับ ASCII เท่านั้น
  const scanCode = (s.stockCode || s.imei || s.serialNumber || '').replace(/[^\x20-\x7e]/g, '');

  const b = new EscPosBuilder().init().codepage(21).align('C');

  // ─── ชื่อรุ่น + สเปก ───
  b.bold(true).size(1, 1).textln(s.productName ?? s.sku).bold(false);
  if (spec || condTh) b.textln([spec, condTh].filter(Boolean).join(' · '));
  if (s.condition !== 'NEW' && s.batteryHealth != null) b.textln(`แบต ${s.batteryHealth}%`);
  if (s.stockCode) b.bold(true).textln(s.stockCode).bold(false);
  b.newline();

  // ─── QR ลิงก์เว็บ (สแกนดู/ซื้อ) ───
  b.qrcode(url, { size: 8, errorCorrection: 'M' });
  b.textln('สแกนดูรายละเอียด / สั่งซื้อ');
  b.newline();

  // ─── Code128 รหัสเครื่อง (ปืนสแกนในร้าน) ───
  if (scanCode) b.barcode(scanCode, 60).newline();

  // ─── ราคา ───
  if (s.sellingPrice != null) {
    b.bold(true).size(2, 1).textln(formatTHB(s.sellingPrice)).size(1, 1).bold(false);
  }

  return b.feedAndCut(3).build();
}
