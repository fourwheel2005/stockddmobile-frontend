import { describe, expect, it } from 'vitest';
import { buildCashPeriodSummary, buildCashSessionSummary } from '../cashSummaryReceipt';
import { encodeCp874 } from '../cp874';

/** ข้อความไทยบนใบเสร็จถูก encode เป็น cp874 — แปลง expected ให้อยู่รูปเดียวกันก่อนเทียบ */
const th = (text: string) => String.fromCharCode(...encodeCp874(text));
import type { CashPeriodSummaryResponse, CashSessionResponse, PaymentBreakdown, StockCountResponse } from '@/types/api';

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

  it('prints first-hand and second-hand device counts at the end of the session summary (FIX-201)', () => {
    const closing: StockCountResponse = {
      phase: 'CLOSING', expectedNew: 12, expectedSecondHand: 7, expectedChargerHeads: 30,
      expectedChargingCables: 25, expectedOtherAccessories: 9, countedNew: 12, countedSecondHand: 6,
      countedChargerHeads: 30, countedChargingCables: 25, countedOtherAccessories: 9,
      varianceNew: 0, varianceSecondHand: -1, varianceChargerHeads: 0, varianceChargingCables: 0,
      varianceOtherAccessories: 0, matched: false, certifiedName: 'จิ๋ม', countedAt: '2026-08-14T14:00:00',
    };
    const output = String.fromCharCode(...buildCashSessionSummary({ ...session, stockCounts: [closing] }));
    const cut = output.indexOf('\x1d\x56');
    const stockAt = output.indexOf(th('ตรวจนับสต็อก'));
    expect(stockAt).toBeGreaterThan(output.indexOf(th('ผลตรวจนับเงินสด')));   // อยู่ท้ายใบ หลังส่วนเงิน
    expect(stockAt).toBeLessThan(cut);
    expect(output).toContain(th('ปิดร้าน'));
    expect(output).toContain(th('เครื่องมือ 1'));
    expect(output).toContain(th('12 / 12 เครื่อง'));
    expect(output).toContain(th('เครื่องมือ 2'));
    expect(output).toContain(th('6 / 7 เครื่อง'));
    expect(output).toContain(th('ต่าง มือ2 -1'));
    expect(output).toContain(th('รับรองโดย จิ๋ม'));
  });

  it('says when a session has no stock count record instead of printing nothing', () => {
    const output = String.fromCharCode(...buildCashSessionSummary({ ...session, stockCounts: [] }));
    expect(output).toContain(th('ไม่มีบันทึกตรวจนับในกะนี้'));
  });

  it('does not print the stock section on the monthly summary', () => {
    const summary: CashPeriodSummaryResponse = {
      fromDate: '2026-08-01', toDate: '2026-08-31', generatedAt: '2026-08-31T16:00:00',
      registerId: 'register-id', registerName: 'เก๊ะหลัก', sessionCount: 1,
      balancedSessionCount: 1, shortageSessionCount: 0, overageSessionCount: 0,
      breakdown, refundCashTotal: 0, refundTransferTotal: 0, refundTotal: 0, refundCount: 0,
      netSalesTotal: 1700, cashInTotal: 0, payoutTotal: 0, safeDropTotal: 0, adjustmentTotal: 0,
      financePayoutTotal: 0, ownerPaidTotal: 0, openingFloatTotal: 5000, expectedCloseTotal: 6000,
      actualCloseTotal: 6000, varianceTotal: 0, shortageTotal: 0, overageTotal: 0,
    };
    expect(String.fromCharCode(...buildCashPeriodSummary(summary))).not.toContain(th('ตรวจนับสต็อก'));
  });
});
