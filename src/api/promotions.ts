import { api } from './client';
import type { PromotionPreview, PromotionRequest, PromotionResponse, RunningPromotion } from '@/types/api';

/** โปรโมชันราคารายรุ่น (FIX-217) — ADMIN/MANAGER */
export const promotionsApi = {
  list: () => api.get<PromotionResponse[]>('/promotions').then((r) => r.data),

  /** โปรที่กำลังทำงาน — ป้ายในตารางผ่อน/หน้าสินค้า */
  running: () => api.get<RunningPromotion[]>('/promotions/running').then((r) => r.data),

  /** id = โปรที่กำลังแก้ (ไม่นับตัวเองเป็นโปรชนกัน) */
  preview: (req: PromotionRequest, id?: string) =>
    api.post<PromotionPreview>('/promotions/preview', req, { params: id ? { id } : {} }).then((r) => r.data),

  create: (req: PromotionRequest) => api.post<PromotionResponse>('/promotions', req).then((r) => r.data),

  update: (id: string, req: PromotionRequest) =>
    api.put<PromotionResponse>(`/promotions/${id}`, req).then((r) => r.data),

  remove: (id: string) => api.delete(`/promotions/${id}`),
};

export const PROMOTIONS_QUERY_KEY = ['promotions'] as const;
export const RUNNING_PROMOTIONS_QUERY_KEY = ['promotions', 'running'] as const;
