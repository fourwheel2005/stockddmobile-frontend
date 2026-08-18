import { afterEach, describe, expect, it, vi } from 'vitest';
import { printAndConfirmReceipt } from '../browserPrintConfirmation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('printAndConfirmReceipt', () => {
  it('returns only after the user confirms physical output', () => {
    const print = vi.fn();
    vi.stubGlobal('window', { print, confirm: vi.fn(() => true) });

    expect(() => printAndConfirmReceipt()).not.toThrow();
    expect(print).toHaveBeenCalledOnce();
  });

  it('fails the print job when physical output is not confirmed', () => {
    vi.stubGlobal('window', { print: vi.fn(), confirm: vi.fn(() => false) });

    expect(() => printAndConfirmReceipt())
      .toThrow('ผู้ใช้ยังไม่ยืนยันว่าใบเสร็จพิมพ์ออกแล้ว');
  });
});
