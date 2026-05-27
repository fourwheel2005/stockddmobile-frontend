import { api } from './client';
import type { Customer, CustomerRequest, PageResponse } from '@/types/api';

export const customersApi = {
  list: (params: { q?: string; page?: number; size?: number } = {}) =>
    api.get<PageResponse<Customer>>('/customers', { params }).then((r) => r.data),

  get: (id: string) => api.get<Customer>(`/customers/${id}`).then((r) => r.data),

  create: (req: CustomerRequest) =>
    api.post<Customer>('/customers', req).then((r) => r.data),

  update: (id: string, req: CustomerRequest) =>
    api.put<Customer>(`/customers/${id}`, req).then((r) => r.data),

  delete: (id: string) => api.delete<void>(`/customers/${id}`).then((r) => r.data),
};
