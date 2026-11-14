import { describe, expect, it } from 'vitest';
import type { SerializedItemResponse } from '@/types/api';
import { formatArrivalDay, groupArrivalsByDay } from '../stickerArrivals';

function device(id: string, receivedAt: string): SerializedItemResponse {
  return { id, receivedAt, serialNumber: `SN-${id}`, stockCode: id } as SerializedItemResponse;
}

describe('groupArrivalsByDay', () => {
  it('groups by the shop-zone arrival day, newest day first, keeping the API order inside a day', () => {
    const groups = groupArrivalsByDay([
      device('C', '2026-11-14T05:00:00'),
      device('B', '2026-11-14T02:00:00'),
      device('A', '2026-11-13T09:00:00'),
    ], false);
    expect(groups.pendingDayKey).toBeNull();
    expect(groups.days.map((day) => [day.dayKey, day.items.map((item) => item.id)])).toEqual([
      ['2026-11-14', ['C', 'B']],
      ['2026-11-13', ['A']],
    ]);
  });

  it('uses the Bangkok calendar day, not the UTC day of the stored timestamp', () => {
    // 18:30 UTC ของวันที่ 13 = 01:30 ของวันที่ 14 ที่ร้าน
    const groups = groupArrivalsByDay([device('A', '2026-11-13T18:30:00')], false);
    expect(groups.days[0].dayKey).toBe('2026-11-14');
  });

  it('holds back the oldest loaded day while more pages remain so a whole-day print is never partial', () => {
    const groups = groupArrivalsByDay([
      device('C', '2026-11-14T05:00:00'),
      device('B', '2026-11-13T05:00:00'),
    ], true);
    expect(groups.days.map((day) => day.dayKey)).toEqual(['2026-11-14']);
    expect(groups.pendingDayKey).toBe('2026-11-13');
  });

  it('ignores a device repeated across pages', () => {
    const groups = groupArrivalsByDay([
      device('A', '2026-11-14T05:00:00'),
      device('A', '2026-11-14T05:00:00'),
    ], false);
    expect(groups.days[0].items).toHaveLength(1);
  });
});

describe('formatArrivalDay', () => {
  it('writes the heading as a full Thai date in the Buddhist era', () => {
    const heading = formatArrivalDay('2026-11-14');
    expect(heading).toContain('14 พฤศจิกายน');
    expect(heading).toContain('2569');
    expect(heading).toContain('เสาร์');
  });
});
