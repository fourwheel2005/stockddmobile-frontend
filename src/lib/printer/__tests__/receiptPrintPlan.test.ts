import { describe, expect, it } from 'vitest';
import { resolveReceiptPrintPlan } from '../receiptPrintPlan';

describe('resolveReceiptPrintPlan', () => {
  it('keeps a failed-original retry as an original receipt', () => {
    expect(resolveReceiptPrintPlan({ jobType: 'RECEIPT', isCash: true }))
      .toEqual({ duplicate: false, openDrawer: true });
  });

  it('never opens the drawer for a duplicate', () => {
    expect(resolveReceiptPrintPlan({
      jobType: 'DUPLICATE', isCash: true, openDrawerRequested: true,
    })).toEqual({ duplicate: true, openDrawer: false });
  });

  it('does not open the drawer for a non-cash original', () => {
    expect(resolveReceiptPrintPlan({ jobType: 'RECEIPT', isCash: false }))
      .toEqual({ duplicate: false, openDrawer: false });
  });
});
