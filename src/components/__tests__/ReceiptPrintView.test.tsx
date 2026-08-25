import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReceiptPrintView } from '../ReceiptPrintView';
import { LINE_QR_IMAGE_URL } from '@/assets/lineQr';
import type { SalesOrderResponse } from '@/types/api';

const order = {
  id: 'order-1',
  billNo: 'INV-001',
  createdAt: '2026-08-18T10:00:00',
  closedAt: '2026-08-18T10:01:00',
  createdBy: 'staff01',
  customerName: null,
  customerPhone: null,
  orderChannel: 'WALK_IN',
  items: [],
  paymentMethod: 'CASH',
  subtotal: 100,
  discountAmount: 0,
  vatAmount: 0,
  shippingFee: 0,
  grandTotal: 100,
  note: null,
} as unknown as SalesOrderResponse;

describe('ReceiptPrintView document marking', () => {
  it('does not mark an original as duplicate', () => {
    const html = renderToStaticMarkup(<ReceiptPrintView order={order} />);

    expect(html).not.toContain('DUPLICATE');
  });

  it('marks a browser-printed copy as duplicate', () => {
    const html = renderToStaticMarkup(<ReceiptPrintView order={order} duplicate />);

    expect(html).toContain('สำเนา / DUPLICATE');
  });

  it('adds the supplied LINE QR image at the bottom of an ordinary receipt', () => {
    const html = renderToStaticMarkup(<ReceiptPrintView order={order} />);

    expect(html).toContain('alt="สแกน LINE DD Mobile"');
    expect(html).toContain(`src="${LINE_QR_IMAGE_URL}"`);
  });

  it('shows who pays the installment trade-in difference', () => {
    const tradeOrder = {
      ...order,
      paymentMethod: 'INSTALLMENT',
      installmentMonths: 10,
      downPaymentAmount: 5000,
      tradeInValue: 8000,
      tradeInSettlementAmount: 5000,
      tradeInDifferenceAmount: -3000,
      tradeInDifferenceMethod: 'TRANSFER',
    } as unknown as SalesOrderResponse;

    const html = renderToStaticMarkup(<ReceiptPrintView order={tradeOrder} />);

    expect(html).toContain('ส่วนต่างร้านจ่ายให้ลูกค้า');
    expect(html).toContain('3,000.00');
    expect(html).toContain('โอนเงิน / QR');
  });

  it('shows the immutable tender and change snapshot in browser fallback receipts', () => {
    const tenderedOrder = {
      ...order,
      tenderedAmount: 1000,
      changeAmount: 200,
    } as unknown as SalesOrderResponse;

    const html = renderToStaticMarkup(<ReceiptPrintView order={tenderedOrder} />);

    expect(html).toContain('รับเงิน:');
    expect(html).toContain('1,000.00');
    expect(html).toContain('เงินทอน:');
    expect(html).toContain('200.00');
  });
});
