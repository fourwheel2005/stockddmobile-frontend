import { api } from './client';
import type {
  CartScanResponse,
  CashierProfile,
  CheckoutRequest,
  InStockItem,
  PageResponse,
  SalesDayCount,
  SalesOrderResponse,
  SalesOrderStatus,
  SavedShippingAddress,
  ShippingAddressInput,
  TradeInProductResponse,
} from '@/types/api';

export const posApi = {
  scan: (q: string) =>
    // scan ต้องเร็ว (< 1s) — ตั้ง timeout สั้นกว่า global กันหน้าค้างนานถ้าเซิร์ฟเวอร์ไม่ตอบ
    api.get<CartScanResponse>('/pos/scan', { params: { q }, timeout: 12000 }).then((r) => r.data),

  checkout: (req: CheckoutRequest) =>
    api.post<SalesOrderResponse>('/pos/checkout', req).then((r) => r.data),

  listCashiers: () =>
    api.get<CashierProfile[]>('/pos/cashiers').then((r) => r.data),

  createCashier: (name: string) =>
    api.post<CashierProfile>('/pos/cashiers', { name }).then((r) => r.data),

  /** ลบชื่อผู้รับเงิน (soft delete — บิลเก่าไม่กระทบ) */
  deleteCashier: (id: string) =>
    api.delete(`/pos/cashiers/${id}`).then(() => undefined),

  searchShippingAddresses: (q = '', page = 0, size = 20) =>
    api.get<PageResponse<SavedShippingAddress>>('/pos/shipping-addresses', {
      params: { q, page, size },
    }).then((r) => r.data),

  rememberShippingAddress: (recipient: ShippingAddressInput) =>
    api.post<SavedShippingAddress>('/pos/shipping-addresses', recipient).then((r) => r.data),

  /** รุ่นเครื่องที่ลูกค้านำมา — catalog only, ไม่อ่าน Stock/SKU. */
  searchTradeInProducts: (q: string, page = 0, size = 20) =>
    api.get<PageResponse<TradeInProductResponse>>('/pos/trade-in-products/search', {
      params: { q, page, size },
    }).then((r) => r.data),

  /** รับชำระค่างวด (เงินสด) — ออกบิลโดยไม่ตัดสต็อก, ไม่ผูกตารางงวดผ่อน (FIX-085) */
  collectInstallment: (req: {
    amount: number;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    note?: string;
    branchId?: string;
    cashierProfileId?: string;
  }) =>
    api.post<SalesOrderResponse>('/pos/installment-collection', req).then((r) => r.data),

  listOrders: (params: { status?: SalesOrderStatus; branchId?: string; from?: string; to?: string; q?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<SalesOrderResponse>>('/pos/orders', { params }).then((r) => r.data),

  /** ปฏิทินยอดขาย — จำนวนบิล/ยอดต่อวัน (มาร์กวันที่มีการขาย) */
  salesCalendar: (from: string, to: string) =>
    api.get<SalesDayCount[]>('/pos/orders/calendar', { params: { from, to } }).then((r) => r.data),

  getOrder: (id: string) =>
    api.get<SalesOrderResponse>(`/pos/orders/${id}`).then((r) => r.data),

  updateSaleDate: (id: string, saleDate: string, reason: string, securityCode: string) =>
    api.patch<SalesOrderResponse>(`/pos/orders/${id}/sale-date`,
      { saleDate, reason }, { headers: { 'X-Security-Code': securityCode } }).then((r) => r.data),

  /** ยกเลิก/คืนเงินบิลที่ขายไปแล้ว — ต้องมีรหัสความปลอดภัยของร้านทุก role (FIX-103) */
  refund: (id: string, securityCode: string, reason?: string) =>
    api.post<SalesOrderResponse>(`/pos/orders/${id}/refund`,
      null, {
        params: reason ? { reason } : {},
        headers: { 'X-Security-Code': securityCode },
      }).then((r) => r.data),

  /** แก้ทุนย้อนหลังของบรรทัดพิมพ์เอง (รหัสทุนผิดตอนปิดบิล → ทุนว่าง) — ADMIN/MANAGER (FIX-110) */
  updateCustomLineCost: (orderId: string, itemId: string, unitCostCode: string) =>
    api.patch<SalesOrderResponse>(`/pos/orders/${orderId}/items/${itemId}/unit-cost`,
      null, { params: { unitCostCode } }).then((r) => r.data),

  /** FIX-143: บิลผ่อน (PAID) ของเครื่องนี้ — null = ไม่มี (ให้หน้า device โชว์ปุ่มรับเครื่องคืนได้) */
  findInstallmentBySerial: (serialItemId: string) =>
    api.get<SalesOrderResponse | null>(`/pos/orders/by-serial/${serialItemId}/installment`).then((r) => r.data),

  /** รับเครื่องคืนจากลูกค้าผ่อน (ผ่อนไม่ไหว) — เครื่องเข้าสต็อก + คืนเงินตามที่ระบุ (0 = ไม่คืน) */
  returnDevice: (id: string, refundAmount: number, securityCode: string, reason?: string) =>
    api.post<SalesOrderResponse>(`/pos/orders/${id}/return-device`,
      null, {
        params: { refundAmount, ...(reason ? { reason } : {}) },
        headers: { 'X-Security-Code': securityCode },
      }).then((r) => r.data),

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
