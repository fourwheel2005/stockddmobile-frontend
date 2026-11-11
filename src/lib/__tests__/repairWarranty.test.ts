import { describe, expect, it } from 'vitest';
import { REPAIR_WARRANTY_OPTIONS, repairWarrantyLabel, repairWarrantyText } from '@/lib/repairWarranty';

describe('repair warranty (FIX-225)', () => {
  it('offers the five choices the shop uses', () => {
    expect(REPAIR_WARRANTY_OPTIONS.map((o) => o.label)).toEqual([
      'ไม่มีประกัน', 'รับประกัน 1 เดือน', 'รับประกัน 3 เดือน', 'รับประกัน 6 เดือน', 'รับประกัน 1 ปี',
    ]);
    expect(repairWarrantyLabel('M6')).toBe('รับประกัน 6 เดือน');
    expect(repairWarrantyLabel(null)).toBeNull();
  });

  it('shows the end date once the customer picked the device up', () => {
    expect(repairWarrantyText({ warranty: 'M3', warrantyUntil: '2027-02-11', pickedUpAt: '2026-11-11T03:00:00Z' }))
      .toMatch(/^รับประกัน 3 เดือน \(ถึง .+\)$/);
    expect(repairWarrantyText({ warranty: 'M3', warrantyUntil: null, pickedUpAt: null }))
      .toBe('รับประกัน 3 เดือน (นับจากวันรับเครื่องคืน)');
    expect(repairWarrantyText({ warranty: 'NONE', warrantyUntil: null, pickedUpAt: null })).toBe('ไม่มีประกัน');
    expect(repairWarrantyText({ warranty: null, warrantyUntil: null, pickedUpAt: null })).toBeNull();
  });
});
