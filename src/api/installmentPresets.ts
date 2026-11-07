import { api } from './client';

/** แถวตารางดาวน์/ผ่อนมือ 2 ต่อ รุ่น×ความจุ (FIX-123) */
export interface InstallmentPresetResponse {
  id: string;
  productId: string;
  productName: string;
  storage: string;            // ตัวเลขล้วน เช่น "128"
  downPayment: number;
  installmentTerms: string;   // JSON [{"months":10,"monthly":1990}, ...]
  cashPrice: number | null;   // ราคาซื้อสดมาตรฐาน (FIX-202)
  updatedAt: string;
  /** ตอบกลับการบันทึก: เครื่องมือ 2 ที่ยังไม่ขายถูกแก้ตามตารางกี่เครื่อง (FIX-213) */
  syncedDevices?: number | null;
}

export interface UpsertInstallmentPresetRequest {
  productId: string;
  storage: string;            // "128" หรือ "128GB" ก็ได้
  downPayment: number;
  installmentTerms: string;
  cashPrice?: number | null;  // ราคาซื้อสดมาตรฐาน — เว้น = ไม่ตั้ง (FIX-202)
}

export const installmentPresetsApi = {
  list: () =>
    api.get<InstallmentPresetResponse[]>('/installment-presets').then((r) => r.data),

  upsert: (req: UpsertInstallmentPresetRequest) =>
    api.put<InstallmentPresetResponse>('/installment-presets', req).then((r) => r.data),

  /** ให้เครื่องมือ 2 ที่ยังไม่ขายตามทันตารางปัจจุบันทุกแถว (FIX-213) */
  syncDevices: () =>
    api.post<{ updated: number }>('/installment-presets/sync-devices').then((r) => r.data),

  delete: (id: string) =>
    api.delete<void>(`/installment-presets/${id}`).then((r) => r.data),
};
