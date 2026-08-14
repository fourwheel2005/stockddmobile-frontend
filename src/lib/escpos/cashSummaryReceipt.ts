import { EscPosBuilder } from './EscPosBuilder';
import { formatShopDateTimeCompact } from '../datetime';
import type { CashPeriodSummaryResponse, CashSessionResponse, PaymentBreakdown } from '@/types/api';

const W = 48;

interface SummaryReceiptData {
  title: string;
  reference: string;
  registerName: string;
  period: string;
  operatorLine?: string;
  sessions?: number;
  breakdown: PaymentBreakdown;
  refundCashTotal: number;
  refundTransferTotal: number;
  refundCount: number;
  netSalesTotal: number;
  cashInTotal: number;
  payoutTotal: number;
  safeDropTotal: number;
  adjustmentTotal: number;
  financePayoutTotal: number;
  ownerPaidTotal: number;
  openingFloat: number;
  expectedClose: number;
  actualClose: number;
  variance: number;
  balancedCount?: number;
  shortageCount?: number;
  overageCount?: number;
  shortageTotal?: number;
  overageTotal?: number;
  note?: string | null;
}

const money = (value: number | null | undefined): string =>
  Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateOnly = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

const varianceLabel = (variance: number): string => {
  if (variance === 0) return 'ตรง';
  return variance < 0 ? `ขาด ${money(Math.abs(variance))}` : `เกิน ${money(variance)}`;
};

export function buildCashSessionSummary(session: CashSessionResponse): Uint8Array {
  return buildSummaryReceipt({
    title: 'ใบสรุปปิดเก๊ะ',
    reference: session.sessionNo,
    registerName: session.registerName,
    period: `${formatShopDateTimeCompact(session.openedAt)} - ${formatShopDateTimeCompact(session.closedAt)}`,
    operatorLine: `เปิด ${session.openedBy} / ปิด ${session.closedBy ?? '-'}`,
    breakdown: session.breakdown ?? emptyBreakdown(),
    refundCashTotal: session.refundCashTotal,
    refundTransferTotal: session.refundTransferTotal,
    refundCount: session.refundCount,
    netSalesTotal: session.netSalesTotal,
    cashInTotal: session.cashInTotal,
    payoutTotal: session.payoutTotal,
    safeDropTotal: session.safeDropTotal,
    adjustmentTotal: session.adjustmentTotal,
    financePayoutTotal: session.financePayoutTotal,
    ownerPaidTotal: session.ownerPaidTotal,
    openingFloat: session.openingFloat,
    expectedClose: session.expectedClose ?? 0,
    actualClose: session.actualClose ?? 0,
    variance: session.variance ?? 0,
    note: session.note,
  });
}

export function buildCashPeriodSummary(summary: CashPeriodSummaryResponse): Uint8Array {
  return buildSummaryReceipt({
    title: 'ใบสรุปยอดเก๊ะ',
    reference: `${summary.fromDate}_${summary.toDate}`,
    registerName: summary.registerName,
    period: `${dateOnly(summary.fromDate)} - ${dateOnly(summary.toDate)}`,
    sessions: summary.sessionCount,
    breakdown: summary.breakdown,
    refundCashTotal: summary.refundCashTotal,
    refundTransferTotal: summary.refundTransferTotal,
    refundCount: summary.refundCount,
    netSalesTotal: summary.netSalesTotal,
    cashInTotal: summary.cashInTotal,
    payoutTotal: summary.payoutTotal,
    safeDropTotal: summary.safeDropTotal,
    adjustmentTotal: summary.adjustmentTotal,
    financePayoutTotal: summary.financePayoutTotal,
    ownerPaidTotal: summary.ownerPaidTotal,
    openingFloat: summary.openingFloatTotal,
    expectedClose: summary.expectedCloseTotal,
    actualClose: summary.actualCloseTotal,
    variance: summary.varianceTotal,
    balancedCount: summary.balancedSessionCount,
    shortageCount: summary.shortageSessionCount,
    overageCount: summary.overageSessionCount,
    shortageTotal: summary.shortageTotal,
    overageTotal: summary.overageTotal,
  });
}

