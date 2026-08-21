import { describe, expect, it } from 'vitest';
import { createShippingLabelPrintContext } from '@/hooks/useShippingLabelPrinter';

describe('createShippingLabelPrintContext', () => {
  it('keeps the sale bill reference for the POS workflow', () => {
    expect(createShippingLabelPrintContext(' INV-001 ', 123)).toEqual({
      reference: 'SHIP-INV-001',
      successMessage: 'พิมพ์ใบจัดส่ง 10×15 ซม. สำหรับบิล INV-001 แล้ว',
    });
  });

  it('creates an auditable local reference without pretending there is a sale bill', () => {
    expect(createShippingLabelPrintContext(undefined, 1720000000000)).toEqual({
      reference: 'SHIP-MANUAL-1720000000000',
      successMessage: 'พิมพ์ใบจัดส่ง 10×15 ซม. แล้ว',
    });
  });
});
