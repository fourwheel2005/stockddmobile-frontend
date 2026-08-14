import { api } from './client';

export type TaxBuyerType = 'INDIVIDUAL' | 'VAT_REGISTERED';

/** ใบกำกับภาษีเต็มรูปแบบ (FIX-150) — mirror ของ TaxInvoiceDataResponse ฝั่ง backend */
export interface TaxInvoiceData {
  company: {
    legalName: string;
    branchLabel: string;
    address: string;
    taxId: string;
    phone: string;
  };
  taxInvoiceNo: string;
  issuedAt: string;
  billNo: string;
  customerName: string;
  customerTaxId: string | null;
  customerType: TaxBuyerType | null;
  customerBranchCode: string | null;
  customerAddress: string;
  items: Array<{
    seq: number;
    sku: string | null;
    productName: string;
    imei: string | null;
    serialNumber: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  total: number;       // รวมราคาสินค้า
  discount: number;
  shipping: number;    // ค่าจัดส่ง (QA FIX-151 — ให้เลข tie: NET = TOTAL − DISCOUNT + SHIPPING)
  netTotal: number;    // รวมเงินทั้งสิ้น (ลูกค้าจ่าย — รวม VAT)
  vat: number;         // ถอดใน 7/107
  subTotal: number;    // มูลค่าสินค้าก่อน VAT
  bahtText: string;    // จำนวนเงินตัวอักษร
  paymentMethod: string | null;
  cashier: string;
}

export interface IssueTaxInvoiceRequest {
  buyerType: TaxBuyerType;
  customerName: string;
  customerTaxId?: string;  // ผู้ซื้อจด VAT บังคับ 13 หลัก; บุคคลทั่วไปเว้นได้
  customerBranchCode?: string; // 00000 = สำนักงานใหญ่; อื่นๆ = สาขา 5 หลัก
  customerAddress: string;
}

export function isValidTaxInvoiceBuyer(req: IssueTaxInvoiceRequest): boolean {
  if (!req.customerName.trim() || !req.customerAddress.trim()) return false;
  const taxId = req.customerTaxId?.trim() ?? '';
  if (taxId !== '' && !/^\d{13}$/.test(taxId)) return false;
  if (req.buyerType === 'VAT_REGISTERED') {
    return /^\d{13}$/.test(taxId) && /^\d{5}$/.test(req.customerBranchCode ?? '');
  }
  return true;
}

export const taxInvoiceApi = {
  /** ออกใบกำกับ (ออกแล้วขอซ้ำ = ได้ใบเดิม) */
  issue: (orderId: string, req: IssueTaxInvoiceRequest) =>
    api.post<TaxInvoiceData>(`/pos/orders/${orderId}/tax-invoice`, req).then((r) => r.data),

  /** ใบที่ออกแล้ว (พิมพ์ซ้ำ) — 404 ถ้ายังไม่ออก */
  get: (orderId: string) =>
    api.get<TaxInvoiceData>(`/pos/orders/${orderId}/tax-invoice`).then((r) => r.data),
};
