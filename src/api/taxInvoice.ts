import { api } from './client';

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
  customerTaxId: string;
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
  netTotal: number;    // รวมเงินทั้งสิ้น (ลูกค้าจ่าย — รวม VAT)
  vat: number;         // ถอดใน 7/107
  subTotal: number;    // มูลค่าสินค้าก่อน VAT
  bahtText: string;    // จำนวนเงินตัวอักษร
  paymentMethod: string | null;
  cashier: string;
}

export interface IssueTaxInvoiceRequest {
  customerName: string;
  customerTaxId: string;   // 13 หลัก
  customerAddress: string;
}

export const taxInvoiceApi = {
  /** ออกใบกำกับ (ออกแล้วขอซ้ำ = ได้ใบเดิม) */
  issue: (orderId: string, req: IssueTaxInvoiceRequest) =>
    api.post<TaxInvoiceData>(`/pos/orders/${orderId}/tax-invoice`, req).then((r) => r.data),

  /** ใบที่ออกแล้ว (พิมพ์ซ้ำ) — 404 ถ้ายังไม่ออก */
  get: (orderId: string) =>
    api.get<TaxInvoiceData>(`/pos/orders/${orderId}/tax-invoice`).then((r) => r.data),
};
