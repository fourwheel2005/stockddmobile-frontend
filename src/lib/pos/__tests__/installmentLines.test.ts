import { describe, expect, it } from 'vitest';
import { defaultPayToday } from '@/lib/pos/installmentLines';

describe('defaultPayToday (installment line default)', () => {
  it('treats an iPad WiFi with serial only as a financed device, not an add-on', () => {
    expect(defaultPayToday({ serialized: true, accessory: false, imei: null })).toBe(false);
    expect(defaultPayToday({ serialized: true, accessory: false, imei: '000000000000000' })).toBe(false);
  });

  it('keeps phones with a real IMEI on the installment side', () => {
    expect(defaultPayToday({ serialized: true, accessory: false, imei: '359001234567890' })).toBe(false);
  });

  it('marks serialized accessories such as AirPods as pay-today', () => {
    expect(defaultPayToday({ serialized: true, accessory: true, imei: null })).toBe(true);
  });

  it('bulk (counted) lines are always pay-today', () => {
    expect(defaultPayToday({ serialized: false, accessory: false })).toBe(true);
    expect(defaultPayToday({ serialized: false })).toBe(true);
  });

  it('falls back to the IMEI rule when the backend does not send the accessory flag', () => {
    expect(defaultPayToday({ serialized: true, imei: null })).toBe(true);
    expect(defaultPayToday({ serialized: true, imei: '359001234567890' })).toBe(false);
  });
});
