import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReceiptPrintView } from '../ReceiptPrintView';
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
});
