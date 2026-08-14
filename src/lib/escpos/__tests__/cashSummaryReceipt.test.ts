import { describe, expect, it } from 'vitest';
import { buildCashPeriodSummary, buildCashSessionSummary } from '../cashSummaryReceipt';
import type { CashPeriodSummaryResponse, CashSessionResponse, PaymentBreakdown } from '@/types/api';

const breakdown: PaymentBreakdown = {
  cashTotal: 1000, cashOrderCount: 1,
  transferTotal: 500, transferOrderCount: 1,
  cardTotal: 0, cardOrderCount: 0,
  qrTotal: 200, qrOrderCount: 1,
  grandTotal: 1700, totalOrderCount: 2,
};

const session: CashSessionResponse = {
  id: 'session-id', sessionNo: 'CS-20260814-MAIN-001', registerId: 'register-id',
  registerName: 'เก๊ะหลัก', status: 'CLOSED', openedBy: 'staff', openedAt: '2026-08-14T02:00:00',
  openingFloat: 5000, closedBy: 'manager', closedAt: '2026-08-14T14:00:00',
  expectedClose: 5770, actualClose: 5750, variance: -20, note: 'ตรวจนับแล้ว', breakdown,
  refundCashTotal: 100, refundTransferTotal: 50, refundTotal: 150, refundCount: 2,
  netSalesTotal: 1550, cashInTotal: 0, payoutTotal: 30, safeDropTotal: 100,
  adjustmentTotal: 0, financePayoutTotal: 0, ownerPaidTotal: 0, movements: null,
};

describe('cash summary thermal receipts', () => {
  it('prints one closed session with operational totals and cut command', () => {
    const bytes = buildCashSessionSummary(session);
    const output = String.fromCharCode(...bytes);
    expect(output).toContain('CS-20260814-MAIN-001');
    expect(output).toContain('1,700.00');
    expect(output).toContain('1,550.00');
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0]);
  });

  it('prints monthly reconciliation counts without opening the drawer', () => {
    const summary: CashPeriodSummaryResponse = {
      fromDate: '2026-08-01', toDate: '2026-08-31', generatedAt: '2026-08-31T16:00:00',
      registerId: 'register-id', registerName: 'เก๊ะหลัก', sessionCount: 3,
      balancedSessionCount: 1, shortageSessionCount: 1, overageSessionCount: 1,
      breakdown, refundCashTotal: 100, refundTransferTotal: 50, refundTotal: 150,
      refundCount: 2, netSalesTotal: 1550, cashInTotal: 0, payoutTotal: 30,
      safeDropTotal: 100, adjustmentTotal: 0, financePayoutTotal: 0, ownerPaidTotal: 0,
      openingFloatTotal: 15000, expectedCloseTotal: 16700, actualCloseTotal: 16690,
      varianceTotal: -10, shortageTotal: 20, overageTotal: 10,
    };
    const bytes = buildCashPeriodSummary(summary);
    const output = String.fromCharCode(...bytes);
    expect(output).toContain('2026-08-01_2026-08-31');
    expect(output).toContain('15,000.00');
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0]);
  });
});
