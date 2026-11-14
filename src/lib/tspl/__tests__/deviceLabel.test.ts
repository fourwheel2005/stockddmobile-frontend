import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SerializedItemResponse } from '@/types/api';
import {
  buildDeviceLabelsTspl,
  deviceLabelFrame,
  formatLabelWarrantyExpire,
  formatLabelWarrantyLines,
  type DeviceLabelInput,
} from '../deviceLabel';
import { DEFAULT_LABEL_CONFIG, type LabelConfig } from '../labelConfig';

const URL = 'https://www.ddmobileshop.com/d/DD00004';

function input(code: string): DeviceLabelInput {
  const item = {
    id: `serial-${code}`, variantId: 'variant-1', productId: 'product-1', sku: 'IP17-MB-256',
    productName: 'iPhone 17', stockCode: code, serialNumber: `SN-${code}`,
    status: 'IN_STOCK', condition: 'NEW', receivedAt: '2026-08-13T10:00:00',
    acquisitionType: 'PURCHASE', deviceColor: 'Mist Blue', deviceStorage: '256GB',
  } as SerializedItemResponse;
  return { item, url: URL.replace('DD00004', code) };
}

function commands(inputs: DeviceLabelInput[], config: LabelConfig = DEFAULT_LABEL_CONFIG): string {
  return new TextDecoder().decode(buildDeviceLabelsTspl(inputs, config));
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
    expect(occurrences(tspl, 'BITMAP 99,180,26,90,0,')).toBe(1);
    expect(occurrences(tspl, 'PRINT 1,1')).toBe(1);
  });

  it('pairs two different machines in the same physical row', () => {
    const tspl = commands([input('DD00004'), input('DD00005')]);
    expect(occurrences(tspl, 'QRCODE ')).toBe(2);
    expect(occurrences(tspl, 'PRINT 1,1')).toBe(1);
    expect(tspl).toContain('/d/DD00004"');
    expect(tspl).toContain('/d/DD00005"');
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

  it('places text, QR, barcode bars and code digits at the symmetric positions on both stickers', () => {
    stubCanvas();
    const tspl = commands([input('DD00004'), input('DD00005')]);
    // ดวงซ้าย: ข้อความชิดขอบ 32 · QR ชิดขอบขวา 32 (400−32−116=252) · แถบกึ่งกลาง (400−202)/2=99
    expect(tspl).toContain('BITMAP 32,59,');
    expect(tspl).toContain('BITMAP 32,97,');
    expect(tspl).toContain('QRCODE 252,32,L,4,');
    expect(tspl).toContain('BITMAP 99,180,26,90,0,');
    expect(tspl).toContain('BITMAP 168,268,8,25,0,');
    // ดวงขวา = ดวงซ้ายเลื่อนไป 53 มม. (424 dots) ทุกจุด
    expect(tspl).toContain('BITMAP 456,59,');
    expect(tspl).toContain('QRCODE 676,32,L,4,');
    expect(tspl).toContain('BITMAP 523,180,26,90,0,');
    expect(tspl).toContain('BITMAP 592,268,8,25,0,');
    expect(tspl).not.toContain('BARCODE ');
  });

  it('never prints a price on a device sticker (down payment removed)', () => {
    const renderedText = stubCanvas();
    commands([input('DD00004')]);
    expect(renderedText.some((text) => text.includes('ดาวน์') || text.includes('฿'))).toBe(false);
    expect(renderedText).toEqual(['iPhone 17', 'Mist Blue · 256GB · มือ 1', 'DD00004']);
  });

  it('still prints the full selling price of a serialized accessory', () => {
    const renderedText = stubCanvas();
    const accessory = input('DD00009');
    accessory.item.categoryRootName = 'อุปกรณ์เสริม';
    accessory.priceText = 'ราคา ฿4,290';
    commands([accessory]);
    expect(renderedText).toContain('ราคา ฿4,290');
  });

  it('shifts every element by the configured print offset', () => {
    stubCanvas();
    const tspl = commands([input('DD00004')], { ...DEFAULT_LABEL_CONFIG, offsetX: 1, offsetY: -0.5 });
    expect(tspl).toContain('BITMAP 40,55,');
    expect(tspl).toContain('QRCODE 260,28,L,4,');
    expect(tspl).toContain('BITMAP 107,176,26,90,0,');
    expect(tspl).toContain('BITMAP 176,264,8,25,0,');
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
    phone.item.warrantyTerms = 'ประกันศูนย์ Apple 1 ปี';
    phone.item.warrantyExpire = '2026-12-26T16:59:59';
    commands([phone]);
    expect(renderedText).toContain('ประกันศูนย์ Apple 1 ปี');
    expect(renderedText).toContain('หมดประกัน 26/12/2569');
    expect(formatLabelWarrantyExpire(null)).toBeNull();
    expect(formatLabelWarrantyExpire('not-a-date')).toBeNull();
  });

  it('prints warranty terms even when an unactivated device has no expiry date', () => {
    const renderedText = stubCanvas();
    const phone = input('DD00004');
    phone.item.warrantyTerms = 'ประกันศูนย์ 1 ปี (Apple)';
    commands([phone]);
    expect(renderedText).toContain('ประกันศูนย์ 1 ปี (Apple)');
    expect(formatLabelWarrantyLines('  ประกันศูนย์ 1 ปี (Apple)  ', null))
      .toEqual(['ประกันศูนย์ 1 ปี (Apple)']);
  });

  it('fits all five lines of a second-hand device inside the text band, above the barcode', () => {
    const renderedText = stubCanvas();
    const used = input('DD00004');
    used.item.condition = 'SECOND_HAND';
    used.item.batteryHealth = 100;
    used.item.warrantyTerms = 'ประกันร้าน 1 ปี';
    used.item.warrantyExpire = '2026-12-26T16:59:59';
    const tspl = commands([used]);
    expect(renderedText).toEqual([
      'iPhone 17', 'Mist Blue · 256GB', 'มือ 2 · แบต 100%', 'ประกันร้าน 1 ปี', 'หมดประกัน 26/12/2569', 'DD00004',
    ]);
    // 5 บรรทัดย่อฟอนต์ 1 ระดับ (24/16) = กล่องรวม 121 จัดกึ่งกลางแถบ 116 → y=30..151 ก่อนแถบบาร์โค้ด (y=180)
    expect(tspl).toContain('BITMAP 32,30,10,33,0,');
    expect(tspl).toContain('BITMAP 32,129,');
    expect(tspl).toContain('BITMAP 99,180,26,90,0,');
  });
});

