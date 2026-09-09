import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ADD_NEW_SOURCE_OPTION, PurchaseSourcePicker } from '@/components/receive/PurchaseSourcePicker';

const render = (value: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PurchaseSourcePicker value={value} onChange={vi.fn()} />
    </QueryClientProvider>,
  );
};

describe('PurchaseSourcePicker', () => {
  it('is optional: offers an empty choice and a plus-to-add entry', () => {
    const html = render('');

    expect(html).toContain('— ไม่ระบุ —');
    expect(html).toContain(`value="${ADD_NEW_SOURCE_OPTION}"`);
    expect(html).toContain('+ เพิ่มแหล่งซื้อใหม่');
    expect(html).toContain('title="เพิ่มแหล่งซื้อใหม่"');
    expect(html).not.toContain('required');
  });

  it('keeps a value that is not in the master list selectable', () => {
    const html = render('ร้านเก่าที่ปิดไปแล้ว');

    expect(html).toContain('<option value="ร้านเก่าที่ปิดไปแล้ว" selected="">ร้านเก่าที่ปิดไปแล้ว</option>');
  });
});
