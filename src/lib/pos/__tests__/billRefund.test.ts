import { describe, expect, it } from 'vitest';
import {
  billRefundOptions, buybackRequired, defaultRefund, defaultSelection, exchangeCreditCap, fullRefundBlockedReason,
  parseBuyback, refundCap, remainingQty, returnBadge, returnFormError, selectionValue, singleSelectedDevice,
} from '../billRefund';

const phone = (id: string, imei: string, extra: Record<string, unknown> = {}) => ({
  id, imei, serialNumber: `SN-${imei}`, custom: false, quantity: 1, sellPrice: 13900,
  serialItemId: `serial-${id}`, returnedQuantity: 0, ...extra,
});
const charger = (extra: Record<string, unknown> = {}) => ({
  id: 'acc', imei: null, serialNumber: null, custom: false, quantity: 2, sellPrice: 250, returnedQuantity: 0, ...extra,
});

const paid = {
  status: 'PAID' as const, paymentMethod: 'CASH' as const, taxInvoiceNo: null,
  tradeInValue: null, depositAppliedAmount: null, depositNo: null,
  cashAmount: 13900, transferAmount: 0, cardAmount: 0, qrAmount: 0,
  items: [phone('a', '350596482527747')],
};

describe('billRefundOptions (FIX-228 → FIX-230)', () => {
  it('cash bill: cancel, return items or exchange', () => {
    expect(billRefundOptions(paid).map((o) => [o.action, o.label, o.blockedReason])).toEqual([
      ['REFUND', 'ยกเลิกบิล', null],
      ['RETURN_ITEMS', 'รับคืนสินค้า', null],
      ['EXCHANGE', 'เปลี่ยนเครื่อง', null],
    ]);
  });

  it('accessory-only bills can be returned too (ข้อ 3)', () => {
    const acc = { ...paid, items: [charger()] };
    expect(billRefundOptions(acc).map((o) => o.action)).toEqual(['REFUND', 'RETURN_ITEMS', 'EXCHANGE']);
  });

  it('installment bill labels the return as "ผ่อนไม่ไหว"', () => {
    const opts = billRefundOptions({ ...paid, paymentMethod: 'INSTALLMENT' });
    expect(opts.find((o) => o.action === 'RETURN_ITEMS')?.label).toBe('รับเครื่องคืน (ผ่อนไม่ไหว)');
  });

  it('tax-invoiced bill: cancel via credit note, sell-back still allowed, no exchange (FIX-232)', () => {
    const opts = billRefundOptions({ ...paid, taxInvoiceNo: 'TIV-1' });
    expect(opts.map((o) => [o.action, o.label])).toEqual([
      ['CREDIT_NOTE', 'ใบลดหนี้ (ยกเลิกบิล)'], ['RETURN_ITEMS', 'รับคืนสินค้า']]);
    // บิลผ่อนมีใบกำกับ: รับเครื่องคืนจะตัดยอดผ่อน → ต้องใบลดหนี้เท่านั้น
    expect(billRefundOptions({ ...paid, paymentMethod: 'INSTALLMENT', taxInvoiceNo: 'TIV-2' }).map((o) => o.action))
      .toEqual(['CREDIT_NOTE']);
  });

  it('refunded bills or bills with nothing left show nothing to return (FIX-231: fully returned stays PAID)', () => {
    expect(billRefundOptions({ ...paid, status: 'REFUNDED' })).toEqual([]);
    const allBack = { ...paid, items: [phone('a', '1', { returnedQuantity: 1 })] };
    expect(billRefundOptions(allBack)).toEqual([]);
  });

  it('badges a PAID bill whose items came back (FIX-231)', () => {
    expect(returnBadge(paid)).toBeNull();
    expect(returnBadge({ ...paid, items: [phone('a', '1', { returnedQuantity: 1 })] })).toBe('รับคืนครบแล้ว');
    expect(returnBadge({ ...paid, items: [phone('a', '1', { returnedQuantity: 1 }), charger()] })).toBe('รับคืนบางรายการ');
    expect(returnBadge({ ...paid, status: 'REFUNDED', items: [phone('a', '1', { returnedQuantity: 1 })] })).toBeNull();
  });

  it('blocked-cancel hints never promise money back from a return (FIX-231)', () => {
    for (const o of [{ ...paid, tradeInValue: 4000 }, { ...paid, depositAppliedAmount: 4000, depositNo: 'DP-1' },
      { ...paid, exchangeCreditAmount: 13900, exchangeFromBillNo: 'INV-OLD' }]) {
      expect(fullRefundBlockedReason(o)).toContain('ไม่มีเงินออกเก๊ะ');
      expect(fullRefundBlockedReason(o)).not.toMatch(/คืนได้รวม|คืนเงินได้ถึง/);
    }
  });

  it('explains why a whole-bill cancel is blocked before asking for the shop code', () => {
    expect(fullRefundBlockedReason({ ...paid, tradeInValue: 4000 })).toContain('เทิร์น');
    expect(fullRefundBlockedReason({ ...paid, depositAppliedAmount: 4000, depositNo: 'DP-1' })).toContain('DP-1');
    expect(fullRefundBlockedReason({ ...paid, returnedAmount: 500 })).toContain('รับคืนบางรายการไปแล้ว');
    expect(fullRefundBlockedReason({ ...paid, exchangeCreditAmount: 13900, exchangeFromBillNo: 'INV-OLD' }))
      .toContain('INV-OLD');
    // รับคืนยังทำได้ทุกกรณีข้างบน
    const tradeIn = billRefundOptions({ ...paid, tradeInValue: 3000 });
    expect(tradeIn.find((o) => o.action === 'RETURN_ITEMS')?.blockedReason).toBeNull();
  });
});

