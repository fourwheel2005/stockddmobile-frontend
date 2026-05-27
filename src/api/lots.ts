import { api } from './client';
import type {
  LotInboundRequest,
  LotResponse,
  PageResponse,
  StockMovementResponse,
} from '@/types/api';

export const lotsApi = {
  list: (params: { page?: number; size?: number } = {}) =>
    api.get<PageResponse<LotResponse>>('/lots', { params }).then((r) => r.data),

  inbound: (req: LotInboundRequest) =>
    api.post<StockMovementResponse[]>('/inventory/inbound/lot', req).then((r) => r.data),
};
