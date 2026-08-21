import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DailyStockBalance } from '@/types/api';
import { DailyStockBalanceCard, dailyStockBalanceKey } from '../DailyStockBalanceCard';

const REPORT: DailyStockBalance = {
  context: { businessDate: '2026-08-21', branchId: 'branch-main' },
  newDevices: {
    label: 'เครื่องใหม่ (มือ 1)', soldToday: 2,
    onHand: {
      readyToSell: 5, expectedPhysical: 6,
      held: { pendingIntake: 0, reserved: 1, defective: 0, returned: 0 },
    },
  },
  secondHandDevices: {
    label: 'เครื่องมือสอง', soldToday: 1,
    onHand: {
      readyToSell: 4, expectedPhysical: 7,
      held: { pendingIntake: 2, reserved: 0, defective: 1, returned: 0 },
    },
  },
  total: {
    label: 'รวมทั้งหมด', soldToday: 3,
    onHand: {
      readyToSell: 9, expectedPhysical: 13,
      held: { pendingIntake: 2, reserved: 1, defective: 1, returned: 0 },
    },
  },
};

describe('DailyStockBalanceCard', () => {
  it('shows new, second-hand, sold and expected physical counts for the selected branch', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(dailyStockBalanceKey('branch-main'), REPORT);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <DailyStockBalanceCard branchId="branch-main" />
      </QueryClientProvider>,
    );

    expect(html).toContain('ตรวจนับเครื่องวันนี้');
    expect(html).toContain('21/08/2569');
    expect(html).toContain('เครื่องใหม่ (มือ 1)');
    expect(html).toContain('เครื่องมือสอง');
    expect(html).toContain('รอลงสต๊อก 2');
    expect(html).toContain('รวมควรพบจริง <strong class="text-slate-900">13 เครื่อง');
    expect(html).toContain('ขายวันนี้ 3 เครื่อง');
  });
});