describe('return form (FIX-230)', () => {
  const twoPhones = { ...paid, cashAmount: 28300, items: [phone('a', '1'), phone('b', '2'), charger()] };

  it('bill-level credit cap = money actually received incl. first installment, deposit and exchange credit − used', () => {
    expect(refundCap({ ...paid, cashAmount: 4500, paymentMethod: 'INSTALLMENT' })).toBe(4500);   // ดาวน์ 3,000 + งวดแรก 1,500
    expect(refundCap({ ...paid, cashAmount: 9000, depositAppliedAmount: 4000, exchangeCreditAmount: 900 })).toBe(13900);
    expect(refundCap({ ...paid, returnedAmount: 13000 })).toBe(900);
    expect(refundCap({ ...paid, refundableAmount: 1234 })).toBe(1234);   // backend ส่งมาแล้วใช้ค่านั้น
  });

  it('scanned device is preselected; installment preselects every device', () => {
    expect(defaultSelection(twoPhones, 'serial-b')).toEqual({ b: 1 });
    expect(defaultSelection({ ...twoPhones, paymentMethod: 'INSTALLMENT' })).toEqual({ a: 1, b: 1 });
    expect(defaultSelection(twoPhones)).toEqual({});
    expect(defaultSelection({ ...paid, items: [charger()] })).toEqual({ acc: 2 });
  });

  it('a return never refunds money (FIX-231); exchange credit follows the selection', () => {
    expect(selectionValue(twoPhones, { b: 1, acc: 1 })).toBe(14150);
    expect(defaultRefund(twoPhones, { b: 1 }, 'RETURN')).toBe(0);
    expect(defaultRefund({ ...twoPhones, paymentMethod: 'INSTALLMENT' }, { a: 1 }, 'RETURN')).toBe(0);
    expect(defaultRefund({ ...twoPhones, paymentMethod: 'INSTALLMENT' }, { a: 1 }, 'EXCHANGE')).toBe(13900);
    expect(defaultRefund({ ...paid, refundableAmount: 5000 }, { a: 1 }, 'EXCHANGE')).toBe(5000);
  });

  it('exchange credit cannot exceed the price of what comes back, even if the bill paid more', () => {
    expect(exchangeCreditCap(twoPhones, { a: 1 })).toBe(13900);              // บิลจ่าย 28,300 แต่คืนเครื่องเดียว
    expect(exchangeCreditCap({ ...twoPhones, refundableAmount: 9000 }, { a: 1 })).toBe(9000);
    expect(returnFormError(twoPhones, { a: 1 }, '28300', 'x', 'EXCHANGE')).toContain('ใช้ได้สูงสุด ฿13,900');
    expect(returnFormError(twoPhones, { a: 1 }, '13900', 'x', 'EXCHANGE')).toBeNull();
    expect(returnFormError(twoPhones, { a: 1 }, '', 'x', 'EXCHANGE')).toContain('กรอกเครดิต');
  });

  it('battery is asked only when exactly one device comes back', () => {
    expect(singleSelectedDevice(twoPhones.items, { b: 1, acc: 1 })?.id).toBe('b');
    expect(singleSelectedDevice(twoPhones.items, { a: 1, b: 1 })).toBeNull();
    expect(singleSelectedDevice(twoPhones.items, { acc: 1 })).toBeNull();
  });

  it('validates selection, quantity and reason (a return has no money field)', () => {
    expect(returnFormError(twoPhones, {}, '0', 'x')).toContain('เลือกรายการ');
    expect(returnFormError(twoPhones, { acc: 3 }, '0', 'x')).toContain('เกินที่ลูกค้าถืออยู่');
    expect(returnFormError(twoPhones, { a: 1 }, '0', ' ', 'RETURN', { a: '9000' })).toContain('เหตุผล');
    expect(returnFormError(twoPhones, { a: 1 }, '0', 'ขายคืนร้าน', 'RETURN', { a: '9000' })).toBeNull();
    expect(returnFormError(twoPhones, { acc: 1 }, '0', 'คืนหัวชาร์จ')).toBeNull();   // อุปกรณ์ไม่ต้องมีราคารับซื้อ
    expect(remainingQty(charger({ returnedQuantity: 1 }))).toBe(1);
  });

  it('a cash-bill sell-back needs the buyback cost per device; installment may leave it blank (FIX-232)', () => {
    expect(buybackRequired(twoPhones)).toBe(true);
    expect(buybackRequired({ paymentMethod: 'INSTALLMENT' })).toBe(false);
    expect(returnFormError(twoPhones, { a: 1, b: 1 }, '0', 'x', 'RETURN', { a: '9000' }))
      .toContain('ราคาที่ร้านรับซื้อคืน (ทุนใหม่) ของเครื่อง 2');
    expect(returnFormError(twoPhones, { a: 1 }, '0', 'x', 'RETURN', { a: '-5' })).toContain('ตัวเลข 0 ขึ้นไป');
    expect(returnFormError(twoPhones, { a: 1 }, '0', 'x', 'RETURN', { a: '9,500' })).toBeNull();
    const inst = { ...twoPhones, paymentMethod: 'INSTALLMENT' as const };
    expect(returnFormError(inst, { a: 1, b: 1 }, '0', 'ผ่อนไม่ไหว', 'RETURN', {})).toBeNull();
    // เปลี่ยนเครื่องไม่ถามราคารับซื้อ (เครื่องกลับด้วยทุนเดิม — ยอดขายย้ายไปบิลใหม่)
    expect(returnFormError(twoPhones, { a: 1 }, '13900', 'x', 'EXCHANGE', {})).toBeNull();
    expect(parseBuyback('')).toBeUndefined();
    expect(parseBuyback('12,000')).toBe(12000);
    expect(parseBuyback('abc')).toBeNaN();
  });
});
