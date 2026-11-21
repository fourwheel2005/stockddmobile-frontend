import { describe, expect, it } from 'vitest';
import { filterCatalog, linesTotal, setLineQty, partLabel, profitOf, replacePriceOf, stockStatus, suggestGroupId } from '@/lib/repairParts';
import type { RepairPart, RepairPartGroup } from '@/types/api';

const part = (over: Partial<RepairPart>): RepairPart => ({
  id: 'p', groupId: 'g', name: 'จอ', grade: null, cost: 0, partPrice: 0, laborPrice: 0, replacePrice: 0,
  profit: 0, quantity: 0, note: null, sortOrder: 0, ...over,
});

const groups: RepairPartGroup[] = [
  { id: 'g13', name: 'iPhone 13', general: false, note: null, parts: [part({ id: 'a', name: 'จอ', grade: 'แท้ศูนย์' }), part({ id: 'b', name: 'แบตเตอรี่' })] },
  { id: 'g13p', name: 'iPhone 13 Pro', general: false, note: null, parts: [part({ id: 'c', name: 'จอ' })] },
  { id: 'g1', name: 'iPhone 1', general: false, note: null, parts: [] },
  { id: 'gen', name: 'อะไหล่ทั่วไป', general: true, note: null, parts: [part({ id: 'd', name: 'กาวติดจอ' })] },
];

describe('repair parts helpers (FIX-235)', () => {
  it('replace price is part price plus labor, profit subtracts cost', () => {
    expect(replacePriceOf(5500, 500)).toBe(6000);
    expect(replacePriceOf(0.1, 0.2)).toBe(0.3);
    expect(profitOf(5500, 500, 4200)).toBe(1800);
  });

  it('labels a part with its grade', () => {
    expect(partLabel({ name: 'จอ', grade: 'OEM' })).toBe('จอ (OEM)');
    expect(partLabel({ name: 'แบตเตอรี่', grade: null })).toBe('แบตเตอรี่');
  });

  it('shows stock state', () => {
    expect(stockStatus(0).text).toBe('หมด · ต้องสั่ง');
    expect(stockStatus(1).text).toBe('เหลือ 1');
    expect(stockStatus(4).text).toBe('มี 4');
  });

  it('suggests the most specific model from the ticket device text', () => {
    expect(suggestGroupId('Apple iPhone 13 Pro', groups)).toBe('g13p');
    expect(suggestGroupId('iphone 13  สีดำ', groups)).toBe('g13');
    expect(suggestGroupId('iPhone 12', groups)).toBeNull();          // "iPhone 1" ต้องไม่ตรงกับ "iPhone 12"
    expect(suggestGroupId('', groups)).toBeNull();
  });

  it('search matches a whole model or individual parts', () => {
    expect(filterCatalog(groups, '13 pro').map((g) => g.id)).toEqual(['g13p']);
    expect(filterCatalog(groups, 'แท้ศูนย์')).toEqual([{ ...groups[0], parts: [groups[0].parts[0]] }]);
    expect(filterCatalog(groups, 'กาว').map((g) => g.id)).toEqual(['gen']);
    expect(filterCatalog(groups, '  ')).toBe(groups);
  });

  it('totals the chosen parts by quantity', () => {
    const byId = new Map([['a', { replacePrice: 6000 }], ['b', { replacePrice: 1300 }]]);
    expect(linesTotal([{ partId: 'a', quantity: 1 }, { partId: 'b', quantity: 2 }], byId)).toBe(8600);
    expect(linesTotal([{ partId: 'zzz', quantity: 1 }], byId)).toBe(0);
  });

  it('sets a line quantity, appends new parts in order and removes at zero', () => {
    const start = [{ partId: 'a', quantity: 1 }];
    expect(setLineQty(start, 'b', 1)).toEqual([{ partId: 'a', quantity: 1 }, { partId: 'b', quantity: 1 }]);
    expect(setLineQty(start, 'a', 3)).toEqual([{ partId: 'a', quantity: 3 }]);
    expect(setLineQty(start, 'a', 0)).toEqual([]);
    expect(start).toEqual([{ partId: 'a', quantity: 1 }]);
  });
});
