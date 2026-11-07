import { describe, expect, it } from 'vitest';
import { nextBurst, scanReplace, type ScanBurst } from '@/lib/scanInput';

/** จำลองการพิมพ์ทีละตัว: gaps[i] = ms ห่างจากตัวก่อน · คืนข้อความสุดท้ายในช่อง */
function type(start: string, committed: string, chars: string, gaps: number[]): string {
  let text = start;
  let burst: ScanBurst | null = null;
  [...chars].forEach((c, i) => {
    burst = nextBurst(burst, gaps[i] ?? gaps[gaps.length - 1], text);
    text = scanReplace(text + c, burst, committed);
  });
  return text;
}

describe('scan input (FIX-218 — เลขเบิ้ลในช่องค้นหา)', () => {
  it('a scanner firing over the last search replaces it instead of doubling', () => {
    expect(type('DD00451', 'DD00451', 'DD00451', [2000, 8])).toBe('DD00451');
    expect(type('DD00451', 'DD00451', '352556227710550', [5000, 5])).toBe('352556227710550');
  });

  it('a person typing slowly after a search keeps appending (refining the query)', () => {
    expect(type('iphone', 'iphone', ' 13', [1500, 180])).toBe('iphone 13');
  });

  it('scanning into an empty box or while still typing (not yet searched) is untouched', () => {
    expect(type('', '', 'DD00451', [3000, 8])).toBe('DD00451');
    expect(type('ipho', 'iph', 'ne', [10, 10])).toBe('iphone');
  });

  it('two or three fast keys are not mistaken for a scan', () => {
    expect(type('iphone', 'iphone', ' 1', [900, 20])).toBe('iphone 1');
  });
});