describe('deviceLabelFrame symmetry', () => {
  it('uses the same 32-dot (4 mm) margin on all four sides of the standard 50x40 sticker', () => {
    const frame = deviceLabelFrame(DEFAULT_LABEL_CONFIG, URL);
    const qr = frame.qr!;
    const barcode = frame.barcode!;
    expect(frame).toMatchObject({ width: 400, height: 320, mode: 'full', marginX: 32, marginY: 32 });
    expect(frame.text.x).toBe(32);                                  // ขอบซ้ายของข้อความ
    expect(frame.width - (qr.x + qr.size)).toBe(32);                // ขอบขวาของ QR
    expect(qr.y).toBe(32);                                          // ขอบบนเหนือ QR
    expect(frame.height - barcode.inkBottom).toBe(32);              // ขอบล่างใต้ตัวเลขบาร์โค้ด
  });

  it('gives the text the exact QR band and centres the barcode on the sticker', () => {
    const frame = deviceLabelFrame(DEFAULT_LABEL_CONFIG, URL);
    const qr = frame.qr!;
    const barcode = frame.barcode!;
    expect([frame.text.y, frame.text.height]).toEqual([qr.y, qr.size]);   // ข้อความกับ QR ใช้แถบเดียวกัน → กึ่งกลางตรงกัน
    expect(barcode.centerX).toBe(frame.width / 2);                        // บาร์โค้ดกึ่งกลางแนวนอนของดวง
    expect(barcode.y - (qr.y + qr.size)).toBe(frame.marginY);             // ช่องว่างกลาง = ขอบ
    expect(qr.x - 16).toBe(frame.text.x + frame.text.width);              // ข้อความจบที่ quiet zone ของ QR พอดี
    // ผลรวมแนวตั้งเท่าความสูงดวงพอดี: ขอบ + QR + ช่อง + แถบบาร์ + ช่อง 5 + ตัวเลข 13 + ขอบ
    expect(frame.marginY + qr.size + frame.marginY + barcode.barHeight + 5 + 13 + frame.marginY).toBe(320);
  });

  it('keeps small QR-only and barcode-only stickers balanced too', () => {
    const qrFrame = deviceLabelFrame({ ...DEFAULT_LABEL_CONFIG, w: 35, h: 25, code: 'qr' }, URL);
    expect(qrFrame.mode).toBe('qr');
    expect(qrFrame.qr!.y).toBe(qrFrame.height - (qrFrame.qr!.y + qrFrame.qr!.size));
    expect(qrFrame.text.x).toBe(qrFrame.width - (qrFrame.qr!.x + qrFrame.qr!.size));

    const barFrame = deviceLabelFrame({ ...DEFAULT_LABEL_CONFIG, w: 35, h: 25, code: 'barcode' }, URL);
    expect(barFrame.mode).toBe('barcode');
    expect(barFrame.textAlign).toBe('center');
    expect(barFrame.barcode!.centerX).toBe(barFrame.width / 2);
    expect(barFrame.text.y).toBe(barFrame.height - barFrame.barcode!.inkBottom);
    expect(barFrame.text.x).toBe(barFrame.width - (barFrame.text.x + barFrame.text.width));
  });
});
