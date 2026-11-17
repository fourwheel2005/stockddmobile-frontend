import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { CancelBillModal } from '@/components/sales/CancelBillModal';
import type { SalesOrderResponse } from '@/types/api';

const cashBill = {
  id: 'o1', billNo: 'INV-CASH', grandTotal: 21900, paidAmount: 21900, cashAmount: 21900, transferAmount: 0,
  cardAmount: 0, qrAmount: 0, customerName: 'คุณเอ', items: [],
} as unknown as SalesOrderResponse;

const render = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);

describe('CancelBillModal (FIX-232)', () => {
  it('cancelling a bill never asks how to refund — no money leaves the drawer', () => {
    const html = render(<CancelBillModal order={cashBill} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('ไม่มีเงินออกจากเก๊ะ');
    expect(html).toContain('ยืนยันยกเลิกบิล');
    expect(html).toContain('฿21,900.00');
    expect(html).not.toContain('วิธีคืนเงิน');
    expect(html).not.toContain('เงินสดจากเก๊ะ');
    expect(html).not.toContain('role="radio"');
    // ขายคืน/ผ่อนไม่ไหว ต้องไปทาง "รับคืนสินค้า"
    expect(html).toContain('ขายคืนร้าน / ผ่อนไม่ไหวคืนเครื่อง');
  });

  it('credit-note cancel keeps the tax-document notice', () => {
    const html = render(<CancelBillModal order={cashBill} creditNote onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('ออกใบลดหนี้ (ยกเลิกบิล)');
    expect(html).toContain('ออกเลขใบลดหนี้ใหม่');
  });

  it('asks for the battery only when one device comes back (FIX-229)', () => {
    const oneDevice = { ...cashBill, items: [{ imei: '350596482527747', serialNumber: 'SN', custom: false }] } as unknown as SalesOrderResponse;
    expect(render(<CancelBillModal order={oneDevice} onClose={vi.fn()} onConfirm={vi.fn()} />))
      .toContain('แบตเตอรี่ตอนรับคืน (%)');
    expect(render(<CancelBillModal order={cashBill} onClose={vi.fn()} onConfirm={vi.fn()} />))
      .not.toContain('แบตเตอรี่ตอนรับคืน (%)');
  });
});
