import { describe, expect, it } from 'vitest';
import type { CreditNoteData } from '@/api/creditNote';
import { encodeCp874 } from '../cp874';
import { buildCreditNote } from '../creditNote';

function note(): CreditNoteData {
  return {
    company: {
      legalName: 'บริษัท บัดดี้ดี ดิเทล จำกัด', branchLabel: 'สำนักงานใหญ่',
      address: '555/133 หมู่1 ต.บางแก้ว อ.เมือง จ.สมุทรสงคราม 75000',
      taxId: '0755569000465', phone: '0839358181',
    },
    creditNoteNo: 'CN-20260820-0001', issuedAt: '2026-08-20T08:13:45Z',
    originalTaxInvoiceNo: 'TIV-20260819-0001', originalTaxInvoiceIssuedAt: '2026-08-19T08:13:45Z',
    billNo: 'INV-20260819-0001', reason: 'ลูกค้าคืนสินค้าตามข้อตกลง',
    customerName: 'บริษัท ลูกค้าทดสอบ จำกัด', customerTaxId: '1111111111111',
    customerType: 'VAT_REGISTERED', customerBranchCode: '00000',
    customerAddress: '99/9 กรุงเทพมหานคร 10110',
    items: [{ seq: 1, sku: 'IP17-256', productName: 'iPhone 17 256GB',
      imei: '354774860578758', serialNumber: 'SH6X09W42VP', quantity: 1,
      unitPrice: 11900, lineTotal: 11900 }],
    originalValue: 11900, correctValue: 0, difference: 11900,
    vatAmount: 778.50, subtotalDifference: 11121.50,
    bahtText: 'หนึ่งหมื่นหนึ่งพันเก้าร้อยบาทถ้วน', paymentMethod: 'CASH', issuedBy: 'manager1',
  };
}

function contains(bytes: Uint8Array, text: string): boolean {
  const needle = encodeCp874(text);
  return bytes.some((_, start) => needle.every((value, offset) => bytes[start + offset] === value));
}

describe('buildCreditNote', () => {
  it('prints statutory references, reason and VAT adjustment on the original', () => {
    const bytes = buildCreditNote(note());
    [
      'ใบลดหนี้ (ต้นฉบับ)', 'CREDIT NOTE (ORIGINAL)', 'CN-20260820-0001',
      'TIV-20260819-0001', 'ลูกค้าคืนสินค้าตามข้อตกลง', '11,900.00',
      '0.00', '778.50', '11,121.50', 'ขอบคุณครับ',
    ].forEach((text) => expect(contains(bytes, text), text).toBe(true));
  });

  it('marks a subsequent print as copy without changing document number', () => {
    const bytes = buildCreditNote(note(), true);
    expect(contains(bytes, 'ใบลดหนี้ (สำเนา)')).toBe(true);
    expect(contains(bytes, 'CREDIT NOTE (COPY)')).toBe(true);
    expect(contains(bytes, 'CN-20260820-0001')).toBe(true);
  });
});
