import { api } from './client';

/** แหล่งที่ซื้อ ("ซื้อมาจาก") ในหน้ารับเข้า — เพิ่มเองได้จากปุ่ม + (FIX-197) */
export interface PurchaseSourceResponse {
  id: string;
  name: string;
  active: boolean;
}

export const purchaseSourcesApi = {
  list: () =>
    api.get<PurchaseSourceResponse[]>('/purchase-sources').then((r) => r.data),

  /** idempotent — ชื่อซ้ำ (ไม่สนตัวพิมพ์) คืนรายการเดิม */
  create: (name: string) =>
    api.post<PurchaseSourceResponse>('/purchase-sources', { name }).then((r) => r.data),
};
