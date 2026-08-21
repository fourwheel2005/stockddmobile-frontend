import { describe, expect, it } from 'vitest';
import { changeFromTender, round2, suggestTenders, toSatang } from '../tender';

describe('toSatang / round2 — เคสพิษ float', () => {
  it('0.1 + 0.2 → 30 สตางค์เป๊ะ', () => {
    expect(toSatang(0.1 + 0.2)).toBe(30);
  });
  it('599.9899999999998 (บั๊กจริง FIX-151) → 599.99', () => {
    expect(round2(599.9899999999998)).toBe(599.99);
  });
  it('24500.005 → ปัด HALF_UP → 24500.01', () => {
    expect(round2(24500.005)).toBe(24500.01);
  });
  it('กรอก 8 ตำแหน่ง 1000.12345678 → 1000.12', () => {
    expect(round2(1000.12345678)).toBe(1000.12);
  });
});

describe('changeFromTender', () => {
  it('ยอด 800 รับ 1000 → ทอน 200', () => {
    expect(changeFromTender('1000', 800)).toBe(200);
  });
  it('1000 − 999.99 → 0.01 เป๊ะ (ไม่ใช่ 0.009999...)', () => {
    expect(changeFromTender('1000', 999.99)).toBe(0.01);
  });
  it('รับพอดี → 0 · ขาด → ติดลบ (ใช้บล็อกปิดบิล)', () => {
    expect(changeFromTender('800', 800)).toBe(0);
    expect(changeFromTender('799', 800)).toBe(-1);
  });
  it('ไม่ได้กรอก/ยอดสดเป็น 0/ค่าขยะ → null (ไม่แสดง)', () => {
    expect(changeFromTender('', 800)).toBeNull();
    expect(changeFromTender('1000', 0)).toBeNull();
    expect(changeFromTender('abc', 800)).toBeNull();
    expect(changeFromTender('-5', 800)).toBeNull();
  });
});

describe('suggestTenders — ปุ่มแบงค์ถัดไป', () => {
  it('ยอด 790 → [800, 1000, 2000]', () => {
    expect(suggestTenders(790)).toEqual([800, 1000, 2000]);
  });
  it('ยอด 24,500 (หาร 100/500 ลงตัว) → เสนอเกินยอดเสมอ ไม่ซ้ำ', () => {
    expect(suggestTenders(24500)).toEqual([24600, 25000, 30000]);
  });
  it('ยอด 24,900 → [25000, 30000, 31000] ไม่มีตัวซ้ำ', () => {
    const s = suggestTenders(24900);
    expect(s).toEqual([25000, 30000, 31000]);
    expect(new Set(s).size).toBe(s.length);
    expect(s.every((v) => v > 24900)).toBe(true);
  });
  it('ยอด 0/ติดลบ → []', () => {
    expect(suggestTenders(0)).toEqual([]);
    expect(suggestTenders(-10)).toEqual([]);
  });
});
