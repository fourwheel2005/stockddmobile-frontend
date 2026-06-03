import { describe, it, expect } from 'vitest';
import { encodeCp874, thaiDisplayWidth } from '../cp874';

describe('CP874 encoder', () => {
  it('encodes ASCII passthrough', () => {
    const bytes = encodeCp874('Hello123');
    expect(Array.from(bytes)).toEqual([
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x31, 0x32, 0x33,
    ]);
  });

  it('encodes Thai consonants ก-ฮ', () => {
    // ก (U+0E01) → 0xA1
    expect(encodeCp874('ก')[0]).toBe(0xa1);
    // ข (U+0E02) → 0xA2
    expect(encodeCp874('ข')[0]).toBe(0xa2);
    // ฮ (U+0E2E) → 0xCE
    expect(encodeCp874('ฮ')[0]).toBe(0xce);
  });

  it('encodes Thai vowels + tone marks', () => {
    // CP874 formula: byte = unicode - 0x0D60
    expect(encodeCp874('ะ')[0]).toBe(0xd0); // U+0E30
    expect(encodeCp874('า')[0]).toBe(0xd2); // U+0E32
    expect(encodeCp874('ิ')[0]).toBe(0xd4); // U+0E34
    expect(encodeCp874('่')[0]).toBe(0xe8); // U+0E48
  });

  it('encodes Thai baht symbol ฿', () => {
    expect(encodeCp874('฿')[0]).toBe(0xdf); // U+0E3F
  });

  it('encodes mixed Thai + ASCII', () => {
    const bytes = encodeCp874('iPhone15Pro');
    expect(bytes.length).toBe(11); // pure ASCII
  });

  it('strips emoji (replaces with ?)', () => {
    const bytes = encodeCp874('hi😀ok');
    // emoji = surrogate pair (2 chars) → skipped
    // result: 'h', 'i', 'o', 'k'
    expect(bytes.length).toBe(4);
    expect(String.fromCharCode(...bytes)).toBe('hiok');
  });

  it('keeps newline + tab', () => {
    const bytes = encodeCp874('a\nb\tc');
    expect(Array.from(bytes)).toEqual([0x61, 0x0a, 0x62, 0x09, 0x63]);
  });

  it('falls back to ? for unsupported chars', () => {
    const bytes = encodeCp874('日本語');
    // CJK not in CP874 → '?'
    expect(Array.from(bytes)).toEqual([0x3f, 0x3f, 0x3f]);
  });
});

describe('thaiDisplayWidth', () => {
  it('counts ASCII chars normally', () => {
    expect(thaiDisplayWidth('Hello')).toBe(5);
  });

  it('counts Thai consonants normally', () => {
    expect(thaiDisplayWidth('กขฮ')).toBe(3);
  });

  it('skips zero-width Thai marks', () => {
    // ก่า = ก + ่ (zero-width) + า → width 2
    expect(thaiDisplayWidth('ก่า')).toBe(2);
    // ก็ = ก + ็ → width 1
    expect(thaiDisplayWidth('ก็')).toBe(1);
  });

  it('skips emoji', () => {
    expect(thaiDisplayWidth('a😀b')).toBe(2);
  });

  it('mixed Thai + ASCII', () => {
    // iPhone ก่า → 6 + 2 = 8 (i,P,h,o,n,e,ก,า)
    expect(thaiDisplayWidth('iPhone ก่า')).toBe(9); // 6 + space + 2
  });
});
