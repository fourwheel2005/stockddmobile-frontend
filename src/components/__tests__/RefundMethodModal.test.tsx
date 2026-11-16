import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { RefundMethodModal, defaultRefundMethod } from '@/components/RefundMethodModal';
import type { SalesOrderResponse } from '@/types/api';

const cashBill = {
  id: 'o1', billNo: 'INV-CASH', paidAmount: 21900, cashAmount: 21900, transferAmount: 0, cardAmount: 0, qrAmount: 0,
  customerName: 'คุณเอ', items: [],
} as unknown as SalesOrderResponse;

const transferBill = { ...cashBill, billNo: 'INV-TRF', cashAmount: 0, transferAmount: 21900 } as SalesOrderResponse;

const render = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);

describe('RefundMethodModal (FIX-194)', () => {
  it('defaults to cash for cash bills and transfer when any external channel was used', () => {
    expect(defaultRefundMethod(cashBill)).toBe('CASH');
    expect(defaultRefundMethod(transferBill)).toBe('TRANSFER');
    expect(defaultRefundMethod({ cashAmount: 5000, transferAmount: 0, cardAmount: 500, qrAmount: 0 })).toBe('TRANSFER');
  });

  it('lets staff choose the real refund channel instead of locking to the original payment', () => {
    const html = render(<RefundMethodModal order={cashBill} onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(html).toContain('คืนเงินให้ลูกค้าทางไหน');
    expect(html).toContain('aria-label="วิธีคืนเงิน"');
    expect(html).toContain('เงินสดจากเก๊ะ');
    expect(html).toContain('โอนคืนเข้าบัญชีลูกค้า');
    expect(html).toContain('role="radio" aria-checked="true"');
  });

  it('asks for the battery when one device comes back (FIX-229)', () => {
    const oneDevice = { ...cashBill, items: [{ imei: '350596482527747', serialNumber: 'SN', custom: false }] } as unknown as SalesOrderResponse;
    expect(render(<RefundMethodModal order={oneDevice} onClose={vi.fn()} onConfirm={vi.fn()} />))
      .toContain('แบตเตอรี่ตอนรับคืน (%)');
    // บิลไม่มีเครื่อง (อุปกรณ์เสริมล้วน) ไม่ต้องถามแบต
    expect(render(<RefundMethodModal order={cashBill} onClose={vi.fn()} onConfirm={vi.fn()} />))
      .not.toContain('แบตเตอรี่ตอนรับคืน');
  });
});
