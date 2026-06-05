import { api } from './client';
import type {
  CartScanResponse,
  CheckoutRequest,
  InStockItem,
  PageResponse,
  SalesOrderResponse,
  SalesOrderStatus,
} from '@/types/api';

export const posApi = {
  scan: (q: string) =>
    api.get<CartScanResponse>('/pos/scan', { params: { q } }).then((r) => r.data),

  checkout: (req: CheckoutRequest) =>
    api.post<SalesOrderResponse>('/pos/checkout', req).then((r) => r.data),

  listOrders: (params: { status?: SalesOrderStatus; page?: number; size?: number } = {}) =>
    api.get<PageResponse<SalesOrderResponse>>('/pos/orders', { params }).then((r) => r.data),

  getOrder: (id: string) =>
    api.get<SalesOrderResponse>(`/pos/orders/${id}`).then((r) => r.data),

  refund: (id: string, reason?: string) =>
    api.post<SalesOrderResponse>(`/pos/orders/${id}/refund`,
      null, { params: reason ? { reason } : {} }).then((r) => r.data),

  inStockItems: (params: { variantId?: string; q?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<InStockItem>>('/pos/in-stock-items', { params }).then((r) => r.data),

  // ─── V31 — Finance Payout (ไฟแนนซ์โอนคืน) ─────────────────────────
  financePending: () =>
    api.get<SalesOrderResponse[]>('/pos/finance/pending').then((r) => r.data),
  financeConfirm: (id: string, referenceNo?: string) =>
    api.post<SalesOrderResponse>(`/pos/finance/${id}/confirm`,
      null, { params: referenceNo ? { referenceNo } : {} }).then((r) => r.data),
  financeDecline: (id: string, reason?: string) =>
    api.post<SalesOrderResponse>(`/pos/finance/${id}/decline`,
      null, { params: reason ? { reason } : {} }).then((r) => r.data),
};
