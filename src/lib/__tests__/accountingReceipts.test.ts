import { describe, expect, it } from 'vitest';
import { expectedNetTotal, methodTotal, receiptsExcelFilename, totalsTieOut } from '../accountingReceipts';
import type { AccountingReceiptReport } from '@/types/api';

function report(overrides: Partial<AccountingReceiptReport['totals']> = {}): AccountingReceiptReport {
  return {
    fromDate: '2026-08-01', toDate: '2026-08-31', generatedAt: '2026-09-01T01:23:00',
    shopName: 'DDMobile', legalName: 'บริษัท บัดดี้ดี ดิเทล จำกัด', scopeLabel: 'ทุกสาขา',
    methodFilter: null, methodFilterLabel: 'ทั้งหมด', repairIncluded: true,
    totals: {
      receiptCount: 3, receivedTotal: 12690, preVatTotal: 11990, vatTotal: 700,
      byMethod: [
        { method: 'CASH', label: 'เงินสด', count: 2, total: 6990 },
        { method: 'TRANSFER', label: 'เงินโอน', count: 1, total: 5700 },
      ],
      byType: [
        { type: 'INSTALLMENT', label: 'ค่างวด', count: 1, total: 1990 },
        { type: 'SALE', label: 'ขายสินค้า', count: 2, total: 10700 },
      ],
      ...overrides,
    },
    expenses: {
      refundCashTotal: 500, refundTransferTotal: 0, refundCount: 1, shippingPayoutTotal: 50,
      ownerShippingTotal: 0, expensePayoutTotal: 0, tradeInPayoutCashTotal: 0,
      tradeInPayoutTransferTotal: 0, payoutCount: 1, total: 550,
    },
    netTotal: 12140, rowCount: 3, rowLimit: 20, rows: [],
  };
}

describe('accountingReceipts helpers', () => {
  it('confirms method, type and vat split all tie to the received total', () => {
    expect(totalsTieOut(report())).toBe(true);
    expect(totalsTieOut(report({ vatTotal: 701 }))).toBe(false);
    expect(totalsTieOut(report({ byMethod: [{ method: 'CASH', label: 'เงินสด', count: 3, total: 12690.01 }] }))).toBe(false);
  });

  it('reads a method total and falls back to zero for missing methods', () => {
    expect(methodTotal(report(), 'TRANSFER')).toBe(5700);
    expect(methodTotal(report(), 'QR')).toBe(0);
    expect(methodTotal(undefined, 'CASH')).toBe(0);
  });

  it('recomputes the net total the same way as the backend', () => {
    expect(expectedNetTotal(report())).toBe(12140);
  });

  it('names the Excel file exactly like the backend Content-Disposition', () => {
    expect(receiptsExcelFilename('2026-08-01', '2026-08-31')).toBe('DDMobile_receipts_2026-08-01_2026-08-31.xlsx');
  });
});
