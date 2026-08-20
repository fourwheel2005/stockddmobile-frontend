import type { SalesOrderResponse } from '@/types/api';
import { TsplBuilder } from './TsplBuilder';
import { textBitmap, wrapText, type TextBitmapOptions } from './textBitmap';

const DPMM = 8;
const LABEL_WIDTH_MM = 100;
const LABEL_HEIGHT_MM = 150;
const CONTENT_X = 38;
const CONTENT_WIDTH = 724;
const SHOP_URL = 'https://www.ddmobileshop.com';
const BODY: TextBitmapOptions = { fontSize: 28, bold: false, maxWidth: CONTENT_WIDTH };
const BODY_BOLD: TextBitmapOptions = { fontSize: 30, bold: true, maxWidth: CONTENT_WIDTH };

export const SHIPPING_LABEL_SENDER = {
  name: 'ดีดีโมบาย',
  address: ['734/51 ถ.ราชญาติรักษา', 'ต.แม่กลอง อ.เมืองสมุทรสงคราม', 'จ.สมุทรสงคราม 75000'],
  phone: '0888188385',
} as const;

export interface ShippingLabelRecipient {
  name: string;
  address: string;
  phone: string;
}

export function recipientFromOrder(order: Pick<SalesOrderResponse,
  'customerName' | 'customerPhone' | 'shippingAddress'>): ShippingLabelRecipient {
  return {
    name: order.customerName?.trim() ?? '',
    address: order.shippingAddress?.trim() ?? '',
    phone: order.customerPhone?.trim() ?? '',
  };
}

export function validateShippingRecipient(recipient: ShippingLabelRecipient): string | null {
  if (!recipient.name.trim()) return 'กรุณากรอกชื่อผู้รับ';
  if (!recipient.address.trim()) return 'กรุณากรอกที่อยู่ผู้รับ';
  if (!recipient.phone.trim()) return 'กรุณากรอกเบอร์โทรผู้รับ';
  if (recipient.name.length > 80) return 'ชื่อผู้รับต้องไม่เกิน 80 ตัวอักษร';
  if (recipient.address.length > 300) return 'ที่อยู่ผู้รับต้องไม่เกิน 300 ตัวอักษร';
  if (recipient.phone.length > 30) return 'เบอร์โทรผู้รับต้องไม่เกิน 30 ตัวอักษร';
  return null;
}

function drawText(builder: TsplBuilder, text: string, y: number, options = BODY): number {
  const image = textBitmap(text, options);
  if (!image) return y;
  builder.bitmap(CONTENT_X, y, image);
  return y + image.h + 5;
}

function drawSender(builder: TsplBuilder): void {
  let y = drawText(builder, 'ผู้ส่ง :', 42, BODY_BOLD);
  y = drawText(builder, SHIPPING_LABEL_SENDER.name, y, { ...BODY_BOLD, fontSize: 36 });
  for (const line of SHIPPING_LABEL_SENDER.address) y = drawText(builder, line, y, BODY);
  drawText(builder, `โทร. ${SHIPPING_LABEL_SENDER.phone}`, y, BODY_BOLD);
  builder.raw('BAR 38,323,724,4');
}

function drawRecipient(builder: TsplBuilder, recipient: ShippingLabelRecipient): void {
  let y = drawText(builder, 'ผู้รับ :', 354, { ...BODY_BOLD, fontSize: 34 });
  y = drawText(builder, `คุณ ${recipient.name.trim()}`, y, { ...BODY_BOLD, fontSize: 34 });
  const address = wrapText(recipient.address.trim(), BODY, 4);
  for (const line of address) y = drawText(builder, line, y, BODY);
  drawText(builder, `โทร. ${recipient.phone.trim()}`, Math.max(y + 8, 620), BODY_BOLD);
}

function drawHandlingBox(builder: TsplBuilder, x: number, y: number, label: string): void {
  builder.raw(`BOX ${x},${y},${x + 150},${y + 142},3`);
  const lines = wrapText(label, { ...BODY_BOLD, maxWidth: 126 }, 2);
  lines.forEach((line, index) => {
    const image = textBitmap(line, { ...BODY_BOLD, fontSize: 25, maxWidth: 126 });
    if (image) builder.bitmap(x + 12, y + 38 + index * 36, image);
  });
}

function drawFooter(builder: TsplBuilder): void {
  builder.raw('BAR 38,755,724,4');
  drawHandlingBox(builder, 48, 798, 'ระวังแตก');
  drawHandlingBox(builder, 218, 798, 'จับเบา');
  drawHandlingBox(builder, 48, 958, 'ห้ามเปียก');
  drawHandlingBox(builder, 218, 958, 'ด้านบน ↑↑');
  const scan = textBitmap('SCAN WEBSITE', { fontSize: 25, bold: true, maxWidth: 210 });
  if (scan) builder.bitmap(530, 828, scan);
  builder.raw(`QRCODE 555,872,L,5,A,0,M2,S7,"${SHOP_URL}"`);
  const brand = textBitmap('DD MOBILE', { fontSize: 21, bold: true, maxWidth: 180 });
  if (brand) builder.bitmap(575, 1098, brand);
}

function setup(builder: TsplBuilder): void {
  builder.raw(`SIZE ${LABEL_WIDTH_MM} mm,${LABEL_HEIGHT_MM} mm`);
  builder.raw('GAP 3 mm,0');
  builder.raw('SPEED 3');
  builder.raw('DENSITY 8');
  builder.raw('DIRECTION 1');
  builder.raw('REFERENCE 0,0');
  builder.raw('CLS');
  builder.raw(`BOX 16,16,${LABEL_WIDTH_MM * DPMM - 16},${LABEL_HEIGHT_MM * DPMM - 16},4`);
}

export function buildShippingLabelTspl(recipient: ShippingLabelRecipient): Uint8Array {
  const validationError = validateShippingRecipient(recipient);
  if (validationError) throw new Error(validationError);
  const builder = new TsplBuilder();
  setup(builder);
  drawSender(builder);
  drawRecipient(builder, recipient);
  drawFooter(builder);
  builder.raw('PRINT 1,1');
  return builder.build();
}
