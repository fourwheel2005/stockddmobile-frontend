import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildShippingLabelTspl,
  recipientFromOrder,
  validateShippingRecipient,
  type ShippingLabelRecipient,
} from '../shippingLabel';

const RECIPIENT: ShippingLabelRecipient = {
  name: 'สมชาย ใจดี',
  address: '99/9 ต.แม่กลอง อ.เมืองสมุทรสงคราม จ.สมุทรสงคราม 75000',
  phone: '0812345678',
};

const LINE_QR_BITMAP = {
  data: new Uint8Array([0xaa, 0x55]),
  wBytes: 1,
  h: 2,
};

function stubCanvas(): string[] {
  const renderedText: string[] = [];
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 12 }),
        fillRect: () => undefined,
        fillText: (text: string) => renderedText.push(text),
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        quadraticCurveTo: () => undefined,
        closePath: () => undefined,
        stroke: () => undefined,
        strokeRect: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        getImageData: (_x: number, _y: number, width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4).fill(255),
        }),
      }),
    }),
  });
  return renderedText;
}

function commands(recipient = RECIPIENT): string {
  return new TextDecoder().decode(buildShippingLabelTspl(recipient, LINE_QR_BITMAP));
}

afterEach(() => vi.unstubAllGlobals());

describe('buildShippingLabelTspl', () => {
  it('configures one portrait 100x150mm sticker for TTP-247', () => {
    const tspl = commands();
    expect(tspl).toContain('SIZE 100 mm,150 mm');
    expect(tspl).toContain('GAP 3 mm,0');
    expect(tspl).toContain('BOX 16,16,784,1184,4');
    expect(tspl.match(/PRINT 1,1/g)).toHaveLength(1);
  });

  it('renders fixed sender and editable recipient as Thai bitmaps', () => {
    const rendered = stubCanvas();
    commands();
    expect(rendered).toContain('ดีดีโมบาย');
    expect(rendered).toContain('555/133 หมู่1');
    expect(rendered).toContain('โทร. 0839358181');
    expect(rendered).toContain('คุณ สมชาย ใจดี');
    expect(rendered).toContain('โทร. 0812345678');
  });

  it('prints the compact LINE artwork and four handling pictograms', () => {
    const tspl = commands();
    expect(tspl).toContain('BITMAP 500,820,1,2,0,');
    expect(tspl).not.toContain('QRCODE');
    expect(tspl).not.toContain('SCAN WEBSITE');
    expect(tspl.match(/BOX (48|218),(798|958)/g)).toHaveLength(4);
  });

  it('does not allow recipient content to inject TSPL commands', () => {
    const tspl = commands({ ...RECIPIENT, name: 'ลูกค้า\r\nPRINT 9,9' });
    expect(tspl).not.toContain('PRINT 9,9');
    expect(tspl.match(/PRINT 1,1/g)).toHaveLength(1);
  });
});

describe('shipping recipient', () => {
  it('prefills recipient fields from the sales order', () => {
    expect(recipientFromOrder({
      customerName: ' ลูกค้า ', customerPhone: ' 0890000000 ', shippingAddress: ' ที่อยู่ ',
    })).toEqual({ name: 'ลูกค้า', phone: '0890000000', address: 'ที่อยู่' });
  });

  it('prefers the immutable shipping recipient snapshot over the buyer', () => {
    expect(recipientFromOrder({
      customerName: 'ผู้ซื้อ', customerPhone: '0800000000', shippingAddress: 'ที่อยู่ผู้รับ',
      shippingRecipientName: 'ผู้รับจริง', shippingRecipientPhone: '0899999999',
    })).toEqual({ name: 'ผู้รับจริง', phone: '0899999999', address: 'ที่อยู่ผู้รับ' });
  });

  it.each([
    [{ ...RECIPIENT, name: '' }, 'กรุณากรอกชื่อผู้รับ'],
    [{ ...RECIPIENT, address: ' ' }, 'กรุณากรอกที่อยู่ผู้รับ'],
    [{ ...RECIPIENT, phone: '' }, 'กรุณากรอกเบอร์โทรผู้รับ'],
    [{ ...RECIPIENT, phone: '12345678' }, 'เบอร์โทรผู้รับต้องมีตัวเลข 9-15 หลัก'],
  ])('rejects incomplete shipping data', (recipient, message) => {
    expect(validateShippingRecipient(recipient)).toBe(message);
  });
});
