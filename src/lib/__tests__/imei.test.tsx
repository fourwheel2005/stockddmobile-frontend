import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cleanImei, imeiProblem } from '@/lib/imei';
import { ImeiInput } from '@/components/ImeiInput';
import { getTradeInBlockedReason } from '@/lib/pos/tradeIn';

describe('IMEI 15 หลัก (FIX-211)', () => {
  it('keeps digits only and never more than 15', () => {
    expect(cleanImei('35-9001 2345 67890 99')).toBe('359001234567890');
    expect(cleanImei('abc')).toBe('');
  });

  it('accepts empty or exactly 15 digits and explains anything else', () => {
    expect(imeiProblem('')).toBeNull();
    expect(imeiProblem(null)).toBeNull();
    expect(imeiProblem('359001234567890')).toBeNull();
    expect(imeiProblem('35900123456789')).toBe('IMEI ต้องมี 15 หลัก (ตอนนี้ 14/15)');
    expect(imeiProblem('3590012345678901')).toContain('16/15');
    expect(imeiProblem('35900A234567890')).toContain('ตัวเลขล้วน');
    expect(imeiProblem('123', 'IMEI 2')).toContain('IMEI 2 ต้องมี 15 หลัก');
  });

  it('shows a 14/15 counter in red until the IMEI is complete, then 15/15 in green', () => {
    const short = renderToStaticMarkup(<ImeiInput value="35900123456789" onChange={() => {}} />);
    expect(short).toContain('14/15');
    expect(short).toContain('text-rose-600');
    expect(short).toContain('border-rose-400');
    const full = renderToStaticMarkup(<ImeiInput value="359001234567890" onChange={() => {}} />);
    expect(full).toContain('15/15');
    expect(full).toContain('text-emerald-600');
    expect(full).not.toContain('border-rose-400');
    expect(renderToStaticMarkup(<ImeiInput value="" onChange={() => {}} />)).toContain('0/15');
  });

  it('hides the counter when the field is disabled (iPad has no IMEI)', () => {
    expect(renderToStaticMarkup(<ImeiInput value="" disabled onChange={() => {}} />)).not.toContain('/15');
  });

  it('blocks a trade-in whose IMEI is not 15 digits but still allows the zero placeholder with a serial', () => {
    const base = {
      enabled: true, paymentMethod: 'CASH' as const, productId: 'p1', color: 'Black', storage: '128GB',
      value: '5000', imei: '35900123456789', serialNumber: '', batteryHealth: '',
    };
    expect(getTradeInBlockedReason(base)).toBe('เทิร์น: IMEI ต้องมี 15 หลัก (ตอนนี้ 14/15)');
    expect(getTradeInBlockedReason({ ...base, imei: '359001234567890' })).toBeNull();
    expect(getTradeInBlockedReason({ ...base, imei: '0', serialNumber: 'F2LX123' })).toBeNull();
  });
});
