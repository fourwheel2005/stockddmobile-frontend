import { api } from './client';
import type {
  AdjustmentRequest,
  InboundRequest,
  InventoryResponse,
  OutboundRequest,
  PageResponse,
  SerializedItemResponse,
  ServiceActionRequest,
  StockMovementResponse,
  StockSummaryResponse,
  StockReconciliationRow,
  StockTransactionResponse,
  StockTxType,
  UpdateSerialRequest,
  DeviceServiceLogRequest,
  DeviceServiceLogResponse,
} from '@/types/api';

export const inventoryApi = {
  list: (params: { page?: number; size?: number; lowStockOnly?: boolean; condition?: 'NEW' | 'SECOND_HAND'; stockGroup?: InventoryStockGroup; branchId?: string } = {}) =>
    api.get<PageResponse<InventoryResponse>>('/inventory', { params }).then((r) => r.data),

  summary: (branchId?: string) =>
    api.get<StockSummaryResponse>('/inventory/summary', { params: { branchId } }).then((r) => r.data),

  // F-12 (FIX-135): reconciliation — serialized SKU ที่ยอด inventory ไม่ตรงจำนวน IMEI พร้อมขายจริง
  reconciliation: () =>
    api.get<StockReconciliationRow[]>('/inventory/reconciliation').then((r) => r.data),

  get: (variantId: string) =>
    api.get<InventoryResponse>(`/inventory/${variantId}`).then((r) => r.data),

  getSerials: (variantId: string, params: { status?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<SerializedItemResponse>>(`/inventory/${variantId}/serials`, { params }).then((r) => r.data),

  /** มุมมองรายเครื่อง (flat ทุกรุ่น) สำหรับหน้า Stock · productId = เฉพาะเครื่องของรุ่นนั้นทุก SKU */
  listSerials: (params: { status?: string; condition?: 'NEW' | 'SECOND_HAND'; branchId?: string; productId?: string; stockGroup?: InventoryStockGroup; q?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<SerializedItemResponse>>('/inventory/serials', { params }).then((r) => r.data),

  /** รายเครื่องที่ต้องตรงกับยอดบนการ์ดตรวจนับ: includeHeld=false พร้อมขาย, true ทุกเครื่องที่ยังอยู่จริงในร้าน */
  stockCheckDevices: (params: { condition: 'NEW' | 'SECOND_HAND'; branchId?: string; includeHeld?: boolean; q?: string; page?: number; size?: number }) =>
    api.get<PageResponse<SerializedItemResponse>>('/inventory/serials/stock-check', { params }).then((r) => r.data),

  /** suggestion เลขรุ่น + สี (distinct ที่เคยกรอก) — autocomplete ตอนรับเครื่อง */
  serialSuggestions: () =>
    api.get<{ modelNumbers: string[]; colors: string[] }>('/inventory/serials/suggestions').then((r) => r.data),

  lookupSerial: (q: string) =>
    api.get<SerializedItemResponse>('/inventory/serials/lookup', { params: { q } }).then((r) => r.data),

  getTransactions: (params: {
    variantId?: string;
    type?: StockTxType;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
  } = {}) =>
    api.get<PageResponse<StockTransactionResponse>>('/inventory/transactions', { params }).then((r) => r.data),

  inbound: (req: InboundRequest) =>
    api.post<StockMovementResponse>('/inventory/inbound', req).then((r) => r.data),

  outbound: (req: OutboundRequest) =>
    api.post<StockMovementResponse>('/inventory/outbound', req).then((r) => r.data),

  adjustment: (req: AdjustmentRequest) =>
    api.post<StockMovementResponse>('/inventory/adjustment', req).then((r) => r.data),

  sendToService: (serialItemId: string, req: ServiceActionRequest) =>
    api.post<SerializedItemResponse>(`/inventory/serials/${serialItemId}/service`, req).then((r) => r.data),

  backToStock: (serialItemId: string) =>
    api.post<SerializedItemResponse>(`/inventory/serials/${serialItemId}/back-to-stock`).then((r) => r.data),

  /** แก้ไขข้อมูลเครื่อง (IMEI/Serial/สี/แบต/สภาพ) — แก้ที่พิมพ์ผิด */
  updateSerial: (serialItemId: string, req: UpdateSerialRequest) =>
    api.put<SerializedItemResponse>(`/inventory/serials/${serialItemId}`, req).then((r) => r.data),

  /** ย้ายเครื่อง (พร้อมขาย) ไป SKU อื่นของรุ่นเดียวกัน — แก้ลงผิดมือ 1/มือ 2 */
  moveSerialToVariant: (serialItemId: string, targetVariantId: string) =>
    api.post<void>(`/inventory/serials/${serialItemId}/move-variant`, null,
      { params: { targetVariantId } }).then((r) => r.data),

  /** ย้ายเครื่องไป "รุ่นอื่น" — แก้เพิ่มผิดรุ่น · ระบบจับ SKU ปลายทางตามมือ+สี+ความจุให้เอง (FIX-120) */
  moveSerialToProduct: (serialItemId: string, targetProductId: string) =>
    api.post<void>(`/inventory/serials/${serialItemId}/move-product`, null,
      { params: { targetProductId } }).then((r) => r.data),

  // ─── ประวัติซ่อม/อะไหล่รายเครื่อง (เครื่องมือสอง) ──────────────────
  listServiceLogs: (serialItemId: string) =>
    api.get<DeviceServiceLogResponse[]>(`/inventory/serials/${serialItemId}/service-logs`).then((r) => r.data),

  addServiceLog: (serialItemId: string, req: DeviceServiceLogRequest) =>
    api.post<DeviceServiceLogResponse>(`/inventory/serials/${serialItemId}/service-logs`, req).then((r) => r.data),

  updateServiceLog: (logId: string, req: DeviceServiceLogRequest) =>
    api.put<DeviceServiceLogResponse>(`/inventory/service-logs/${logId}`, req).then((r) => r.data),

  deleteServiceLog: (logId: string) =>
    api.delete<void>(`/inventory/service-logs/${logId}`).then((r) => r.data),
};

export type InventoryStockGroup = 'DEVICE' | 'ACCESSORY' | 'CHARGER_HEAD' | 'CHARGING_CABLE' | 'OTHER_ACCESSORY';
