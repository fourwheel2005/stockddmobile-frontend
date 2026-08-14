import { describe, expect, it } from 'vitest';
import { buildTaxInvoice } from '../taxInvoice';
import type { TaxInvoiceData } from '@/api/taxInvoice';

function invoice(): TaxInvoiceData {
  return {
    company: { legalName: 'DDMobile Co., Ltd.', branchLabel: 'Head Office', address: 'Bangkok', taxId: '0123456789012', phone: '020000000' },
    taxInvoiceNo: 'TIV-20260814-0001', issuedAt: '2026-08-14T03:00:00Z', billNo: 'INV-001',
    customerName: 'ABC Co., Ltd.', customerTaxId: '1111111111111', customerType: 'VAT_REGISTERED',
    customerBranchCode: '00001', customerAddress: 'Bangkok',
    items: [{ seq: 1, sku: 'IP17', productName: 'iPhone 17', imei: '123', serialNumber: null, quantity: 1, unitPrice: 11900, lineTotal: 11900 }],
    total: 11900, discount: 0, shipping: 0, netTotal: 11900, vat: 778.50, subTotal: 11121.50,
    bahtText: 'หนึ่งหมื่นหนึ่งพันเก้าร้อยบาทถ้วน', paymentMethod: 'CASH', cashier: 'staff',
  };
}

describe('buildTaxInvoice', () => {
  it('prints buyer branch and marks a copy correctly', () => {
    const text = String.fromCharCode(...buildTaxInvoice(invoice(), { copy: true }));
    expect(text).toContain('COPY');
    expect(text).toContain('00001');
  });

  it('opens the drawer only for a requested cash original', () => {
    const bytes = buildTaxInvoice(invoice(), { openDrawer: true });
    expect(Array.from(bytes.slice(-5))).toEqual([0x1b, 0x70, 0, 25, 250]);
  });
});
