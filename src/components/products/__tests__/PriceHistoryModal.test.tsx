import { describe, expect, it } from 'vitest';
import { sourceLabel, termsSummary } from '@/components/products/PriceHistoryModal';

describe('PriceHistoryModal helpers (FIX-202)', () => {
  it('summarises terms including per-month down', () => {
    expect(termsSummary('[{"months":24,"monthly":1090,"down":5000},{"months":10,"monthly":2190}]'))
      .toBe('10ด ฿2,190.00 · 24ด ฿1,090.00 (ดาวน์ ฿5,000.00)');
    expect(termsSummary(null)).toBe('-');
    expect(termsSummary('[]')).toBe('-');
  });

  it('labels the change source for staff', () => {
    expect(sourceLabel('FIRSTHAND_TABLE')).toBe('ตารางผ่อนมือ 1');
    expect(sourceLabel('SKU_EDIT:DD00042')).toBe('แก้ SKU DD00042');
    expect(sourceLabel(null)).toBe('-');
  });
});
