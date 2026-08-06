import { api } from './client';
import type {
  FirstHandInstallmentRow,
  UpsertFirstHandInstallmentRequest,
} from '@/types/api';

/**
 * F-มือ1 (FIX-138): ตารางผ่อนมือ 1 — ตั้งค่าผ่อนต่อ รุ่น×ความจุ เขียนลง SKU มือ 1 (ProductVariant)
 * ที่เว็บหน้าร้านอ่านอยู่แล้ว (ไม่มี preset table แยก).
 */
export const firstHandInstallmentApi = {
  list: () =>
    api.get<FirstHandInstallmentRow[]>('/firsthand-installment').then((r) => r.data),
  upsert: (req: UpsertFirstHandInstallmentRequest) =>
    api.put<{ updated: number }>('/firsthand-installment', req).then((r) => r.data),
};
