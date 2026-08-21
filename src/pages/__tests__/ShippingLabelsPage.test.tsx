import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { navItems } from '@/components/AppShell';
import { ShippingLabelForm } from '@/components/shipping/ShippingLabelForm';
import { ShippingLabelsPage } from '@/pages/ShippingLabelsPage';

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('ShippingLabelsPage', () => {
  it('is available from the sidebar for every POS role', () => {
    const item = navItems.find((nav) => nav.to === '/shipping-labels');

    expect(item?.label).toBe('พิมพ์ใบจัดส่ง');
    expect(item?.roles).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
  });

  it('shows the standalone 100x150 workflow and the same saved-address picker', () => {
    const html = renderWithQuery(<ShippingLabelsPage />);

    expect(html).toContain('พิมพ์ใบจัดส่ง');
    expect(html).toContain('รูปแบบเดียวกับหน้า POS');
    expect(html).toContain('กว้าง 100 × ยาว 150 มม.');
    expect(html).toContain('เลือกจากสมุดที่อยู่');
    expect(html).toContain('TSC TTP-247');
  });

  it('uses the shared POS form with the fixed sender and recipient fields', () => {
    const html = renderWithQuery(
      <ShippingLabelForm
        initialRecipient={{
          name: 'ผู้รับทดสอบ',
          phone: '0812345678',
          address: '99/9 สมุทรสงคราม 75000',
        }}
        reference="INV-TEST"
        onPrinted={vi.fn()}
      />,
    );

    expect(html).toContain('ดีดีโมบาย');
    expect(html).toContain('734/51 ต.แม่กลอง อ.เมือง');
    expect(html).toContain('088-818-8385');
    expect(html).toContain('ผู้รับทดสอบ');
    expect(html).toContain('99/9 สมุทรสงคราม 75000');
    expect(html).toContain('พิมพ์ใบจัดส่ง 10×15');
  });
});
