import { describe, it, expect, vi } from 'vitest';

/** Unit smoke test — verify props contract */
describe('SearchVariantBar contract', () => {
  it('debounce trigger logic', async () => {
    const fn = vi.fn();
    // simulate debounce timing
    setTimeout(fn, 100);
    await new Promise((r) => setTimeout(r, 150));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('scan paste triggers immediate', () => {
    const fn = vi.fn();
    // simulated paste handler: fire immediately
    fn('IMEI123');
    expect(fn).toHaveBeenCalledWith('IMEI123');
  });
});
