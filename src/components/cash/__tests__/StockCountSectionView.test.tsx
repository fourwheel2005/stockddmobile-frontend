import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StockCountSection } from '@/components/cash/StockCountSection';
import { useBranchStore } from '@/stores/branchStore';
import type { DailyStockBalance } from '@/types/api';

const HELD = { pendingIntake: 0, reserved: 0, defective: 0, returned: 0 };
const GROUP = (expectedPhysical: number) => ({
  label: '', soldToday: 0,
  onHand: { readyToSell: expectedPhysical, expectedPhysical, held: HELD },
});
const BALANCE = {
  context: { businessDate: '2026-08-31', branchId: 'branch-main', accessoryInventoryGlobal: true },
  newDevices: GROUP(7), secondHandDevices: GROUP(38), total: GROUP(45),
  accessories: {
    chargerHeads: GROUP(6), chargingCables: GROUP(4), otherAccessories: GROUP(0), total: GROUP(10),
  },
  intakeToday: { total: 0, purchase: 0, tradeIn: 0, outright: 0, buyback: 0 },
} as DailyStockBalance;

describe('StockCountSection stock view', () => {
  it('offers drill-down for both device groups while counting physical stock', () => {
    // renderToStaticMarkup ใช้ Zustand initial snapshot จึง seed key แบบ no-branch
    // ให้ตรงกับ snapshot ที่ component เห็นใน SSR test นี้ (browser จริงใช้ active branch ปกติ).
    useBranchStore.setState({ activeBranchId: null });
    const queryClient = new QueryClient();
    queryClient.setQueryData(['daily-stock-balance', null, 'count-section'], BALANCE);
    queryClient.setQueryData(['pos', 'cashiers'], []);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <StockCountSection phaseLabel="เปิดร้าน" onChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(html).toContain('ระบบคาด <strong>7 เครื่อง');
    expect(html).toContain('ระบบคาด <strong>38 เครื่อง');
    expect(html.match(/> View</g)).toHaveLength(2);
  });
});
