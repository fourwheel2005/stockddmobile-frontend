import { api } from './client';
import type {
  DailySalesPoint,
  InventoryValueResponse,
  PaymentMethodSummary,
  SalesSummaryResponse,
  TopProductRow,
  BranchSalesRow,
  AccountingReceiptReport,
  ReceiptMethodFilter,
} from '@/types/api';

interface DateRange {
  from: string;  // YYYY-MM-DD
  to: string;
}

export const reportsApi = {
  summary: (r: DateRange) =>
    api.get<SalesSummaryResponse>('/reports/sales-summary', { params: r }).then((x) => x.data),

  salesByDay: (r: DateRange) =>
    api.get<DailySalesPoint[]>('/reports/sales-by-day', { params: r }).then((x) => x.data),

  salesByBranch: (r: DateRange) =>
    api.get<BranchSalesRow[]>('/reports/sales-by-branch', { params: r }).then((x) => x.data),

  topProducts: (r: DateRange & { limit?: number }) =>
    api.get<TopProductRow[]>('/reports/top-products', { params: r }).then((x) => x.data),

  paymentMethods: (r: DateRange) =>
    api.get<PaymentMethodSummary[]>('/reports/payment-methods', { params: r }).then((x) => x.data),

  inventoryValue: () =>
    api.get<InventoryValueResponse>('/reports/inventory-value').then((x) => x.data),

  /** Excel รายงานยอดขายรายเดือนสำหรับส่งบัญชี (ADMIN/MANAGER). */
  monthlySalesExcel: (params: { month: string; branchId?: string }) =>
    api.get<Blob>('/reports/monthly-sales.xlsx', { params, responseType: 'blob' })
      .then((x) => x.data),

  /** สรุปใบเสร็จ + รายจ่ายส่งบัญชี (ADMIN/MANAGER) — rows ถูกจำกัดตาม limit แต่ยอดรวมครบทุกบรรทัด. */
  accountingReceipts: (params: AccountingReceiptParams & { limit?: number }) =>
    api.get<AccountingReceiptReport>('/reports/accounting-receipts', { params: compactParams(params) })
      .then((x) => x.data),

  /** Excel ใบเสร็จส่งบัญชี — โครงเดียวกับไฟล์รายงานใบเสร็จของบัญชี พร้อมโลโก้ร้าน. */
  accountingReceiptsExcel: (params: AccountingReceiptParams) =>
    api.get<Blob>('/reports/accounting-receipts.xlsx', { params: compactParams(params), responseType: 'blob' })
      .then((x) => x.data),
};

export interface AccountingReceiptParams {
  from: string;
  to: string;
  branchId?: string;
  method?: ReceiptMethodFilter | null;
}

/** ตัด key ที่เป็น null/undefined ออก ไม่ให้ axios ส่ง `method=null` ไป backend */
function compactParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value != null)) as Partial<T>;
}
