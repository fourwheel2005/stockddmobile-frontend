import { api } from './client';
import type { StoreProfile, UpdateStoreProfileRequest } from '@/types/api';

export const storeProfileApi = {
  get: () => api.get<StoreProfile>('/store-profile').then((response) => response.data),
  update: (request: UpdateStoreProfileRequest) =>
    api.put<StoreProfile>('/store-profile', request).then((response) => response.data),
};
