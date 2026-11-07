import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PaymentBreakdownCard } from '@/components/cash/PaymentBreakdownCard';
import { netPayments } from '@/lib/cash/netPayments';
import type { PaymentBreakdown } from '@/types/api';

// กะจริงจากหน้าจอ (FIX-210): ขายสด 24,740 · โอน 61,770 · คืนเงินสด 3,790
const breakdown: PaymentBreakdown = {
  cashTotal: 24740, cashOrderCount: 7,
  transferTotal: 61770, transferOrderCount: 7,
  cardTotal: 0, cardOrderCount: 0,
  qrTotal: 0, qrOrderCount: 0,
  grandTotal: 86510, totalOrderCount: 13,
};

describe('netPayments (FIX-210)', () => {
  it('takes a cash refund off the cash line and a transfer refund off the transfer line', () => {
    const net = netPayments(breakdown, 3790, 1000);
    const byKey = Object.fromEntries(net.lines.map((l) => [l.key, l]));
    expect(byKey.CASH).toMatchObject({ received: 24740, refunded: 3790, net: 20950 });
    expect(byKey.TRANSFER).toMatchObject({ received: 61770, refunded: 1000, net: 60770 });
    expect(byKey.CARD.net).toBe(0);
    expect(net.receivedTotal).toBe(86510);
    expect(net.refundTotal).toBe(4790);
    expect(net.netTotal).toBe(81720);   // = grandTotal − คืนสด − คืนโอน = netSalesTotal ของ backend
    expect(net.lines.reduce((s, l) => s + l.net, 0)).toBe(net.netTotal);
  });

  it('keeps every line equal to what was received when nothing was refunded', () => {
    const net = netPayments(breakdown);
    expect(net.lines.map((l) => l.net)).toEqual([24740, 61770, 0, 0]);
    expect(net.netTotal).toBe(86510);
  });
});

describe('PaymentBreakdownCard', () => {
  it('shows the cash line after the refund, with what was received and refunded underneath', () => {
    const html = renderToStaticMarkup(
      <PaymentBreakdownCard breakdown={breakdown} refundCashTotal={3790} refundTransferTotal={0} />,
    );
    expect(html).toContain('฿20,950.00');                       // เงินสดสุทธิ 24,740 − 3,790
    expect(html).toContain('รับ ฿24,740.00');
    expect(html).toContain('คืน −฿3,790.00');
    expect(html).toContain('ยอดรับสุทธิ (หักคืนเงินแล้ว)');
    expect(html).toContain('฿82,720.00');                       // 86,510 − 3,790
    expect(html).toContain('รับก่อนหักคืน ฿86,510.00');
  });

  it('shows plain received totals when there is no refund', () => {
    const html = renderToStaticMarkup(<PaymentBreakdownCard breakdown={breakdown} />);
    expect(html).toContain('฿24,740.00');
    expect(html).toContain('ยอดรับรวม');
    expect(html).not.toContain('คืน −');
    expect(html).not.toContain('รับก่อนหักคืน');
  });
});

describe('PaymentBreakdownCard deposits (FIX-214)', () => {
  it('says how much of the receipts was deposit money', () => {
    const html = renderToStaticMarkup(
      <PaymentBreakdownCard breakdown={{ ...breakdown, depositTotal: 5000, depositCount: 1 }} />,
    );
    expect(html).toContain('มัดจำ/จองเครื่อง (1 ใบ)');
    expect(html).toContain('฿5,000.00');
  });
});
