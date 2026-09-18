import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DrawerReconciliationCard } from '@/components/cash/DrawerReconciliationCard';
import type { CashMovementLine } from '@/types/api';

const line = (partial: Partial<CashMovementLine> & Pick<CashMovementLine, 'id' | 'type' | 'amount'>): CashMovementLine => ({
  displayAmount: partial.amount, paidFrom: 'REGISTER', referenceType: 'SALES_ORDER', referenceNo: null,
  note: null, createdBy: 'a', createdAt: '2026-09-18T01:00:00Z', ...partial,
});

describe('DrawerReconciliationCard', () => {
  it('shows float, cash sales and payouts as separate lines that add up to the drawer balance', () => {
    const html = renderToStaticMarkup(
      <DrawerReconciliationCard
        accountingCashTotal={12800}
        movements={[
          line({ id: '1', type: 'OPENING_FLOAT', amount: 1000, referenceType: 'SESSION' }),
          line({ id: '2', type: 'SALE_CASH', amount: 12800 }),
          line({ id: '3', type: 'SALE_TRANSFER', amount: 0, displayAmount: 5000, paidFrom: 'CUSTOMER' }),
          line({ id: '4', type: 'SALE_CASH', amount: 100, note: 'ค่างวด งวดที่ 2' }),
          line({ id: '5', type: 'PAYOUT_SHIPPING', amount: -90 }),
        ]} />,
    );
    expect(html).toContain('เงินทอนตั้งต้นตอนเปิดเก๊ะ');
    expect(html).toContain('ขายหน้าร้าน รับเป็นเงินสด');
    expect(html).toContain('ค่างวดผ่อน รับเป็นเงินสด');
    expect(html).toContain('จ่ายออกจากเก๊ะ');
    expect(html).toContain('฿13,810.00');            // 1000 + 12800 + 100 − 90
    expect(html).toContain('ขายรับโอน (เข้าบัญชีร้าน)');
    expect(html).not.toContain('การ์ด &quot;สรุปยอดขายตามวันที่บัญชี&quot; นับเงินสด'); // ขายสด 12,800 ตรงกับบัญชี → ไม่เตือน
  });

  it('warns when accounting cash differs from cash that physically entered the drawer', () => {
    const html = renderToStaticMarkup(
      <DrawerReconciliationCard accountingCashTotal={15000}
        movements={[line({ id: '1', type: 'SALE_CASH', amount: 12800 })]} />,
    );
    expect(html).toContain('ต่างกัน');
    expect(html).toContain('฿2,200.00');
  });
});
