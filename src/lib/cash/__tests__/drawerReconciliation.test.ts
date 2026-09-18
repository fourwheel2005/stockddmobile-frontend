import { describe, expect, it } from 'vitest';
import { reconcileDrawer } from '@/lib/cash/drawerReconciliation';
import type { CashMovementLine, CashMovementType, PaidFrom } from '@/types/api';

let seq = 0;
const mv = (type: CashMovementType, amount: number, extra: Partial<CashMovementLine> = {}): CashMovementLine => ({
  id: `m${++seq}`, type, amount, displayAmount: amount, paidFrom: 'REGISTER' as PaidFrom,
  referenceType: 'SALES_ORDER', referenceNo: null, note: null, createdBy: 'a', createdAt: '2026-09-18T01:00:00Z',
  ...extra,
});

describe('reconcileDrawer', () => {
  it('breaks the drawer balance into float + cash in − cash out and sums back to the card figure', () => {
    const movements = [
      mv('OPENING_FLOAT', 1000, { referenceType: 'SESSION' }),
      mv('SALE_CASH', 12000),
      mv('SALE_CASH', 800),
      mv('SALE_CASH', 500, { referenceType: 'REPAIR_TICKET' }),
      mv('SALE_CASH', 2290, { note: 'ค่างวด งวดที่ 3' }),
      mv('PAYOUT_SHIPPING', -60),
      mv('PAYOUT_EXPENSE', -120),
      mv('REFUND_CASH', -300, { referenceType: 'REFUND' }),
      mv('SAFE_DROP', -2000),
      mv('CASH_IN', 200),
      mv('ADJUSTMENT', -100),
    ];
    const r = reconcileDrawer(movements);
    const cardBalance = movements.reduce((s, m) => s + m.amount, 0);

    expect(r.openingFloat).toBe(1000);
    expect(r.inflows.map((l) => [l.key, l.amount, l.count])).toEqual([
      ['SALE_CASH', 12800, 2], ['REPAIR_CASH', 500, 1], ['INSTALLMENT_CASH', 2290, 1], ['CASH_IN', 200, 1],
    ]);
    expect(r.outflows.map((l) => [l.key, l.amount, l.count])).toEqual([
      ['REFUND_CASH', -300, 1], ['PAYOUT', -180, 2], ['SAFE_DROP', -2000, 1], ['ADJUSTMENT_MINUS', -100, 1],
    ]);
    expect(r.totalIn).toBe(15790);
    expect(r.totalOut).toBe(2580);
    expect(r.balance).toBe(14210);
    expect(r.balance).toBe(cardBalance);
  });

  it('keeps transfer/card/QR and owner-paid items out of the drawer but lists them for context', () => {
    const r = reconcileDrawer([
      mv('OPENING_FLOAT', 500, { referenceType: 'SESSION' }),
      mv('SALE_TRANSFER', 0, { displayAmount: 9900, paidFrom: 'CUSTOMER' as PaidFrom }),
      mv('SALE_QR', 0, { displayAmount: 350, paidFrom: 'CUSTOMER' as PaidFrom }),
      mv('PAYOUT_SHIPPING', 0, { displayAmount: 0, paidFrom: 'OWNER_GRANDPA' as PaidFrom }),
      mv('REFUND_TRANSFER', 0, { displayAmount: -1000, paidFrom: 'BANK' as PaidFrom }),
    ]);
    expect(r.balance).toBe(500);
    expect(r.inflows).toEqual([]);
    expect(r.nonDrawer.map((l) => [l.key, l.amount])).toEqual([['TRANSFER', 9900], ['QR', 350], ['REFUND_TRANSFER', 1000]]);
  });

  it('handles an empty or missing movement list', () => {
    expect(reconcileDrawer(null).balance).toBe(0);
    expect(reconcileDrawer([]).inflows).toEqual([]);
  });
});
