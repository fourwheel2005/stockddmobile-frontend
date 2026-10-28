import { describe, expect, it } from 'vitest';
import {
  adjustNumber, applyBulkAdjust, draftFromRow, isChanged, rowRequest, termsSummary, type BulkAdjust,
} from '@/lib/firstHandBulk';
import type { FirstHandInstallmentRow } from '@/types/api';

const row: FirstHandInstallmentRow = {
  productId: 'p17', productName: 'iPhone 17', storage: '256', variantCount: 4,
  cashPrice: 29900, downPayment: 8990,
  installmentTerms: '[{"months":10,"monthly":1990},{"months":12,"monthly":1790,"down":7990}]',
};
const adj = (over: Partial<BulkAdjust>): BulkAdjust => ({ field: 'cash', op: 'SET', value: 0, round: 1, months: null, ...over });

describe('first-hand bulk edit (FIX-208)', () => {
  it('adjustNumber handles set, baht and percent changes with rounding and no negatives', () => {
    expect(adjustNumber(29900, { op: 'SET', value: 27900, round: 1 })).toBe(27900);
    expect(adjustNumber(29900, { op: 'SUB', value: 1000, round: 1 })).toBe(28900);
    expect(adjustNumber(29900, { op: 'PCT_DOWN', value: 5, round: 10 })).toBe(28410);
    expect(adjustNumber(1990, { op: 'PCT_UP', value: 3, round: 10 })).toBe(2050);
    expect(adjustNumber(500, { op: 'SUB', value: 900, round: 1 })).toBe(0);
  });

  it('changes cash price, main down payment and every month’s instalment', () => {
    let d = draftFromRow(row);
    d = applyBulkAdjust(d, adj({ field: 'cash', op: 'SUB', value: 1000 }));
    d = applyBulkAdjust(d, adj({ field: 'down', op: 'SET', value: 6990 }));
    d = applyBulkAdjust(d, adj({ field: 'monthly', op: 'ADD', value: 100 }));
    expect(d.cash).toBe('28900');
    expect(d.down).toBe('6990');
    expect(d.monthly[10].monthly).toBe('2090');
    expect(d.monthly[12]).toEqual({ monthly: '1890', down: '7990' });
    expect(d.dirty).toBe(true);
  });

  it('a specific month can be added or changed; per-term down only applies where an instalment exists', () => {
    let d = draftFromRow(row);
    d = applyBulkAdjust(d, adj({ field: 'monthly', op: 'SET', value: 990, months: 24 }));
    d = applyBulkAdjust(d, adj({ field: 'termDown', op: 'SET', value: 5990, months: 24 }));
    d = applyBulkAdjust(d, adj({ field: 'termDown', op: 'SET', value: 4990, months: 36 }));
    expect(d.monthly[24]).toEqual({ monthly: '990', down: '5990' });
    expect(d.monthly[36]).toBeUndefined();
  });

  it('relative changes skip empty values instead of inventing a base', () => {
    const empty = { ...draftFromRow({ ...row, cashPrice: null }) };
    expect(applyBulkAdjust(empty, adj({ field: 'cash', op: 'ADD', value: 500 })).cash).toBe('');
    expect(applyBulkAdjust(empty, adj({ field: 'cash', op: 'SET', value: 24900 })).cash).toBe('24900');
  });

  it('rowRequest builds the same request as the backend expects and catches bad rows', () => {
    const ok = rowRequest(row, draftFromRow(row));
    expect(ok.ok && ok.request).toEqual({
      productId: 'p17', storage: '256', downPayment: 8990, cashPrice: 29900,
      installmentTerms: '[{"months":10,"monthly":1990},{"months":12,"monthly":1790,"down":7990}]',
    });
    const zeroCash = rowRequest(row, { ...draftFromRow(row), cash: '0' });
    expect(zeroCash.ok).toBe(false);
    const noTerms = rowRequest(row, { ...draftFromRow(row), monthly: {} });
    expect(!noTerms.ok && noTerms.error).toContain('iPhone 17 256GB');
    const clear = rowRequest(row, { ...draftFromRow(row), down: '', monthly: {} });
    expect(clear.ok && clear.clears).toBe(true);
  });

  it('isChanged ignores rows whose values end up the same', () => {
    const same = applyBulkAdjust(draftFromRow(row), adj({ field: 'cash', op: 'SET', value: 29900 }));
    expect(isChanged(row, same)).toBe(false);
    expect(isChanged(row, { ...same, cash: '28900' })).toBe(true);
  });

  it('termsSummary is readable for the confirmation list', () => {
    expect(termsSummary(row.installmentTerms)).toBe('10ด 1,990 · 12ด 1,790 (ดาวน์ 7,990)');
    expect(termsSummary(null)).toBe('—');
  });
});
