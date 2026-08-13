import { describe, expect, it } from 'vitest';
import type { SerializedItemResponse } from '@/types/api';
import { buildDeviceLabelsTspl, type DeviceLabelInput } from '../deviceLabel';
import { DEFAULT_LABEL_CONFIG } from '../labelConfig';

const URL = 'https://ddmobilewebsite.fourwheel.in.th/d/DD00004';

function input(code: string): DeviceLabelInput {
  const item = {
    id: `serial-${code}`, variantId: 'variant-1', productId: 'product-1', sku: 'IP17-MB-256',
    productName: 'iPhone 17', stockCode: code, serialNumber: `SN-${code}`,
    status: 'IN_STOCK', condition: 'NEW', receivedAt: '2026-08-13T10:00:00',
    acquisitionType: 'PURCHASE', deviceColor: 'Mist Blue', deviceStorage: '256GB',
  } as SerializedItemResponse;
  return { item, url: URL.replace('DD00004', code), downPayment: 8990 };
}

function commands(inputs: DeviceLabelInput[]): string {
  return new TextDecoder().decode(buildDeviceLabelsTspl(inputs, DEFAULT_LABEL_CONFIG));
}

function occurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

describe('buildDeviceLabelsTspl', () => {
  it('prints one machine on only one physical sticker in a two-up row', () => {
    const tspl = commands([input('DD00004')]);
    expect(occurrences(tspl, 'QRCODE ')).toBe(1);
    expect(occurrences(tspl, 'BARCODE ')).toBe(1);
    expect(occurrences(tspl, 'PRINT 1,1')).toBe(1);
  });

  it('pairs two different machines in the same physical row', () => {
    const tspl = commands([input('DD00004'), input('DD00005')]);
    expect(occurrences(tspl, 'QRCODE ')).toBe(2);
    expect(occurrences(tspl, 'PRINT 1,1')).toBe(1);
    expect(tspl).toContain('DD00004');
    expect(tspl).toContain('DD00005');
  });

  it('uses a second row only for the third machine', () => {
    const tspl = commands([input('DD00004'), input('DD00005'), input('DD00006')]);
    expect(occurrences(tspl, 'QRCODE ')).toBe(3);
    expect(occurrences(tspl, 'PRINT 1,1')).toBe(2);
  });

  it('uses smartphone QR Model 2, explicit print quality, and the 103x40mm two-up row', () => {
    const tspl = commands([input('DD00004')]);
    expect(tspl).toContain('SIZE 103 mm,40 mm');
    expect(tspl).toContain('SPEED 3');
    expect(tspl).toContain('DENSITY 8');
    expect(tspl).toContain(',A,0,M2,S7,"https://ddmobilewebsite.fourwheel.in.th/d/DD00004"');
  });
});
