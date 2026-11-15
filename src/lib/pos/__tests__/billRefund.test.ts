import { describe, expect, it } from 'vitest';
import { billRefundOptions, fullRefundBlockedReason } from '../billRefund';

const paid = {
  status: 'PAID' as const, paymentMethod: 'CASH' as const, taxInvoiceNo: null,
  tradeInValue: null, depositAppliedAmount: null, depositNo: null,
};

describe('billRefundOptions (FIX-228)', () => {
  it('cash bill can be cancelled and refunded', () => {
    expect(billRefundOptions(paid)).toEqual([
      { action: 'REFUND', label: 'ยกเลิกบิล / คืนเงิน', blockedReason: null },
    ]);
  });

  it('installment bill offers refund and taking the device back', () => {
    expect(billRefundOptions({ ...paid, paymentMethod: 'INSTALLMENT' }).map((o) => o.action))
      .toEqual(['REFUND', 'RETURN_DEVICE']);
  });

  it('tax-invoiced bill refunds through a credit note only', () => {
    const opts = billRefundOptions({ ...paid, paymentMethod: 'INSTALLMENT', taxInvoiceNo: 'TIV-1' });
    expect(opts.map((o) => o.action)).toEqual(['CREDIT_NOTE']);
  });

  it('refunded or cancelled bills show nothing', () => {
    expect(billRefundOptions({ ...paid, status: 'REFUNDED' })).toEqual([]);
    expect(billRefundOptions({ ...paid, status: 'CANCELLED' })).toEqual([]);
  });

  it('trade-in and deposit bills explain why before asking for the shop code', () => {
    expect(fullRefundBlockedReason({ ...paid, tradeInValue: 4000 })).toContain('เทิร์น');
    const deposit = billRefundOptions({ ...paid, depositAppliedAmount: 4000, depositNo: 'DP-1' })[0];
    expect(deposit.blockedReason).toContain('DP-1');
    // รับเครื่องคืน (ผ่อน) ยังทำได้แม้มีเทิร์น — backend จำกัดเงินคืนเอง
    const inst = billRefundOptions({ ...paid, paymentMethod: 'INSTALLMENT', tradeInValue: 3000 });
    expect(inst.find((o) => o.action === 'RETURN_DEVICE')?.blockedReason).toBeNull();
  });
});
