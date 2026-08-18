import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserPrintStrategy } from '../strategies/BrowserPrintStrategy';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrowserPrintStrategy', () => {
  it('is not ready without HTML for the current job', async () => {
    vi.stubGlobal('window', { print: vi.fn() });

    await expect(new BrowserPrintStrategy().isReady()).resolves.toBe(false);
  });

  it('executes the callback bound to this print invocation', async () => {
    vi.stubGlobal('window', { print: vi.fn() });
    const callback = vi.fn(async () => undefined);
    const strategy = new BrowserPrintStrategy(callback);

    await expect(strategy.isReady()).resolves.toBe(true);
    await strategy.print(new Uint8Array(), { billNo: 'INV-001' });

    expect(callback).toHaveBeenCalledOnce();
  });
});
