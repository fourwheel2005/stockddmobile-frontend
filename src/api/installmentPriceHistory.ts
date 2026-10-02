import { api } from './client';

/** 1 ครั้งที่ราคาซื้อสด/ดาวน์/ค่างวดของ รุ่น×ความจุ ถูกตั้ง (FIX-202) */
export interface InstallmentPriceHistoryItem {
  id: string;
  conditionGroup: 'NEW' | 'SECOND_HAND';
  cashPrice: number | null;
  downPayment: number | null;
  installmentTerms: string | null;   // JSON [{months, monthly, down?}]
  source: string | null;             // FIRSTHAND_TABLE / SECONDHAND_TABLE / SKU_EDIT:<sku>
  changedBy: string | null;
  changedAt: string;
}

export const installmentPriceHistoryApi = {
  list: (params: { productId: string; storage: string; condition: 'NEW' | 'SECOND_HAND' }) =>
    api.get<InstallmentPriceHistoryItem[]>('/installment-price-history', { params }).then((r) => r.data),
};
