import { api } from './client';
import type { WarrantyLookup } from '@/types/api';

export const warrantyApi = {
  lookup: (query: string) =>
    api.get<WarrantyLookup>(`/warranty/${encodeURIComponent(query)}`).then((r) => r.data),
};
