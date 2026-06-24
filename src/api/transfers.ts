import { api } from './client';
import type { Transfer, CreateTransferRequest, TransferStatus } from '@/types/api';

export const transfersApi = {
  list: (status?: TransferStatus) =>
    api.get<Transfer[]>('/transfers', { params: status ? { status } : {} }).then((r) => r.data),

  get: (id: string) =>
    api.get<Transfer>(`/transfers/${id}`).then((r) => r.data),

  create: (req: CreateTransferRequest) =>
    api.post<Transfer>('/transfers', req).then((r) => r.data),

  receive: (id: string) =>
    api.post<Transfer>(`/transfers/${id}/receive`).then((r) => r.data),

  cancel: (id: string) =>
    api.post<Transfer>(`/transfers/${id}/cancel`).then((r) => r.data),
};
