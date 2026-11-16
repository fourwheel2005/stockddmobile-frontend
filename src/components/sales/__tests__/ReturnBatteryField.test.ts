import { describe, expect, it } from 'vitest';
import { parseBattery } from '../ReturnBatteryField';

describe('parseBattery (FIX-229)', () => {
  it('blank keeps the saved battery', () => {
    expect(parseBattery('  ')).toEqual({ value: undefined, error: null });
  });
  it('accepts whole percentages 0-100 only', () => {
    expect(parseBattery('85').value).toBe(85);
    expect(parseBattery('101').error).toContain('0-100');
    expect(parseBattery('85.5').error).toContain('0-100');
    expect(parseBattery('-1').error).toContain('0-100');
  });
});
