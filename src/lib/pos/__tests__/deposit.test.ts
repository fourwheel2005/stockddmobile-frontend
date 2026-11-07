import { describe, expect, it } from 'vitest';
import { depositDue, depositRemaining } from '../deposit';
import { reconcileDrawer } from '@/lib/cash/drawerReconciliation';
import { receiptDueBeforeDeposit, type ReceiptData } from '@/lib/escpos/ddmobileReceipt';
import type { CashMovementLine } from '@/types/api';

describe('depositDue (FIX-214) — สูตรเดียวกับ backend', () => {
  it('cash sale: the customer pays the bill minus the deposit', () => {
    const r = depositDue({ isInstallment: false, grandTotal: 30000, payToday: 0, tradeInValue: 0, depositCredit: 5000 });
    expect(r.due).toBe(25000);
    expect(r.depositOver).toBe(false);
  });

  it('installment: the deposit comes off what is paid today (down + add-ons − discount), not off the financed part', () => {
    const r = depositDue({ isInstallment: true, grandTotal: 30000, payToday: 8000, tradeInValue: 0, depositCredit: 5000 });
    expect(r.base).toBe(8000);
    expect(r.due).toBe(3000);
  });

  it('trade-in is taken first, then the deposit', () => {
    const r = depositDue({ isInstallment: false, grandTotal: 30000, payToday: 0, tradeInValue: 10000, depositCredit: 5000 });
    expect(r.afterTradeIn).toBe(20000);
    expect(r.due).toBe(15000);
  });

  it('flags a deposit bigger than what is left to pay', () => {
    expect(depositDue({ isInstallment: false, grandTotal: 4000, payToday: 0, tradeInValue: 0, depositCredit: 5000 }).depositOver).toBe(true);
    expect(depositDue({ isInstallment: true, grandTotal: 30000, payToday: 3000, tradeInValue: 0, depositCredit: 5000 }).depositOver).toBe(true);
    expect(depositDue({ isInstallment: false, grandTotal: 5000, payToday: 0, tradeInValue: 0, depositCredit: 5000 }))
      .toMatchObject({ due: 0, depositOver: false });   // จ่ายครบด้วยมัดจำพอดี
  });

  it('no deposit leaves the amount unchanged', () => {
    expect(depositDue({ isInstallment: false, grandTotal: 30000, payToday: 0, tradeInValue: 0, depositCredit: 0 }).due).toBe(30000);
  });

  it('remaining on the deposit slip = agreed − held', () => {
    expect(depositRemaining(32900, 5000)).toBe(27900);
    expect(depositRemaining(5000, 5000)).toBe(0);
  });
});

describe('deposit money in the drawer (FIX-214)', () => {
  const line = (p: Partial<CashMovementLine> & Pick<CashMovementLine, 'id' | 'type' | 'amount'>): CashMovementLine => ({
    displayAmount: p.amount, paidFrom: 'REGISTER', referenceType: 'SALES_ORDER', referenceNo: null,
    note: null, createdBy: 'a', createdAt: '2026-11-07T01:00:00Z', ...p,
  });

  it('shows deposit cash as its own line and refunds as cash out', () => {
    const r = reconcileDrawer([
      line({ id: '1', type: 'OPENING_FLOAT', amount: 5000, referenceType: 'SESSION' }),
      line({ id: '2', type: 'SALE_CASH', amount: 5000, referenceType: 'DEVICE_DEPOSIT', referenceNo: 'DP-1' }),
      line({ id: '3', type: 'SALE_CASH', amount: 25000 }),
      line({ id: '4', type: 'REFUND_CASH', amount: -1000, referenceType: 'DEVICE_DEPOSIT', referenceNo: 'DP-2' }),
    ]);
    expect(r.inflows.map((l) => [l.key, l.amount])).toEqual([['SALE_CASH', 25000], ['DEPOSIT_CASH', 5000]]);
    expect(r.inflows.find((l) => l.key === 'DEPOSIT_CASH')?.label).toContain('มัดจำ');
    expect(r.balance).toBe(34000);
  });
});

describe('receipt amount paid today after the deposit (FIX-214)', () => {
  const base = { grandTotal: 30000, paymentMethod: 'CASH' } as ReceiptData;

  it('cash bill: before deposit = bill total', () => {
    expect(receiptDueBeforeDeposit(base)).toBe(30000);
  });

  it('installment bill: before deposit = down + add-ons − discount', () => {
    expect(receiptDueBeforeDeposit({ ...base, paymentMethod: 'INSTALLMENT', downPaymentAmount: 8000, addOnTotal: 590, todayDiscountAmount: 90 }))
      .toBe(8500);
  });

  it('trade-in bill: before deposit = trade-in difference', () => {
    expect(receiptDueBeforeDeposit({ ...base, tradeInValue: 10000, tradeInDifferenceAmount: 20000 })).toBe(20000);
  });
});
