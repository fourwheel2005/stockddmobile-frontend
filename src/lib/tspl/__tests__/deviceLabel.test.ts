import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SerializedItemResponse } from '@/types/api';
import { buildDeviceLabelsTspl, formatLabelWarrantyExpire, type DeviceLabelInput } from '../deviceLabel';
import { DEFAULT_LABEL_CONFIG } from '../labelConfig';

const URL = 'https://www.ddmobileshop.com/d/DD00004';

function input(code: string): DeviceLabelInput {
  const item = {
    id: `serial-${code}`, variantId: 'variant-1', productId: 'product-1', sku: 'IP17-MB-256',
    productName: 'iPhone 17', stockCode: code, serialNumber: `SN-${code}`,
    status: 'IN_STOCK', condition: 'NEW', receivedAt: '2026-08-13T10:00:00',
    acquisitionType: 'PURCHASE', deviceColor: 'Mist Blue', deviceStorage: '256GB',
  } as SerializedItemResponse;
  return { item, url: URL.replace('DD00004', code), priceText: 'ดาวน์ ฿8,990' };
}

function commands(inputs: DeviceLabelInput[]): string {
  return new TextDecoder().decode(buildDeviceLabelsTspl(inputs, DEFAULT_LABEL_CONFIG));
}

function occurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

function stubCanvas(): string[] {
  const renderedText: string[] = [];
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 8 }),
        fillRect: () => undefined,
        fillText: (text: string) => renderedText.push(text),
        getImageData: (_x: number, _y: number, width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4).fill(255),
        }),
      }),
    }),
  });
  return renderedText;
}

afterEach(() => vi.unstubAllGlobals());

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
    expect(tspl).toContain(',A,0,M2,S7,"https://www.ddmobileshop.com/d/DD00004"');
  });

  it('keeps text and barcode three millimetres inside each sticker left edge', () => {
    stubCanvas();
    const tspl = commands([input('DD00004'), input('DD00005')]);
    expect(tspl).toContain('BITMAP 24,8,');
    expect(tspl).toContain('BARCODE 24,238,');
    expect(tspl).toContain('BITMAP 448,8,');
    expect(tspl).toContain('BARCODE 448,238,');
  });

  it('prints second-hand battery health on a dedicated visible detail line', () => {
    const renderedText = stubCanvas();
    const used = input('DD00004');
    used.item.condition = 'SECOND_HAND';
    used.item.batteryHealth = 87;
    commands([used]);
    expect(renderedText).toContain('Mist Blue · 256GB');
    expect(renderedText).toContain('มือ 2 · แบต 87%');
  });

  it('prints the stored warranty expiry using the shop timezone and Buddhist year', () => {
    const renderedText = stubCanvas();
    const phone = input('DD00004');
    phone.item.warrantyExpire = '2026-12-26T16:59:59';
    commands([phone]);
    expect(renderedText).toContain('ประกันถึง 26/12/2569');
    expect(formatLabelWarrantyExpire(null)).toBeNull();
    expect(formatLabelWarrantyExpire('not-a-date')).toBeNull();
  });

  it('keeps second-hand battery, warranty, and price above the barcode zone', () => {
    const renderedText = stubCanvas();
    const used = input('DD00004');
    used.item.condition = 'SECOND_HAND';
    used.item.batteryHealth = 100;
    used.item.warrantyExpire = '2026-12-26T16:59:59';
    const tspl = commands([used]);
    expect(renderedText).toContain('มือ 2 · แบต 100%');
    expect(renderedText).toContain('ประกันถึง 26/12/2569');
    expect(renderedText).toContain('ดาวน์ ฿8,990');
    expect(tspl).toContain('BITMAP 24,127,');
    expect(tspl).toContain('BARCODE 24,238,');
  });
});
