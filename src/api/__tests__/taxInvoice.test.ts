import { describe, expect, it } from 'vitest';
import { isValidTaxInvoiceBuyer } from '../taxInvoice';

describe('isValidTaxInvoiceBuyer', () => {
  it('accepts an individual without tax id or branch', () => {
    expect(isValidTaxInvoiceBuyer({
      buyerType: 'INDIVIDUAL', customerName: 'นายสมชาย', customerAddress: 'กรุงเทพฯ',
    })).toBe(true);
  });

  it('requires tax id and five-digit branch for a VAT-registered buyer', () => {
    expect(isValidTaxInvoiceBuyer({
      buyerType: 'VAT_REGISTERED', customerName: 'บริษัท เอ จำกัด',
      customerTaxId: '0123456789012', customerAddress: 'กรุงเทพฯ',
    })).toBe(false);
    expect(isValidTaxInvoiceBuyer({
      buyerType: 'VAT_REGISTERED', customerName: 'บริษัท เอ จำกัด',
      customerTaxId: '0123456789012', customerBranchCode: '00000', customerAddress: 'กรุงเทพฯ',
    })).toBe(true);
  });
});
