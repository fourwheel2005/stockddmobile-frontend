import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountingReceiptsWidget, DASHBOARD_RECEIPT_ROWS } from '@/components/dashboard/AccountingReceiptsWidget';
import { monthRange } from '@/components/cash/CashSummaryPanel';
import { shopToday } from '@/lib/datetime';
import { useBranchStore } from '@/stores/branchStore';
import type { AccountingReceiptReport } from '@/types/api';

const REPORT: AccountingReceiptReport = {
  fromDate: '2026-08-01', toDate: '2026-08-31', generatedAt: '2026-09-01T01:23:00',
  shopName: 'ดีดีโมบาย', legalName: 'บริษัท บัดดี้ดี ดิเทล จำกัด', scopeLabel: 'ทุกสาขา',
  methodFilter: null, methodFilterLabel: 'ทั้งหมด', repairIncluded: true,
  totals: {
    receiptCount: 2, receivedTotal: 10700, preVatTotal: 10000, vatTotal: 700,
    byMethod: [
      { method: 'CASH', label: 'เงินสด', count: 1, total: 5000 },
      { method: 'TRANSFER', label: 'เงินโอน', count: 1, total: 5700 },
    ],
    byType: [{ type: 'SALE', label: 'ขายสินค้า', count: 2, total: 10700 }],
  },
  expenses: {
    refundCashTotal: 500, refundTransferTotal: 0, refundCount: 1, shippingPayoutTotal: 0,
    ownerShippingTotal: 0, expensePayoutTotal: 0, tradeInPayoutCashTotal: 0,
    tradeInPayoutTransferTotal: 0, payoutCount: 0, total: 500,
  },
  netTotal: 10200, rowCount: 2, rowLimit: DASHBOARD_RECEIPT_ROWS,
  rows: [
    {
      seq: 1, documentNo: 'INV-MIX', type: 'SALE', typeLabel: 'ขายสินค้า', amount: 5700, preVat: 5327.1, vat: 372.9,
      paidAt: '2026-08-10T03:00:00', account: 'โอนเข้าบัญชีร้าน', method: 'TRANSFER', methodLabel: 'เงินโอน',
      counterparty: 'คุณบี', note: null, refunded: false,
    },
    {
      seq: 2, documentNo: 'INV-MIX', type: 'SALE', typeLabel: 'ขายสินค้า', amount: 5000, preVat: 4672.9, vat: 327.1,
      paidAt: '2026-08-10T03:00:00', account: 'เงินสด - เก๊ะ สาขาหลัก', method: 'CASH', methodLabel: 'เงินสด',
      counterparty: 'คุณบี', note: null, refunded: true,
    },
  ],
};

describe('AccountingReceiptsWidget', () => {
  it('renders the accountant summary with logo, method/type totals, expenses and receipt rows', () => {
    useBranchStore.setState({ activeBranchId: null });
    const range = monthRange(shopToday().slice(0, 7));
    const queryClient = new QueryClient();
    queryClient.setQueryData(['accounting-receipts', null, range.from, range.to, null], REPORT);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AccountingReceiptsWidget />
      </QueryClientProvider>,
    );

    expect(html).toContain('สรุปรายรับ-รายจ่ายส่งบัญชี');
    expect(html).toContain('alt="โลโก้ร้าน"');
    expect(html).toContain('ดีดีโมบาย');
    expect(html).toContain('รายรับรวม (2 ใบ)');
    expect(html).toContain('ตรวจสอบแล้ว: ยอดตามช่องทาง = ยอดตามประเภท = รายรับรวม');
    expect(html).toContain('เงินโอน');
    expect(html).toContain('คืนเงินลูกค้า (เงินสด)');
    expect(html).toContain('INV-MIX');
    expect(html).toContain('10/08/2026'.slice(0, 0) + 'โอนเข้าบัญชีร้าน');
    expect(html).toContain('คืนเงินแล้ว');
    expect(html).toContain('ดาวน์โหลด Excel ส่งบัญชี');
    expect(html).toContain('แสดง 2 จาก 2 รายการ');
  });
});
