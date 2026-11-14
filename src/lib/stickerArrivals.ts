import { shopDayKey } from '@/lib/datetime';
import type { SerializedItemResponse } from '@/types/api';

export interface ArrivalDay {
  /** วันรับเข้าตามโซนเวลาร้าน รูปแบบ YYYY-MM-DD */
  dayKey: string;
  items: SerializedItemResponse[];
}

export interface ArrivalGroups {
  /** วันที่โหลดเครื่องมา "ครบทั้งวัน" แล้ว — ใหม่สุดก่อน */
  days: ArrivalDay[];
  /** วันเก่าสุดที่โหลดมาได้แค่บางส่วน (ยังมีหน้าถัดไป) — ยังไม่แสดง กัน "ปริ้นทั้งวัน" ออกไม่ครบ */
  pendingDayKey: string | null;
}

/**
 * จัดเครื่องเข้าใหม่เป็นกลุ่มตามวันรับเข้า (FIX-227).
 * รายการมาจาก API แบบแบ่งหน้า เรียง receivedAt ใหม่→เก่า: ถ้ายังมีหน้าถัดไป วันสุดท้ายที่เห็นอาจถูกตัดกลางวัน
 * จึงกันวันนั้นไว้ก่อนจนกว่าจะโหลดต่อ — ปุ่ม "ปริ้นทั้งวัน" ต้องหมายถึงทุกเครื่องของวันนั้นจริงๆ.
 */
export function groupArrivalsByDay(items: SerializedItemResponse[], hasMore: boolean): ArrivalGroups {
  const seen = new Set<string>();
  const byDay = new Map<string, SerializedItemResponse[]>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const dayKey = shopDayKey(item.receivedAt);
    if (!dayKey) continue;
    const bucket = byDay.get(dayKey);
    if (bucket) bucket.push(item);
    else byDay.set(dayKey, [item]);
  }
  const days = [...byDay.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dayKey, dayItems]): ArrivalDay => ({ dayKey, items: dayItems }));
  if (!hasMore || days.length === 0) return { days, pendingDayKey: null };
  const pending = days.pop()!;
  return { days, pendingDayKey: pending.dayKey };
}

/** หัวข้อวัน เช่น "วันเสาร์ที่ 14 พฤศจิกายน 2569" */
export function formatArrivalDay(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
}
