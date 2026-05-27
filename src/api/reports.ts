import { api } from './client';
import type {
  DailySalesPoint,
  InventoryValueResponse,
  PaymentMethodSummary,
  SalesSummaryResponse,
  TopProductRow,
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

  topProducts: (r: DateRange & { limit?: number }) =>
    api.get<TopProductRow[]>('/reports/top-products', { params: r }).then((x) => x.data),

  paymentMethods: (r: DateRange) =>
    api.get<PaymentMethodSummary[]>('/reports/payment-methods', { params: r }).then((x) => x.data),

  inventoryValue: () =>
    api.get<InventoryValueResponse>('/reports/inventory-value').then((x) => x.data),
};
