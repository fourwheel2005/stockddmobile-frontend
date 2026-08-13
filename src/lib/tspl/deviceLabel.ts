import { encodeCp874 } from '@/lib/escpos/cp874';
import { formatTHB } from '@/lib/format';
import type { SerializedItemResponse } from '@/types/api';

/**
 * ป้ายสติกเกอร์เครื่อง สำหรับ TSC TTP-247 (ภาษา TSPL, 203dpi = 8 dots/mm) — FIX-149/153.
 *
 * FIX-153 (จากการพิมพ์จริงหน้างาน):
 *  - ข้อความทุกบรรทัด render เป็น BITMAP ฝั่งเว็บ (canvas) — ฟอนต์ไทย TST24.BF2 ไม่มีในเครื่องจริง
 *    ทำให้ TEXT หายทั้งป้าย · bitmap ใช้ฟอนต์ระบบ ชัวร์ทุกเครื่อง/ทุกภาษา
 *  - รองรับม้วนหลายดวงต่อแถว (2-up ฯลฯ) — วาดซ้ำทุกดวงในแถว (ไม่มีดวงเปล่าหลุด)
 *  - layout คำนวณตามขนาดดวงจริง (ดวงเตี้ย < 28mm ตัด barcode เหลือ QR + รหัส)
 *
 * ตั้งค่าผ่าน localStorage (มี UI ใน ตั้งค่าเครื่องพิมพ์):
 *  - ddmobile.label.size   = "กว้างxสูง" มม. ต่อดวง (default 35x25)
 *  - ddmobile.label.across = จำนวนดวงต่อแถว (default 2)
 *  - ddmobile.label.gapx   = ช่องว่างระหว่างดวงแนวนอน มม. (default 3)
 */

const DPMM = 8; // 203 dpi

export interface LabelConfig { w: number; h: number; across: number; gapX: number }

export function getLabelConfig(): LabelConfig {
  const ls = typeof window !== 'undefined' ? window.localStorage : null;
  const size = ls?.getItem('ddmobile.label.size') ?? '';
  const m = size.match(/^(\d{2,3})\s*[xX×]\s*(\d{2,3})$/);
  const across = Math.min(4, Math.max(1, Number(ls?.getItem('ddmobile.label.across')) || 2));
  const gapX = Math.min(10, Math.max(0, Number(ls?.getItem('ddmobile.label.gapx')) || 3));
  return m
    ? { w: Number(m[1]), h: Number(m[2]), across, gapX }
    : { w: 35, h: 25, across, gapX };
}

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'รีเฟอร์บิช', DEFECTIVE: 'มีตำหนิ',
};

/* ─── TSPL builder ที่รองรับ binary (BITMAP) ─────────────────────────── */
class TsplBuilder {
  private parts: Uint8Array[] = [];

  raw(cmd: string) {
    this.parts.push(encodeCp874(cmd + '\r\n'));
    return this;
  }

  /** BITMAP x,y,widthBytes,height,mode,binary-data — mode 0 = OVERWRITE · bit 0 = จุดดำ (สเปค TSPL) */
  bitmap(x: number, y: number, wBytes: number, h: number, data: Uint8Array) {
    this.parts.push(encodeCp874(`BITMAP ${x},${y},${wBytes},${h},0,`));
    this.parts.push(data);
    this.parts.push(encodeCp874('\r\n'));
    return this;
  }

  build(): Uint8Array {
    const total = this.parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of this.parts) { out.set(p, pos); pos += p.length; }
    return out;
  }
}

