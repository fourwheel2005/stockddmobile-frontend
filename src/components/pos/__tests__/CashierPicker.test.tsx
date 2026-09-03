import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CashierPicker } from '../CashierPicker';

describe('CashierPicker', () => {
  it('shows seeded cashiers, current selection and the add-name action', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['pos', 'cashiers'], [
      { id: 'cashier-1', name: 'ปัณณพัฒน์' },
      { id: 'cashier-2', name: 'อุดมพร' },
    ]);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CashierPicker selectedId="cashier-2" onSelect={() => undefined} />
      </QueryClientProvider>,
    );

    expect(html).toContain('ผู้รับเงินบนใบเสร็จ');
    expect(html).toContain('ปัณณพัฒน์');
    expect(html).toContain('อุดมพร');
    expect(html).toContain('lucide-check');
    expect(html).toContain('เพิ่มชื่อ');
    expect(html).toContain('aria-checked="true"');
  });
});
