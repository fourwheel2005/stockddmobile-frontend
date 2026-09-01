import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DailyStockBalance } from '@/types/api';
import { DailyStockBalanceCard, dailyStockBalanceKey } from '../DailyStockBalanceCard';

const REPORT: DailyStockBalance = {
  context: { businessDate: '2026-08-21', branchId: 'branch-main', accessoryInventoryGlobal: true },
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
  intakeToday: { total: 3, purchase: 1, tradeIn: 1, outright: 1, buyback: 0 },
  accessories: {
    chargerHeads: {
      label: 'หัวชาร์จ', soldToday: 1,
      onHand: { readyToSell: 12, expectedPhysical: 13, held: { pendingIntake: 0, reserved: 1, defective: 0, returned: 0 } },
    },
    chargingCables: {
      label: 'สายชาร์จ', soldToday: 3,
      onHand: { readyToSell: 10, expectedPhysical: 10, held: { pendingIntake: 0, reserved: 0, defective: 0, returned: 0 } },
    },
    otherAccessories: {
      label: 'อุปกรณ์เสริมอื่น', soldToday: 0,
      onHand: { readyToSell: 5, expectedPhysical: 5, held: { pendingIntake: 0, reserved: 0, defective: 0, returned: 0 } },
    },
    total: {
      label: 'รวมอุปกรณ์เสริม', soldToday: 4,
      onHand: { readyToSell: 27, expectedPhysical: 28, held: { pendingIntake: 0, reserved: 1, defective: 0, returned: 0 } },
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

    expect(html).toContain('ตรวจนับสต็อกวันนี้');
    expect(html).toContain('21/08/2569');
    expect(html).toContain('เครื่องใหม่ (มือ 1)');
    expect(html).toContain('เครื่องมือสอง');
    expect(html.match(/ดูว่าเป็นเครื่องไหนบ้าง/g)).toHaveLength(2);
    expect(html).toContain('รอลงสต๊อก 2');
    expect(html).toContain('รวมเครื่องที่ควรพบจริง <strong class="text-slate-900">13 เครื่อง');
    expect(html).toContain('ขายวันนี้ 3 เครื่อง');
    expect(html).toContain('หัวชาร์จ');
    expect(html).toContain('13<small class="ml-1 text-xs font-medium">หัว');
    expect(html).toContain('สายชาร์จ');
    expect(html).toContain('10<small class="ml-1 text-xs font-medium">เส้น');
    expect(html).toContain('Accessory แบบนับจำนวนเป็นยอดรวมทุกสาขา');
  });
});