/* ─── render ข้อความ → 1-bit bitmap (TSPL: bit 1 = ขาว, 0 = ดำ) ───────── */
function textBitmap(text: string, px: number, bold: boolean, maxW: number):
    { data: Uint8Array; wBytes: number; h: number } | null {
  if (!text.trim() || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const font = `${bold ? '700' : '400'} ${px}px Tahoma, 'Leelawadee UI', sans-serif`;
  ctx.font = font;
  // ตัดข้อความให้พอดีความกว้าง (เติม … ถ้าเกิน)
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  if (t !== text) t = t.slice(0, -1) + '…';

  const w = Math.min(maxW, Math.ceil(ctx.measureText(t).width) + 2);
  const h = Math.ceil(px * 1.35);           // เผื่อหางสระ/วรรณยุกต์ไทย
  canvas.width = w;
  canvas.height = h;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.fillText(t, 0, Math.round(px * 0.1));

  const img = ctx.getImageData(0, 0, w, h).data;
  const wBytes = Math.ceil(w / 8);
  const out = new Uint8Array(wBytes * h).fill(0xff);   // เริ่มขาวล้วน
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // luminance ต่ำ = ดำ → เคลียร์บิต (TSPL: 0 = พิมพ์จุด)
      const lum = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      if (lum < 140) out[y * wBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { data: out, wBytes, h };
}

/* ─── สร้างป้าย ──────────────────────────────────────────────────────── */
export function buildDeviceLabelTspl(s: SerializedItemResponse, url: string): Uint8Array {
  const cfg = getLabelConfig();
  const W = cfg.w * DPMM;                       // dots ต่อดวง
  const H = cfg.h * DPMM;
  const strideX = (cfg.w + cfg.gapX) * DPMM;    // ระยะขยับต่อคอลัมน์
  const totalW = cfg.w * cfg.across + cfg.gapX * (cfg.across - 1);
  const M = 8;                                  // margin ในดวง (1mm)

  const spec = [s.deviceColor, s.deviceStorage].filter(Boolean).join('/');
  const condTh = CONDITION_TH[s.condition] ?? s.condition;
  const line2 = [spec, condTh,
    s.condition !== 'NEW' && s.batteryHealth != null ? `แบต${s.batteryHealth}%` : '',
  ].filter(Boolean).join(' ');
  const scanCode = (s.stockCode || s.imei || s.serialNumber || '').replace(/[^\x20-\x7e]/g, '');
  const price = s.sellingPrice != null ? formatTHB(s.sellingPrice) : '';

  // ── layout ต่อดวง (ปรับตามขนาดจริง) ──
  const qrCell = H >= 224 ? 3 : 2;              // ≥28mm ใช้ cell 3
  const qrArea = 30 * qrCell + 4;               // เผื่อ QR ~29 โมดูล (URL สั้น)
  const textW = W - M * 2 - qrArea;
  const hasBarcode = H >= 224 && scanCode !== ''; // ดวงเตี้ยไม่พอวาง barcode — QR ยังยิงดูรายละเอียดได้

  const namePx = H >= 224 ? 22 : 20;
  const subPx = 18;
  const codePx = H >= 224 ? 26 : 24;

  const b = new TsplBuilder();
  b.raw(`SIZE ${totalW} mm,${cfg.h} mm`);       // กว้าง = ทั้งแถว (ทุกดวงรวม gap)
  b.raw(`GAP ${cfg.gapX} mm,0`);
  b.raw('DIRECTION 1');
  b.raw('CLS');

  for (let col = 0; col < cfg.across; col++) {  // วาดซ้ำทุกดวงในแถว — ไม่มีดวงเปล่าหลุดม้วน
    const X = col * strideX;
    let y = M;

    // ข้อความ (bitmap — ไทยชัวร์ทุกเครื่อง)
    const name = textBitmap(s.productName ?? s.sku ?? '', namePx, true, textW);
    if (name) { b.bitmap(X + M, y, name.wBytes, name.h, name.data); y += name.h + 2; }
    const sub = textBitmap(line2, subPx, false, textW);
    if (sub) { b.bitmap(X + M, y, sub.wBytes, sub.h, sub.data); y += sub.h + 2; }
    const codeLine = [s.stockCode, price].filter(Boolean).join('  ');
    const code = textBitmap(codeLine, codePx, true, textW);
    if (code) { b.bitmap(X + M, y, code.wBytes, code.h, code.data); }

    // QR ขวาบน — ลิงก์หน้าสินค้าเว็บลูกค้า
    b.raw(`QRCODE ${X + W - qrArea - M},${M},L,${qrCell},A,0,"${url.replace(/"/g, '')}"`);

    // Code128 ล่าง (เฉพาะดวงสูงพอ) — ปืนยิงในร้าน
    if (hasBarcode) {
      b.raw(`BARCODE ${X + M},${H - 52},"128",34,1,0,2,3,"${scanCode}"`);
    }
  }

  b.raw('PRINT 1,1');
  return b.build();
}
