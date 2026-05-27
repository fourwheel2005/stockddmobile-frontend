import { api } from './client';
import type {
  Category,
  CreateProductRequest,
  CreateVariantRequest,
  PageResponse,
  ProductDetail,
  ProductSummary,
  VariantResponse,
} from '@/types/api';

export const productsApi = {
  list: (params: { page?: number; size?: number; categoryId?: string; active?: boolean } = {}) =>
    api.get<PageResponse<ProductSummary>>('/products', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<ProductDetail>(`/products/${id}`).then((r) => r.data),

  create: (req: CreateProductRequest) =>
    api.post<ProductDetail>('/products', req).then((r) => r.data),

  update: (id: string, req: CreateProductRequest & { active: boolean }) =>
    api.put<ProductDetail>(`/products/${id}`, req).then((r) => r.data),

  deactivate: (id: string) =>
    api.delete<void>(`/products/${id}`).then((r) => r.data),

  addVariant: (productId: string, req: CreateVariantRequest) =>
    api.post<VariantResponse>(`/products/${productId}/variants`, req).then((r) => r.data),

  lookupVariant: (q: string) =>
    api.get<VariantResponse>('/products/variants/lookup', { params: { q } }).then((r) => r.data),
};

export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
};
