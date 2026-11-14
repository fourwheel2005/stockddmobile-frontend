import { describe, expect, it } from 'vitest';
import {
  calculateTradeInSettlement, firstInstallmentBlockedReason, firstInstallmentToday, installmentPayToday,
} from '../tradeIn';
import { depositDue } from '../deposit';

/**
 * FIX-226: บิลผ่อน "ดาวน์ + จ่ายงวดแรกพร้อมกัน" — สูตรเดียวกับที่ POS ใช้ (PosTerminalPage) และ backend
 * ยอดวันนี้ = ดาวน์ + งวดแรก + อุปกรณ์ − ส่วนลด · เทิร์น/มัดจำหักจากยอดวันนี้ทั้งก้อน
 */
function todayFor(input: {
  down: number; monthly: number; months: number; payFirst: boolean;
  addOn?: number; discount?: number; tradeIn?: number; deposit?: number;
}) {
  const first = firstInstallmentToday(input.payFirst, input.monthly, input.months);
  const salePart = installmentPayToday(input.down, input.addOn ?? 0, input.discount ?? 0);
  const payToday = salePart + first;
  const settlement = calculateTradeInSettlement({
    paymentMethod: 'INSTALLMENT', grandTotal: 20000,
    downPayment: input.down + first, addOnToday: input.addOn ?? 0,
    todayDiscount: input.discount ?? 0, tradeInValue: input.tradeIn ?? 0,
  });
  const due = depositDue({
    isInstallment: true, grandTotal: 20000, payToday,
    tradeInValue: input.tradeIn ?? 0, depositCredit: input.deposit ?? 0,
  });
  return { first, salePart, payToday, settlement, due };
}

describe('firstInstallmentToday', () => {
  it('is zero unless the cashier picks "down + first installment"', () => {
    expect(firstInstallmentToday(false, 1500, 10)).toBe(0);
    expect(firstInstallmentToday(true, 1500, 10)).toBe(1500);
  });

  it('needs a monthly amount and at least two months', () => {
    expect(firstInstallmentToday(true, 0, 10)).toBe(0);
    expect(firstInstallmentToday(true, 1500, 1)).toBe(0);
    expect(firstInstallmentToday(true, 1500.555, 10)).toBe(1500.56);
  });

  it('explains why checkout is blocked', () => {
    expect(firstInstallmentBlockedReason(false, 0, 1)).toBeNull();
    expect(firstInstallmentBlockedReason(true, 1500, 10)).toBeNull();
    expect(firstInstallmentBlockedReason(true, 0, 10)).toContain('ค่างวด/เดือน');
    expect(firstInstallmentBlockedReason(true, 1500, 1)).toContain('อย่างน้อย 2 เดือน');
  });
});

describe('amount collected today with the first installment', () => {
  it('default stays down payment only', () => {
    const r = todayFor({ down: 3000, monthly: 1500, months: 10, payFirst: false });
    expect(r.payToday).toBe(3000);
    expect(r.settlement.customerPays).toBe(3000);
  });

  it('adds the first installment to the keyed down payment', () => {
    const r = todayFor({ down: 3000, monthly: 1500, months: 10, payFirst: true });
    expect(r.first).toBe(1500);
    expect(r.salePart).toBe(3000);
    expect(r.payToday).toBe(4500);
    expect(r.settlement.customerPays).toBe(4500);
  });

  it('keeps accessories and the discount in the same total', () => {
    const r = todayFor({ down: 5000, monthly: 1500, months: 10, payFirst: true, addOn: 590, discount: 1000 });
    expect(r.payToday).toBe(6090);
  });

  it('lets a trade-in cover down and first installment together', () => {
    expect(todayFor({ down: 3000, monthly: 1500, months: 10, payFirst: true, tradeIn: 4000 }).settlement)
      .toMatchObject({ settlementAmount: 4500, customerPays: 500, storePays: 0 });
    expect(todayFor({ down: 3000, monthly: 1500, months: 10, payFirst: true, tradeIn: 5000 }).settlement)
      .toMatchObject({ customerPays: 0, storePays: 500 });
  });

  it('takes a deposit off down plus first installment', () => {
    const r = todayFor({ down: 3000, monthly: 1500, months: 10, payFirst: true, deposit: 1000 });
    expect(r.due.due).toBe(3500);
    expect(r.due.depositOver).toBe(false);
  });
});
