import { describe, expect, it } from 'vitest';
import {
  buildTermTable, monthColumns, parseTermTable, validateNewMonth, DEFAULT_MONTH_COLUMNS,
} from '@/lib/installmentTable';

describe('installmentTable', () => {
  it('round-trips per-month down payments and keeps legacy rows without down untouched', () => {
    const json = '[{"months":10,"monthly":2190},{"months":24,"monthly":1090,"down":3500}]';
    const table = parseTermTable(json);
    expect(table[10]).toEqual({ monthly: '2190', down: '' });
    expect(table[24]).toEqual({ monthly: '1090', down: '3500' });
    expect(JSON.parse(buildTermTable(table))).toEqual([
      { months: 10, monthly: 2190 },
      { months: 24, monthly: 1090, down: 3500 },
    ]);
  });

  it('drops empty or invalid cells and sorts by months', () => {
    const json = buildTermTable({
      18: { monthly: '', down: '1000' },       // ไม่มีค่างวด → ตัดทิ้งแม้มีดาวน์
      36: { monthly: '790', down: 'abc' },     // ดาวน์เพี้ยน → เก็บเฉพาะค่างวด
      12: { monthly: '1990', down: '0' },      // ดาวน์ 0 = ตั้งใจให้ดาวน์ 0 งวดนี้
    });
    expect(JSON.parse(json)).toEqual([
      { months: 12, monthly: 1990, down: 0 },
      { months: 36, monthly: 790 },
    ]);
    expect(buildTermTable({})).toBe('[]');
    expect(parseTermTable('not json')).toEqual({});
  });

  it('derives month columns from defaults, existing data and user-added months', () => {
    const cols = monthColumns([parseTermTable('[{"months":24,"monthly":1}]'), {}], [20]);
    expect(cols).toEqual([10, 12, 15, 18, 20, 24]);
    expect(monthColumns([])).toEqual([...DEFAULT_MONTH_COLUMNS]);
  });

  it('validates a new month column', () => {
    expect(validateNewMonth('24', [10, 12])).toEqual({ months: 24 });
    expect(validateNewMonth('12', [10, 12])).toMatchObject({ error: expect.stringContaining('อยู่แล้ว') });
    expect(validateNewMonth('0', [])).toMatchObject({ error: expect.any(String) });
    expect(validateNewMonth('61', [])).toMatchObject({ error: expect.stringContaining('60') });
    expect(validateNewMonth('1.5', [])).toMatchObject({ error: expect.any(String) });
  });
});
