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
  StockTransactionResponse,
  StockTxType,
  UpdateSerialRequest,
} from '@/types/api';

export const inventoryApi = {
  list: (params: { page?: number; size?: number; lowStockOnly?: boolean; condition?: 'NEW' | 'SECOND_HAND' } = {}) =>
    api.get<PageResponse<InventoryResponse>>('/inventory', { params }).then((r) => r.data),

  summary: () =>
    api.get<StockSummaryResponse>('/inventory/summary').then((r) => r.data),

  get: (variantId: string) =>
    api.get<InventoryResponse>(`/inventory/${variantId}`).then((r) => r.data),

  getSerials: (variantId: string, params: { status?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<SerializedItemResponse>>(`/inventory/${variantId}/serials`, { params }).then((r) => r.data),

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
};
