import { describe, expect, it } from 'vitest';
import { barsBitmap, code128Modules } from '../code128Bitmap';

const START_B = '11010010000';
const STOP = '1100011101011';

function isBlack(image: { data: Uint8Array; wBytes: number }, x: number, y: number): boolean {
  return (image.data[y * image.wBytes + (x >> 3)] & (0x80 >> (x & 7))) === 0;
}

describe('code128 bars', () => {
  it('encodes a stock code as a valid Code128 symbol', () => {
    const modules = code128Modules('DD00004')!;
    expect(modules.startsWith(START_B)).toBe(true);
    expect(modules.endsWith(STOP)).toBe(true);
    expect(modules).toHaveLength(101);
  });

  it('encodes a 15-digit IMEI and rejects an empty code', () => {
    expect(code128Modules('356789012345678')).toHaveLength(134);
    expect(code128Modules('')).toBeNull();
  });

  it('draws every module exactly two dots wide so the printed width is known', () => {
    const modules = code128Modules('DD00004')!;
    const image = barsBitmap(modules, 2, 80);
    expect(image).toMatchObject({ wBytes: 26, h: 80 });
    for (const y of [0, 79]) {
      for (let index = 0; index < modules.length; index++) {
        const black = modules[index] === '1';
        expect(isBlack(image, index * 2, y)).toBe(black);
        expect(isBlack(image, index * 2 + 1, y)).toBe(black);
      }
      // ส่วนเกินของ byte สุดท้าย (จุดที่ 202–207) ต้องขาว ไม่ลากหมึกเกินความกว้างจริง
      for (let x = 202; x < 208; x++) expect(isBlack(image, x, y)).toBe(false);
    }
  });
});
