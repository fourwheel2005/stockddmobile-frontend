import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EditSaleDateModal } from '../EditSaleDateModal';
import type { SalesOrderResponse } from '@/types/api';

const order = {
  id: 'order-1', billNo: 'INV-001', status: 'PAID',
  createdAt: '2026-08-20T08:00:00Z', closedAt: '2026-08-20T08:30:00Z',
  saleDate: '2026-08-20T08:30:00Z',
} as SalesOrderResponse;

describe('EditSaleDateModal', () => {
  it('explains immutable fields and requires an audit reason', () => {
    const html = renderToStaticMarkup(
      <EditSaleDateModal order={order} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );

    expect(html).toContain('แก้วันที่ขาย');
    expect(html).toContain('ไม่แก้วันที่สร้างระบบ');
    expect(html).toContain('เลขบิล');
    expect(html).toContain('เหตุผลที่แก้');
    expect(html).toContain('2026-08-20T15:30');
  });
});
