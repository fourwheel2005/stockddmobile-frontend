import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ReturnItemsModal } from '@/components/sales/ReturnItemsModal';
import type { SalesOrderResponse } from '@/types/api';

const bill = (paymentMethod: string) => ({
  id: 'o1', billNo: 'INV-1', status: 'PAID', paymentMethod, grandTotal: 13900, paidAmount: 13900,
  cashAmount: 13900, transferAmount: 0, cardAmount: 0, qrAmount: 0, customerName: 'คุณเอ',
  items: [{ id: 'a', productName: 'iPhone 14', imei: '350596482527747', serialNumber: 'SN', custom: false,
    quantity: 1, sellPrice: 13900, serialItemId: 's1', returnedQuantity: 0 }],
}) as unknown as SalesOrderResponse;

const renderToStatic = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);

describe('ReturnItemsModal (FIX-231)', () => {
  it.each(['CASH', 'INSTALLMENT'])('a %s sell-back only puts the device back into stock — no money field', (pm) => {
    const html = renderToStatic(
      <ReturnItemsModal order={bill(pm)} mode="RETURN" preselectSerialId="s1" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('ไม่มีเงินออกจากเก๊ะ');
    expect(html).toContain('ยืนยันรับคืนเข้าสต็อก');
    expect(html).not.toContain('id="return-amount"');
    expect(html).not.toContain('วิธีคืนเงิน');
    expect(html).not.toContain('เงินสดจากเก๊ะ');
    expect(html).not.toContain('คืนเงินได้สูงสุด');
    // FIX-232: ราคารับซื้อคืน (ทุนใหม่) ต่อเครื่อง + ที่มาของเครื่อง
    expect(html).toContain('aria-label="ราคารับซื้อคืน 350596482527747"');
    expect(html).toContain(pm === 'INSTALLMENT' ? 'ว่าง = ทุนเดิม' : 'placeholder="ทุนใหม่"');
    expect(html).toContain('เครื่องคืน (มีเครดิต)');
    expect(html).toContain('บอลลูนซื้อคืน');
  });

  it('exchange still asks for the credit used on the new device', () => {
    const html = renderToStatic(
      <ReturnItemsModal order={bill('CASH')} mode="EXCHANGE" preselectSerialId="s1" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('id="return-amount"');
    expect(html).toContain('เครดิตที่ใช้ซื้อเครื่องใหม่');
    expect(html).toContain('ใช้ได้สูงสุด ฿13,900');
    expect(html).not.toContain('ราคารับซื้อคืน');   // เปลี่ยนเครื่อง = ทุนเดิม (ยอดขายย้ายบิล)
  });
});
