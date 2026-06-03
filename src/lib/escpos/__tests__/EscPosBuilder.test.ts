import { describe, it, expect } from 'vitest';
import { EscPosBuilder } from '../EscPosBuilder';

describe('EscPosBuilder', () => {
  it('init() emits ESC @', () => {
    const bytes = new EscPosBuilder().init().build();
    expect(Array.from(bytes)).toEqual([0x1b, 0x40]);
  });

  it('codepage(21) emits ESC t 21 (Thai)', () => {
    const bytes = new EscPosBuilder().codepage(21).build();
    expect(Array.from(bytes)).toEqual([0x1b, 0x74, 21]);
  });

  it('align(C) emits ESC a 1', () => {
    const bytes = new EscPosBuilder().align('C').build();
    expect(Array.from(bytes)).toEqual([0x1b, 0x61, 1]);
  });

  it('align(L|C|R) maps correctly', () => {
    expect(new EscPosBuilder().align('L').build()[2]).toBe(0);
    expect(new EscPosBuilder().align('C').build()[2]).toBe(1);
    expect(new EscPosBuilder().align('R').build()[2]).toBe(2);
  });

  it('bold(true/false) emits ESC E 1/0', () => {
    expect(Array.from(new EscPosBuilder().bold(true).build())).toEqual([0x1b, 0x45, 1]);
    expect(Array.from(new EscPosBuilder().bold(false).build())).toEqual([0x1b, 0x45, 0]);
  });

  it('size(2,2) emits GS ! correct byte', () => {
    // ((2-1)<<4) | (2-1) = 0x11
    const bytes = new EscPosBuilder().size(2, 2).build();
    expect(Array.from(bytes)).toEqual([0x1d, 0x21, 0x11]);
  });

  it('cut(false) emits GS V 0 (full cut)', () => {
    const bytes = new EscPosBuilder().cut(false).build();
    expect(Array.from(bytes)).toEqual([0x1d, 0x56, 0]);
  });

  it('cut(true) emits GS V 1 (partial)', () => {
    const bytes = new EscPosBuilder().cut(true).build();
    expect(Array.from(bytes)).toEqual([0x1d, 0x56, 1]);
  });

  it('drawerKick(0) emits ESC p 0 25 250', () => {
    const bytes = new EscPosBuilder().drawerKick(0).build();
    expect(Array.from(bytes)).toEqual([0x1b, 0x70, 0, 25, 250]);
  });

  it('justify pads left + right with correct spacing', () => {
    // "abc" + spaces + "xyz" = 48 chars total
    const bytes = new EscPosBuilder().justify('abc', 'xyz', 10).build();
    // a b c (3) + 4 spaces + x y z (3) + newline = 11 bytes
    expect(bytes[3]).toBe(0x20); // first space
    expect(bytes[6]).toBe(0x20); // last space
    expect(bytes[10]).toBe(0x0a); // newline
  });

  it('newline(2) emits 2 LF', () => {
    const bytes = new EscPosBuilder().newline(2).build();
    expect(Array.from(bytes)).toEqual([0x0a, 0x0a]);
  });

  it('text() encodes Thai via CP874', () => {
    const bytes = new EscPosBuilder().text('ก').build();
    expect(bytes[0]).toBe(0xa1);
  });

  it('chaining produces correct sequence', () => {
    const bytes = new EscPosBuilder()
      .init()
      .codepage(21)
      .align('C')
      .text('hi')
      .feedAndCut(2)
      .build();
    expect(Array.from(bytes)).toEqual([
      0x1b, 0x40,       // init
      0x1b, 0x74, 21,   // codepage Thai
      0x1b, 0x61, 1,    // align center
      0x68, 0x69,       // 'hi'
      0x1b, 0x64, 2,    // feed 2 lines
      0x1d, 0x56, 0,    // cut full
    ]);
  });

  it('toBase64() produces valid Base64', () => {
    const b64 = new EscPosBuilder().init().toBase64();
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // Decode → original bytes
    const decoded = atob(b64);
    expect(decoded.charCodeAt(0)).toBe(0x1b);
    expect(decoded.charCodeAt(1)).toBe(0x40);
  });

  it('separator(=, 48) produces 48 = chars + newline', () => {
    const bytes = new EscPosBuilder().separator('=', 48).build();
    expect(bytes.length).toBe(49); // 48 + newline
    expect(bytes[0]).toBe(0x3d); // '='
    expect(bytes[48]).toBe(0x0a);
  });
});
