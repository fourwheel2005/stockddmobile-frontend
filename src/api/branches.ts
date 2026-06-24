import { api } from './client';
import type { Branch, BranchRequest } from '@/types/api';

export const branchesApi = {
  list: (includeInactive = false) =>
    api.get<Branch[]>('/branches', { params: { includeInactive } }).then((r) => r.data),

  get: (id: string) =>
    api.get<Branch>(`/branches/${id}`).then((r) => r.data),

  create: (req: BranchRequest) =>
    api.post<Branch>('/branches', req).then((r) => r.data),

  update: (id: string, req: BranchRequest) =>
    api.put<Branch>(`/branches/${id}`, req).then((r) => r.data),
};