function buildSummaryReceipt(data: SummaryReceiptData): Uint8Array {
  const b = new EscPosBuilder().init().codepage(26).align('C');
  b.size(2, 2).bold(true).textln('DD MOBILE').bold(false).size(1, 1);
  b.bold(true).textln(data.title).bold(false).textln(data.reference);
  b.textln(data.registerName).textln(data.period);
  if (data.operatorLine) b.textln(data.operatorLine);
  if (data.sessions != null) b.textln(`จำนวนกะที่ปิดแล้ว ${data.sessions} กะ`);
  printSales(b, data);
  printDrawer(b, data);
  printReconciliation(b, data);
  if (data.note) b.align('L').separator('-', W).textln(`หมายเหตุ: ${data.note}`);
  b.align('C').separator('=', W).textln(`พิมพ์ ${formatShopDateTimeCompact(new Date().toISOString())}`);
  return b.feedAndCut(4).build();
}

function printSales(b: EscPosBuilder, data: SummaryReceiptData): void {
  const payment = data.breakdown;
  b.align('L').separator('=', W).bold(true).textln('ยอดรับจากการขาย').bold(false);
  b.justify(`เงินสด (${payment.cashOrderCount})`, money(payment.cashTotal), W);
  b.justify(`เงินโอน (${payment.transferOrderCount})`, money(payment.transferTotal), W);
  b.justify(`บัตร (${payment.cardOrderCount})`, money(payment.cardTotal), W);
  b.justify(`QR (${payment.qrOrderCount})`, money(payment.qrTotal), W);
  b.justify(`รับรวม (${payment.totalOrderCount} บิล)`, money(payment.grandTotal), W);
  b.justify(`คืนเงิน (${data.refundCount})`, `-${money(data.refundCashTotal + data.refundTransferTotal)}`, W);
  b.bold(true).justify('ยอดรับสุทธิ', money(data.netSalesTotal), W).bold(false);
}

function printDrawer(b: EscPosBuilder, data: SummaryReceiptData): void {
  b.separator('-', W).bold(true).textln('กระทบยอดเงินสดในลิ้นชัก').bold(false);
  b.justify('เงินทอนตั้งต้น', money(data.openingFloat), W);
  b.justify('ขายรับเงินสด', money(data.breakdown.cashTotal), W);
  if (data.cashInTotal) b.justify('เติมเงิน/เจ้าของใส่', money(data.cashInTotal), W);
  if (data.refundCashTotal) b.justify('คืนเงินสด', `-${money(data.refundCashTotal)}`, W);
  if (data.payoutTotal) b.justify('จ่ายค่าใช้จ่าย', `-${money(data.payoutTotal)}`, W);
  if (data.safeDropTotal) b.justify('เก็บเข้าตู้นิรภัย', `-${money(data.safeDropTotal)}`, W);
  if (data.adjustmentTotal) b.justify('ปรับปรุงสุทธิ', money(data.adjustmentTotal), W);
  if (data.financePayoutTotal) b.justify('ไฟแนนซ์เข้าบัญชี', money(data.financePayoutTotal), W);
  if (data.ownerPaidTotal) b.justify('เจ้าของสำรองจ่าย', money(data.ownerPaidTotal), W);
}

function printReconciliation(b: EscPosBuilder, data: SummaryReceiptData): void {
  b.separator('=', W).bold(true).textln('ผลตรวจนับเงินสด').bold(false);
  b.justify('เงินที่ควรมี', money(data.expectedClose), W);
  b.justify('นับเงินจริง', money(data.actualClose), W);
  b.size(2, 1).bold(true).textln(`ผล: ${varianceLabel(data.variance)}`).bold(false).size(1, 1);
  if (data.balancedCount != null) {
    b.textln(`ตรง ${data.balancedCount} / ขาด ${data.shortageCount ?? 0} / เกิน ${data.overageCount ?? 0} กะ`);
    b.justify('ยอดขาดสะสม', money(data.shortageTotal), W);
    b.justify('ยอดเกินสะสม', money(data.overageTotal), W);
  }
}

function emptyBreakdown(): PaymentBreakdown {
  return {
    cashTotal: 0, cashOrderCount: 0, transferTotal: 0, transferOrderCount: 0,
    cardTotal: 0, cardOrderCount: 0, qrTotal: 0, qrOrderCount: 0,
    grandTotal: 0, totalOrderCount: 0,
  };
}
