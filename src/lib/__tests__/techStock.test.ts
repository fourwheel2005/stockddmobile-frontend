import { describe, expect, it } from 'vitest';
import { accessoriesText, batteryText, batteryTone } from '@/lib/techStock';

describe('technician stock display (FIX-234)', () => {
  it('grades battery health', () => {
    expect(batteryTone(100)).toBe('good');
    expect(batteryTone(85)).toBe('good');
    expect(batteryTone(84)).toBe('fair');
    expect(batteryTone(80)).toBe('fair');
    expect(batteryTone(79)).toBe('replace');
    expect(batteryTone(null)).toBe('unknown');
    expect(batteryText(87)).toBe('87%');
    expect(batteryText(undefined)).toBe('—');
  });

  it('describes box and charger, distinguishing "no" from "not recorded"', () => {
    expect(accessoriesText(true, false)).toBe('มีกล่อง · ไม่มีที่ชาร์จ');
    expect(accessoriesText(true, null)).toBe('มีกล่อง');
    expect(accessoriesText(null, null)).toBe('ไม่ระบุ');
  });
});
