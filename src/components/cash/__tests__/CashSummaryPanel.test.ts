import { describe, expect, it } from 'vitest';
import { formatMonthLabel, monthRange, shiftMonth } from '../CashSummaryPanel';

describe('CashSummaryPanel month picker', () => {
  it('calculates complete month range including leap year', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('moves safely across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('shows a Thai human-readable month instead of a raw YYYY-MM value', () => {
    expect(formatMonthLabel('2026-08')).toContain('สิงหาคม');
  });
});
