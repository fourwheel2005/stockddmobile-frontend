import { api } from './client';
import type { TaxBuyerType } from './taxInvoice';
import type { RefundMethod } from '@/types/api';

export interface CreditNoteData {
  company: { legalName: string; branchLabel: string; address: string; taxId: string; phone: string };
  creditNoteNo: string;
  issuedAt: string;
  originalTaxInvoiceNo: string;
  originalTaxInvoiceIssuedAt: string;
  billNo: string;
  reason: string;
  customerName: string;
  customerTaxId: string | null;
  customerType: TaxBuyerType | null;
  customerBranchCode: string | null;
  customerAddress: string;
  items: Array<{
    seq: number; sku: string | null; productName: string; imei: string | null;
    serialNumber: string | null; quantity: number; unitPrice: number; lineTotal: number;
  }>;
  originalValue: number;
  correctValue: number;
  difference: number;
  vatAmount: number;
  subtotalDifference: number;
  bahtText: string;
  paymentMethod: string | null;
  issuedBy: string;
}

export const creditNoteApi = {
  issueAndRefund: (orderId: string, reason: string, securityCode: string, refundMethod?: RefundMethod) =>
    api.post<CreditNoteData>(`/pos/orders/${orderId}/credit-note-refund`,
      { reason, refundMethod: refundMethod ?? null }, { headers: { 'X-Security-Code': securityCode } }).then((r) => r.data),
  get: (orderId: string) =>
    api.get<CreditNoteData>(`/pos/orders/${orderId}/credit-note`).then((r) => r.data),
};
