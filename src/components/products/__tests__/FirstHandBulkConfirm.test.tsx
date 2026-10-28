import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FirstHandBulkConfirm } from '@/components/products/FirstHandBulkConfirm';
import { FirstHandBulkPanel } from '@/components/products/FirstHandBulkPanel';
import type { FirstHandInstallmentRow } from '@/types/api';

const row: FirstHandInstallmentRow = {
  productId: 'p17', productName: 'iPhone 17', storage: '256', variantCount: 4,
  cashPrice: 29900, downPayment: 8990, installmentTerms: '[{"months":10,"monthly":1990}]',
};

describe('first-hand bulk UI (FIX-208)', () => {
  it('confirmation lists old → new cash price, down payment and terms with the SKU count', () => {
    const html = renderToStaticMarkup(
      <FirstHandBulkConfirm pending={false} onClose={vi.fn()} onConfirm={vi.fn()} changes={[{
        row, clears: false,
        request: { productId: 'p17', storage: '256', cashPrice: 28900, downPayment: 6990,
                   installmentTerms: '[{"months":10,"monthly":2090}]' },
      }]} />,
    );
    expect(html).toContain('ยืนยันบันทึก 1 รุ่น×ความจุ (4 SKU มือ 1)');
    expect(html).toContain('฿29,900.00 → ฿28,900.00');
    expect(html).toContain('฿8,990.00 → ฿6,990.00');
    expect(html).toContain('10ด 2,090');
    expect(html).toContain('ถ้ามีแถวใดผิดจะไม่บันทึกเลยสักแถว');
  });

  it('bulk panel only appears when rows are selected', () => {
    expect(renderToStaticMarkup(
      <FirstHandBulkPanel selectedCount={0} monthColumns={[10, 12]} onApply={vi.fn()} onClearSelection={vi.fn()} />,
    )).toBe('');
    const html = renderToStaticMarkup(
      <FirstHandBulkPanel selectedCount={3} monthColumns={[10, 12]} onApply={vi.fn()} onClearSelection={vi.fn()} />,
    );
    expect(html).toContain('ปรับ 3 แถวที่เลือก');
    expect(html).toContain('ราคาซื้อสด');
    expect(html).toContain('ดาวน์หลัก');
    expect(html).toContain('ค่างวด');
    expect(html).toContain('ลด (%)');
  });
});
