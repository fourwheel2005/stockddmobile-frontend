import { encodeCp874 } from '@/lib/escpos/cp874';
import { formatTHB } from '@/lib/format';
import type { SerializedItemResponse } from '@/types/api';

/**
 * ป้ายสติกเกอร์เครื่อง สำหรับ TSC TTP-247 (ภาษา TSPL, 203dpi = 8 dots/mm) — FIX-149.
 * แยกจาก buildDeviceLabel (ESC/POS 80mm ของ Epson): เครื่อง label คนละภาษาคำสั่งกัน
 *
 * ฟอนต์ไทย: "TST24.BF2" (bitmap ไทย TIS-620 ที่ฝังในเครื่อง TSC) + CODEPAGE 874 —
 * ข้อความในคำสั่ง TEXT encode เป็น CP874 bytes · ASCII ล้วนใช้ฟอนต์เดียวกันได้
 *
 * ขนาด label ตั้งได้ผ่าน localStorage 'ddmobile.label.size' รูปแบบ "กว้างxสูง" มม. (default 50x30)
 */

const DOTS_PER_MM = 8; // TTP-247 = 203 dpi

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'รีเฟอร์บิช', DEFECTIVE: 'มีตำหนิ',
};

export function getLabelSizeMm(): { w: number; h: number } {
  const raw = typeof window !== 'undefined'
    ? localStorage.getItem('ddmobile.label.size') : null;
  const m = raw?.match(/^(\d{2,3})\s*[xX×]\s*(\d{2,3})$/);
  if (m) return { w: Number(m[1]), h: Number(m[2]) };
  return { w: 50, h: 30 };
}

/** ประกอบคำสั่ง TSPL หลายบรรทัด — คำสั่งเป็น ASCII · ข้อความในเครื่องหมายคำพูด encode CP874 (ไทยได้) */
class TsplBuilder {
  private parts: Uint8Array[] = [];

  raw(cmd: string) {
    this.parts.push(encodeCp874(cmd + '\r\n'));
    return this;
  }

  /** TEXT x,y,"font",rotation,xMul,yMul,"data" — escape เครื่องหมายคำพูดในข้อความ */
  text(x: number, y: number, font: string, xMul: number, yMul: number, data: string) {
    const safe = data.replace(/"/g, "'");
    return this.raw(`TEXT ${x},${y},"${font}",0,${xMul},${yMul},"${safe}"`);
  }

  build(): Uint8Array {
    const total = this.parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of this.parts) { out.set(p, pos); pos += p.length; }
    return out;
  }
}

export function buildDeviceLabelTspl(s: SerializedItemResponse, url: string): Uint8Array {
  const { w, h } = getLabelSizeMm();
  const W = w * DOTS_PER_MM;   // เช่น 50mm → 400 dots
  const H = h * DOTS_PER_MM;
  const M = 8;                 // margin ซ้าย (dots)

  const spec = [s.deviceColor, s.deviceStorage].filter(Boolean).join(' / ');
  const condTh = CONDITION_TH[s.condition] ?? s.condition;
  const line2 = [spec, condTh,
    s.condition !== 'NEW' && s.batteryHealth != null ? `แบต ${s.batteryHealth}%` : '',
  ].filter(Boolean).join(' · ');
  // Code128 (ปืนยิงในร้าน) — รับ ASCII เท่านั้น
  const scanCode = (s.stockCode || s.imei || s.serialNumber || '').replace(/[^\x20-\x7e]/g, '');
  const price = s.sellingPrice != null ? formatTHB(s.sellingPrice) : '';

  // พื้นที่ QR ด้านขวา — ขนาดตามความสูง label
  const qrCell = h >= 40 ? 5 : 4;                    // cell size (dots/module)
  const qrX = W - (qrCell * 25) - M;                 // เผื่อ ~25 modules
  const textW = qrX - M - 8;                         // กันข้อความชน QR (ประมาณ)
  void textW;

  const b = new TsplBuilder();
  b.raw(`SIZE ${w} mm,${h} mm`);
  b.raw('GAP 3 mm,0');          // ม้วนมาตรฐานช่องว่างระหว่างดวง 3mm — ปรับตามม้วนจริงได้
  b.raw('DIRECTION 1');
  b.raw('CODEPAGE 874');        // ไทย TIS-620/CP874 คู่กับฟอนต์ TST24.BF2
  b.raw('CLS');

  // ── ข้อความ (ซ้าย) ──
  b.text(M, 8, 'TST24.BF2', 1, 1, (s.productName ?? s.sku).slice(0, 26));
  if (line2) b.text(M, 40, 'TST24.BF2', 1, 1, line2.slice(0, 28));
  if (s.stockCode) b.text(M, 72, 'TST24.BF2', 2, 1, s.stockCode);
  if (price) b.text(M, 104, 'TST24.BF2', 1, 1, price);

  // ── QR (ขวา) — ลิงก์หน้าสินค้าเว็บลูกค้า ──
  b.raw(`QRCODE ${qrX},8,L,${qrCell},A,0,"${url.replace(/"/g, '')}"`);

  // ── Code128 (ล่าง) — รหัสเครื่องให้ปืนสแกน ──
  if (scanCode) {
    const bcY = H - 58;
    b.raw(`BARCODE ${M},${bcY},"128",44,1,0,2,4,"${scanCode}"`);
  }

  b.raw('PRINT 1,1');
  return b.build();
}
