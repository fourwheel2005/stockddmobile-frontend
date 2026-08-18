import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintOrchestrator } from '../PrintOrchestrator';
import type { PrinterStrategy, PrinterStrategyName } from '../types';
import type { LocalBridgeStrategy } from '../strategies/LocalBridgeStrategy';
import type { CloudQueueStrategy } from '../strategies/CloudQueueStrategy';
import type { WebUsbStrategy } from '../strategies/WebUsbStrategy';

function unavailable(name: PrinterStrategyName): PrinterStrategy {
  return {
    name,
    label: () => name,
    isReady: async () => false,
    print: async () => undefined,
  };
}

function orchestratorWithoutThermalPrinter(): PrintOrchestrator {
  return new PrintOrchestrator(
    unavailable('LOCAL_BRIDGE') as unknown as LocalBridgeStrategy,
    unavailable('PULL_AGENT') as unknown as CloudQueueStrategy,
    unavailable('WEB_USB') as unknown as WebUsbStrategy,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PrintOrchestrator browser fallback', () => {
  it('uses the HTML callback supplied for the current invocation', async () => {
    vi.stubGlobal('window', { print: vi.fn() });
    const browserPrint = vi.fn(async () => undefined);

    const result = await orchestratorWithoutThermalPrinter().print(
      new Uint8Array(),
      { billNo: 'INV-001' },
      { browserPrint },
    );

    expect(result.strategy).toBe('BROWSER');
    expect(browserPrint).toHaveBeenCalledOnce();
  });

  it('does not reuse a browser callback from an earlier print', async () => {
    vi.stubGlobal('window', { print: vi.fn() });
    const orchestrator = orchestratorWithoutThermalPrinter();
    const browserPrint = vi.fn(async () => undefined);
    await orchestrator.print(new Uint8Array(), { billNo: 'INV-001' }, { browserPrint });

    await expect(orchestrator.print(new Uint8Array(), { billNo: 'INV-002' }))
      .rejects.toThrow('BROWSER: not ready');
    expect(browserPrint).toHaveBeenCalledOnce();
  });
});
