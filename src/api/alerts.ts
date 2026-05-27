import { api } from './client';
import type { AlertStatus, LowStockAlertResponse, PageResponse } from '@/types/api';

export const alertsApi = {
  list: (params: { status?: AlertStatus; page?: number; size?: number } = {}) =>
    api.get<PageResponse<LowStockAlertResponse>>('/alerts/low-stock', { params }).then((r) => r.data),

  acknowledge: (id: string) =>
    api.patch<LowStockAlertResponse>(`/alerts/low-stock/${id}/acknowledge`).then((r) => r.data),
};
