import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InventoryPage } from '@/pages/InventoryPage';
import { useBranchStore } from '@/stores/branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { StockSummaryResponse } from '@/types/api';

const SUMMARY: StockSummaryResponse = {
  totalAvailable: 70,
  newAvailable: 26,
  secondHandAvailable: 44,
  totalAccessoriesAvailable: 23,
  chargerHeadsAvailable: 12,
  chargingCablesAvailable: 8,
  otherAccessoriesAvailable: 3,
  accessoryInventoryGlobal: true,
};

describe('InventoryPage stock separation', () => {
  it('labels device totals separately from charger, cable and other accessory totals', () => {
    useBranchStore.setState({ activeBranchId: null });
    useAuthStore.setState({ user: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['inventory-summary', null], SUMMARY);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <InventoryPage />
      </QueryClientProvider>,
    );

    expect(html).toContain('เครื่อง — ไม่รวมอุปกรณ์เสริม');
    expect(html).toContain('พร้อมขายทั้งหมด');
    expect(html).toContain('มือ 1 (ใหม่)');
    expect(html).toContain('มือ 2 (มือสอง)');
    expect(html.match(/ดูว่าเหลือเครื่องไหนบ้าง/g)).toHaveLength(2);
    expect(html).toContain('อุปกรณ์เสริม — รวม 23 ชิ้น');
    expect(html).toContain('หัวชาร์จ');
    expect(html).toContain('สายชาร์จ');
    expect(html).toContain('อุปกรณ์เสริมอื่น');
    expect(html).toContain('อุปกรณ์เสริม');
  });
});
