import { api } from './client';

/** แถวตารางดาวน์/ผ่อนมือ 2 ต่อ รุ่น×ความจุ (FIX-123) */
export interface InstallmentPresetResponse {
  id: string;
  productId: string;
  productName: string;
  storage: string;            // ตัวเลขล้วน เช่น "128"
  downPayment: number;
  installmentTerms: string;   // JSON [{"months":10,"monthly":1990}, ...]
  updatedAt: string;
}

export interface UpsertInstallmentPresetRequest {
  productId: string;
  storage: string;            // "128" หรือ "128GB" ก็ได้
  downPayment: number;
  installmentTerms: string;
}

export const installmentPresetsApi = {
  list: () =>
    api.get<InstallmentPresetResponse[]>('/installment-presets').then((r) => r.data),

  upsert: (req: UpsertInstallmentPresetRequest) =>
    api.put<InstallmentPresetResponse>('/installment-presets', req).then((r) => r.data),

  delete: (id: string) =>
    api.delete<void>(`/installment-presets/${id}`).then((r) => r.data),
};
