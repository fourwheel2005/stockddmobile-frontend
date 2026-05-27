import { api } from './client';
import type {
  AdjustmentRequest,
  InboundRequest,
  InventoryResponse,
  OutboundRequest,
  PageResponse,
  SerializedItemResponse,
  StockMovementResponse,
  StockTransactionResponse,
  StockTxType,
} from '@/types/api';

export const inventoryApi = {
  list: (params: { page?: number; size?: number; lowStockOnly?: boolean } = {}) =>
    api.get<PageResponse<InventoryResponse>>('/inventory', { params }).then((r) => r.data),

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
};
