import type { PaymentBreakdown } from '@/types/api';

export type PaymentMethodKey = 'CASH' | 'TRANSFER' | 'CARD' | 'QR';

export interface NetPaymentLine {
  key: PaymentMethodKey;
  /** ยอดรับตามบิล (ก่อนหักคืน) */
  received: number;
  /** เงินที่คืนลูกค้าออกทางช่องทางนี้ */
  refunded: number;
  /** = received − refunded */
  net: number;
  count: number;
}

export interface NetPayments {
  lines: NetPaymentLine[];
  receivedTotal: number;
  refundTotal: number;
  /** = ผลรวม net ทุกช่องทาง = grandTotal − คืนสด − คืนโอน (เท่ากับ netSalesTotal ของ backend) */
  netTotal: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * ยอดรับสุทธิต่อช่องทาง (FIX-210) — คืนเงินต้องหักจากช่องทางที่เงินออกจริง:
 * คืนเงินสด = ออกจากเก๊ะ → หักแถวเงินสด · คืนผ่านโอน (รวมบิลบัตร/QR ที่คืนทางโอน) → หักแถวโอน.
 * บัตร/QR ไม่มีการคืนผ่านช่องทางตัวเอง จึงเท่ายอดรับ.
 */
export function netPayments(breakdown: PaymentBreakdown, refundCash = 0, refundTransfer = 0): NetPayments {
  const line = (key: PaymentMethodKey, received: number, count: number, refunded = 0): NetPaymentLine => ({
    key, received: r2(received), refunded: r2(refunded), net: r2(received - refunded), count,
  });
  const lines = [
    line('CASH', Number(breakdown.cashTotal ?? 0), breakdown.cashOrderCount, Number(refundCash ?? 0)),
    line('TRANSFER', Number(breakdown.transferTotal ?? 0), breakdown.transferOrderCount, Number(refundTransfer ?? 0)),
    line('CARD', Number(breakdown.cardTotal ?? 0), breakdown.cardOrderCount),
    line('QR', Number(breakdown.qrTotal ?? 0), breakdown.qrOrderCount),
  ];
  const receivedTotal = r2(lines.reduce((s, l) => s + l.received, 0));
  const refundTotal = r2(lines.reduce((s, l) => s + l.refunded, 0));
  return { lines, receivedTotal, refundTotal, netTotal: r2(receivedTotal - refundTotal) };
}
