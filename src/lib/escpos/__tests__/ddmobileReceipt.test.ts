import { describe, it, expect } from 'vitest';
import { buildDDMobileReceipt, type ReceiptData } from '../ddmobileReceipt';

function makeReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    shop: {
      name: 'DDMobile',
      address: '123 ถ.สุขุมวิท กรุงเทพ',
      phone: '02-123-4567',
      taxId: '0-1234-56789-01-2',
      website: 'www.ddmobile.in.th',
    },
    billNo: 'INV-20260603-A1B2C3D4',
    issuedAt: '2026-06-03T14:32:00Z',
    cashier: 'admin',
    customerName: 'นายสมชาย',
    customerPhoneMasked: '081-XXX-XX67',
    orderChannel: 'WALK_IN',
    items: [
      { seq: 1, sku: 'IP15-256', productName: 'iPhone 15 Pro 256GB', imei: '356789012345678', quantity: 1, sellPrice: 39900, lineTotal: 39900 },
    ],
    subtotal: 39900,
    discountAmount: 0,
    vatAmount: 0,
    shippingFee: 0,
    grandTotal: 39900,
    paidAmount: 39900,
    changeAmount: 0,
    paymentMethod: 'CASH',
    footerMessage: 'ขอบคุณที่ใช้บริการ',
    qrCodeData: 'INV-20260603-A1B2C3D4',
    ...overrides,
  };
}

describe('buildDDMobileReceipt', () => {
  it('includes init + codepage Thai', () => {
    const bytes = buildDDMobileReceipt(makeReceipt());
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40); // init
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x74);
    expect(bytes[4]).toBe(26); // PC874 Thai (TM-T82X-II)
  });

  it('includes shop name in encoded output', () => {
    const bytes = buildDDMobileReceipt(makeReceipt());
    const str = String.fromCharCode(...bytes);
    expect(str).toContain('DDMobile');
  });

  it('ends with cut command', () => {
    const bytes = buildDDMobileReceipt(makeReceipt(), { openDrawer: false });
    // GS V 0
    const last3 = Array.from(bytes.slice(-3));
    expect(last3).toEqual([0x1d, 0x56, 0]);
  });

  it('appends drawer kick when openDrawer + CASH', () => {
    const bytes = buildDDMobileReceipt(makeReceipt(), { openDrawer: true });
    // ESC p 0 25 250 at the end
    const last5 = Array.from(bytes.slice(-5));
    expect(last5).toEqual([0x1b, 0x70, 0, 25, 250]);
  });

  it('does NOT include drawer kick for INSTALLMENT', () => {
    const bytes = buildDDMobileReceipt(
      makeReceipt({ paymentMethod: 'INSTALLMENT' }),
      { openDrawer: true },
    );
    // Should end with cut, not drawer kick
    const last3 = Array.from(bytes.slice(-3));
    expect(last3).toEqual([0x1d, 0x56, 0]);
  });

  it('prints the issue time in Bangkok wall clock for a zone-less API timestamp', () => {
    // FIX-098 — backend ส่ง LocalDateTime (UTC) แบบไม่มี offset; ใบเสร็จเคยพิมพ์ 03:35
    const bytes = buildDDMobileReceipt(makeReceipt({ issuedAt: '2026-07-22T03:35:12' }));
    const str = String.fromCharCode(...bytes);
    expect(str).toContain('22/07/2026 10:35');
    expect(str).not.toContain('22/07/2026 03:35');
  });

  it('prints the same time whether or not the timestamp carries an offset', () => {
    const zoneless = buildDDMobileReceipt(makeReceipt({ issuedAt: '2026-07-22T03:35:12' }));
    const zoned = buildDDMobileReceipt(makeReceipt({ issuedAt: '2026-07-22T03:35:12Z' }));
    expect(String.fromCharCode(...zoned)).toBe(String.fromCharCode(...zoneless));
  });

  it('prints a custom (off-stock) line without an empty SKU row', () => {
    // FIX-099 — รายการพิมพ์เองไม่มี SKU/IMEI
    const bytes = buildDDMobileReceipt(makeReceipt({
      items: [{ seq: 1, sku: null, productName: 'สายชาร์จ Type-C', quantity: 2, sellPrice: 150, lineTotal: 300 }],
      subtotal: 300, grandTotal: 300, paidAmount: 300,
    }));
    const str = String.fromCharCode(...bytes);
    expect(str).not.toContain('SKU:');
    expect(str).toContain('300.00');
  });

  it('marks duplicate header', () => {
    const bytes = buildDDMobileReceipt(makeReceipt(), { duplicate: true });
    const str = String.fromCharCode(...bytes);
    expect(str).toContain('DUPLICATE');
  });

  it('includes shipping breakdown for grandpa/grandma', () => {
    const bytes = buildDDMobileReceipt(makeReceipt({
      shippingFee: 100,
      shippingFeeGrandpa: 30,
      shippingFeeGrandma: 20,
      shippingPartner: 'ICE',
      grandTotal: 40000,
    }));
    const str = String.fromCharCode(...bytes);
    expect(str).toMatch(/100\.00/);
    expect(str).toContain('30.00');
    expect(str).toContain('20.00');
  });

  it('renders installment payment block', () => {
    const bytes = buildDDMobileReceipt(makeReceipt({
      paymentMethod: 'INSTALLMENT',
      installmentMonths: 6,
      downPaymentAmount: 10000,
      monthlyAmount: 5000,
    }));
    const str = String.fromCharCode(...bytes);
    expect(str).toMatch(/6/);
    expect(str).toMatch(/10,000\.00|10000\.00/);
  });
});
