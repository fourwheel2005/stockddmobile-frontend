import JsBarcode from 'jsbarcode';
import type { BitmapImage } from './TsplBuilder';

/**
 * แถบ Code128 เป็นสตริง '1' (ดำ) / '0' (ขาว) ต่อ 1 module — เข้ารหัสฝั่งเราเอง (FIX-227)
 * เพื่อรู้ความกว้างจริงเป็น dot ก่อนพิมพ์ จึงจัดกึ่งกลางป้ายได้ตรงเป๊ะ
 * (คำสั่ง BARCODE ของเครื่องพิมพ์เลือก subset เอง → ความกว้างเดาไม่ได้ → จัดกลางไม่ได้)
 */
export function code128Modules(value: string): string | null {
  if (!value) return null;
  const target: { encodings?: Array<{ data: string }> } = {};
  try {
    JsBarcode(target, value, { format: 'CODE128' });
  } catch {
    return null;
  }
  const modules = target.encodings?.map((encoding) => encoding.data).join('') ?? '';
  return /^[01]+$/.test(modules) ? modules : null;
}

/** วาดแถบเป็น bitmap ขาวดำ: 1 module = moduleDots จุด, กว้างรวม = modules.length × moduleDots พอดี. */
export function barsBitmap(modules: string, moduleDots: number, height: number): BitmapImage {
  const width = modules.length * moduleDots;
  const wBytes = Math.ceil(width / 8);
  const row = new Uint8Array(wBytes).fill(0xff);
  for (let index = 0; index < modules.length; index++) {
    if (modules[index] !== '1') continue;
    for (let dot = 0; dot < moduleDots; dot++) {
      const x = index * moduleDots + dot;
      row[x >> 3] &= ~(0x80 >> (x & 7));
    }
  }
  const data = new Uint8Array(wBytes * height);
  for (let y = 0; y < height; y++) data.set(row, y * wBytes);
  return { data, wBytes, h: height };
}
