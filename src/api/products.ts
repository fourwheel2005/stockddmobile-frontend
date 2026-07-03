import { api } from './client';
import type {
  AddVariantWithStockRequest,
  Category,
  CreateProductRequest,
  CreateVariantRequest,
  PageResponse,
  ProductDetail,
  ProductSummary,
  ProductWizardRequest,
  UpdateVariantRequest,
  VariantResponse,
} from '@/types/api';

export const productsApi = {
  list: (params: { page?: number; size?: number; categoryId?: string; active?: boolean } = {}) =>
    api.get<PageResponse<ProductSummary>>('/products', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<ProductDetail>(`/products/${id}`).then((r) => r.data),

  create: (req: CreateProductRequest) =>
    api.post<ProductDetail>('/products', req).then((r) => r.data),

  /** One-page wizard — สร้าง Product + Variant + รับสต็อกครั้งแรก ในธุรกรรมเดียว (atomic) */
  createWizard: (req: ProductWizardRequest) =>
    api.post<ProductDetail>('/products/wizard', req).then((r) => r.data),

  update: (id: string, req: CreateProductRequest & { active: boolean }) =>
    api.put<ProductDetail>(`/products/${id}`, req).then((r) => r.data),

  deactivate: (id: string) =>
    api.delete<void>(`/products/${id}`).then((r) => r.data),

  addVariant: (productId: string, req: CreateVariantRequest) =>
    api.post<VariantResponse>(`/products/${productId}/variants`, req).then((r) => r.data),

  /** แก้ไข SKU ที่มีอยู่ (สี/ความจุ/ราคา/barcode) — แก้ที่พิมพ์ผิด */
  updateVariant: (productId: string, variantId: string, req: UpdateVariantRequest) =>
    api.put<VariantResponse>(`/products/${productId}/variants/${variantId}`, req).then((r) => r.data),

  /** ปิดใช้งานรุ่นย่อย (soft-delete) — ลบตัวที่กรอกผิด · force=true ลบเครื่องพร้อมขายที่ยังไม่เคยขายออกด้วย */
  deactivateVariant: (productId: string, variantId: string, force = false) =>
    api.delete(`/products/${productId}/variants/${variantId}`, { params: { force } }).then((r) => r.data),

  /** เพิ่ม SKU ใหม่ใน Product เดิม + รับสต็อกล็อตแรก (Clone Flow — atomic). */
  addVariantWithStock: (productId: string, req: AddVariantWithStockRequest) =>
    api.post<VariantResponse>(`/products/${productId}/variants-with-stock`, req).then((r) => r.data),

  lookupVariant: (q: string) =>
    api.get<VariantResponse>('/products/variants/lookup', { params: { q } }).then((r) => r.data),

  /** รหัสสินค้า running ตัวถัดไป (DDxxxxx) */
  nextSku: () =>
    api.get<{ sku: string }>('/products/variants/next-sku').then((r) => r.data),

  /** Fuzzy search — Unified Receive Page */
  searchVariants: (q: string, page = 0, size = 20) =>
    api
      .get<import('@/types/api').PageResponse<VariantResponse>>('/products/variants/search', {
        params: { q, page, size },
      })
      .then((r) => r.data),
};

export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
};
