import { describe, expect, it } from 'vitest';
import type { TaxInvoiceData } from '@/api/taxInvoice';
import { encodeCp874 } from '../cp874';
import { buildTaxInvoice } from '../taxInvoice';

function invoice(overrides: Partial<TaxInvoiceData> = {}): TaxInvoiceData {
  return {
    company: {
      legalName: 'บริษัท บัดดี้ดี ดิเทล จำกัด',
      branchLabel: 'สำนักงานใหญ่',
      address: '555/133 หมู่1 ต.บางแก้ว อ.เมือง จ.สมุทรสงคราม 75000',
      taxId: '0755569000465',
      phone: '0839358181',
    },
    taxInvoiceNo: 'TIV-20260820-0001', issuedAt: '2026-08-20T08:13:45Z', billNo: 'INV-20260820-0001',
    customerName: 'บริษัท ลูกค้าทดสอบ จำกัด', customerTaxId: '1111111111111', customerType: 'VAT_REGISTERED',
    customerBranchCode: '00001', customerAddress: '99/9 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพมหานคร 10110',
    items: [{
      seq: 1, sku: 'IP17-256', productName: 'iPhone 17 256GB Mist Blue', imei: '354774860578758',
      serialNumber: 'SH6X09W42VP', quantity: 1, unitPrice: 11_900, lineTotal: 11_900,
    }],
    total: 12_000, discount: 200, shipping: 100, netTotal: 11_900, vat: 778.50, subTotal: 11_121.50,
    bahtText: 'หนึ่งหมื่นหนึ่งพันเก้าร้อยบาทถ้วน', paymentMethod: 'CASH', cashier: 'staff1',
    ...overrides,
  };
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function expectText(bytes: Uint8Array, value: string): void {
  expect(containsBytes(bytes, encodeCp874(value)), `missing printed text: ${value}`).toBe(true);
}

describe('buildTaxInvoice — 80mm receipt/tax invoice', () => {
  it('prints every statutory identity field on the original', () => {
    const bytes = buildTaxInvoice(invoice());
    [
      'ใบเสร็จรับเงิน / ใบกำกับภาษี (ต้นฉบับ)', 'RECEIPT / TAX INVOICE (ORIGINAL)',
      'บริษัท บัดดี้ดี ดิเทล จำกัด', 'สำนักงานใหญ่', '0755569000465',
      'TIV-20260820-0001', '20/08/2026', 'INV-20260820-0001',
      'บริษัท ลูกค้าทดสอบ จำกัด', '1111111111111', 'สาขาที่ 00001',
      'ขอบคุณครับ',
    ].forEach((text) => expectText(bytes, text));
  });

  it('prints product identity, quantity, unit price and line amount', () => {
    const bytes = buildTaxInvoice(invoice());
    ['iPhone 17 256GB Mist Blue', 'IP17-256', '354774860578758', 'SH6X09W42VP', '1 x 11,900.00', '11,900.00']
      .forEach((text) => expectText(bytes, text));
  });

  it('prints a reconcilable VAT-inclusive summary and amount in words', () => {
    const bytes = buildTaxInvoice(invoice());
    ['12,000.00', '200.00', '100.00', '11,121.50', '778.50', '11,900.00',
      'หนึ่งหมื่นหนึ่งพันเก้าร้อยบาทถ้วน', 'เงินสด', 'staff1']
      .forEach((text) => expectText(bytes, text));
  });

  it('marks subsequent output as copy and preserves the original invoice number', () => {
    const bytes = buildTaxInvoice(invoice(), { copy: true });
    ['ใบเสร็จรับเงิน / ใบกำกับภาษี (สำเนา)', 'RECEIPT / TAX INVOICE (COPY)', 'TIV-20260820-0001']
      .forEach((text) => expectText(bytes, text));
    expect(containsBytes(bytes, encodeCp874('(ต้นฉบับ)'))).toBe(false);
    expect(containsBytes(bytes, new Uint8Array([0x1d, 0x42, 1]))).toBe(false);
  });

  it('uses the company head-office label and an individual buyer without inventing buyer branch data', () => {
    const bytes = buildTaxInvoice(invoice({
      customerType: 'INDIVIDUAL', customerTaxId: null, customerBranchCode: null,
    }));
    expectText(bytes, 'บุคคลทั่วไป');
    expect(containsBytes(bytes, encodeCp874('TAX ID ผู้ซื้อ'))).toBe(false);
  });

  it('prints both IMEI and serial when both are part of the sold item', () => {
    const bytes = buildTaxInvoice(invoice());
    expectText(bytes, 'IMEI: 354774860578758');
    expectText(bytes, 'Serial: SH6X09W42VP');
  });

  it('opens the drawer only when requested for a cash payment', () => {
    const cash = buildTaxInvoice(invoice(), { openDrawer: true });
    const transfer = buildTaxInvoice(invoice({ paymentMethod: 'TRANSFER' }), { openDrawer: true });
    expect(Array.from(cash.slice(-5))).toEqual([0x1b, 0x70, 0, 25, 250]);
    expect(Array.from(transfer.slice(-3))).toEqual([0x1d, 0x56, 0]);
  });

  it('normalizes buyer-provided line breaks so document structure cannot be forged', () => {
    const bytes = buildTaxInvoice(invoice({ customerName: 'ลูกค้า\nCOPY\u001bpwned' }));
    expectText(bytes, 'ลูกค้า COPY?pwned');
  });
});
