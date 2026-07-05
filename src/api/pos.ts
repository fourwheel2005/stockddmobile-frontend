import { api } from './client';
import type {
  CartScanResponse,
  CheckoutRequest,
  InStockItem,
  PageResponse,
  SalesDayCount,
  SalesOrderResponse,
  SalesOrderStatus,
} from '@/types/api';

export const posApi = {
  scan: (q: string) =>
    // scan ต้องเร็ว (< 1s) — ตั้ง timeout สั้นกว่า global กันหน้าค้างนานถ้าเซิร์ฟเวอร์ไม่ตอบ
    api.get<CartScanResponse>('/pos/scan', { params: { q }, timeout: 12000 }).then((r) => r.data),

  checkout: (req: CheckoutRequest) =>
    api.post<SalesOrderResponse>('/pos/checkout', req).then((r) => r.data),

  listOrders: (params: { status?: SalesOrderStatus; branchId?: string; from?: string; to?: string; q?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<SalesOrderResponse>>('/pos/orders', { params }).then((r) => r.data),

  /** ปฏิทินยอดขาย — จำนวนบิล/ยอดต่อวัน (มาร์กวันที่มีการขาย) */
  salesCalendar: (from: string, to: string) =>
    api.get<SalesDayCount[]>('/pos/orders/calendar', { params: { from, to } }).then((r) => r.data),

  getOrder: (id: string) =>
    api.get<SalesOrderResponse>(`/pos/orders/${id}`).then((r) => r.data),

  refund: (id: string, reason?: string) =>
    api.post<SalesOrderResponse>(`/pos/orders/${id}/refund`,
      null, { params: reason ? { reason } : {} }).then((r) => r.data),

  /** รับเครื่องคืนจากลูกค้าผ่อน (ผ่อนไม่ไหว) — เครื่องเข้าสต็อก + คืนเงินตามที่ระบุ (0 = ไม่คืน) */
  returnDevice: (id: string, refundAmount: number, reason?: string) =>
    api.post<SalesOrderResponse>(`/pos/orders/${id}/return-device`,
      null, { params: { refundAmount, ...(reason ? { reason } : {}) } }).then((r) => r.data),

  inStockItems: (params: { variantId?: string; q?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<InStockItem>>('/pos/in-stock-items', { params }).then((r) => r.data),

  // ─── Q4 — Shipping partner report ─────────────────────────────────
  shippingPartnerReport: (params: { from?: string; to?: string } = {}) =>
    api.get<import('@/types/api').ShippingPartnerReport>(
      '/pos/reports/shipping-partners', { params }).then((r) => r.data),

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
