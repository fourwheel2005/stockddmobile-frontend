import type { SalesOrderResponse } from '@/types/api';
import { TsplBuilder } from './TsplBuilder';
import type { BitmapImage } from './TsplBuilder';
import { drawingBitmap, textBitmap, wrapText, type TextBitmapOptions } from './textBitmap';

const DPMM = 8;
const LABEL_WIDTH_MM = 100;
const LABEL_HEIGHT_MM = 150;
const CONTENT_X = 38;
const CONTENT_WIDTH = 724;
const BODY: TextBitmapOptions = { fontSize: 28, bold: false, maxWidth: CONTENT_WIDTH };
const BODY_BOLD: TextBitmapOptions = { fontSize: 30, bold: true, maxWidth: CONTENT_WIDTH };

export const SHIPPING_LABEL_SENDER = {
  name: 'ดีดีโมบาย',
  address: ['555/133 หมู่1', 'ต.บางแก้ว อ.เมือง', 'จ.สมุทรสงคราม 75000'],
  phone: '0839358181',
} as const;

export interface ShippingLabelRecipient {
  name: string;
  address: string;
  phone: string;
}

type RecipientOrder = Pick<SalesOrderResponse, 'customerName' | 'customerPhone' | 'shippingAddress'>
  & Partial<Pick<SalesOrderResponse, 'shippingRecipientName' | 'shippingRecipientPhone'>>;

export function recipientFromOrder(order: RecipientOrder): ShippingLabelRecipient {
  return {
    name: order.shippingRecipientName?.trim() || order.customerName?.trim() || '',
    address: order.shippingAddress?.trim() ?? '',
    phone: order.shippingRecipientPhone?.trim() || order.customerPhone?.trim() || '',
  };
}

export function validateShippingRecipient(recipient: ShippingLabelRecipient): string | null {
  if (!recipient.name.trim()) return 'กรุณากรอกชื่อผู้รับ';
  if (!recipient.address.trim()) return 'กรุณากรอกที่อยู่ผู้รับ';
  if (!recipient.phone.trim()) return 'กรุณากรอกเบอร์โทรผู้รับ';
  const phoneDigits = recipient.phone.replace(/\D/g, '').length;
  if (phoneDigits < 9 || phoneDigits > 15) return 'เบอร์โทรผู้รับต้องมีตัวเลข 9-15 หลัก';
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

type HandlingIcon = 'FRAGILE' | 'HANDLE_WITH_CARE' | 'KEEP_DRY' | 'THIS_SIDE_UP';

function iconBitmap(icon: HandlingIcon): BitmapImage | null {
  return drawingBitmap(126, 118, (context) => {
    context.lineWidth = 7;
    if (icon === 'FRAGILE') {
      context.beginPath();
      context.moveTo(28, 16); context.lineTo(98, 16); context.lineTo(86, 66);
      context.quadraticCurveTo(63, 84, 40, 66); context.closePath(); context.stroke();
      context.beginPath();
      context.moveTo(63, 18); context.lineTo(53, 39); context.lineTo(70, 51); context.lineTo(57, 69); context.stroke();
      context.fillRect(57, 78, 12, 27); context.fillRect(35, 103, 56, 8);
      return;
    }
    if (icon === 'HANDLE_WITH_CARE') {
      context.strokeRect(43, 18, 42, 42);
      context.beginPath();
      context.moveTo(18, 98); context.lineTo(18, 60); context.lineTo(40, 83);
      context.quadraticCurveTo(50, 94, 60, 96);
      context.moveTo(108, 98); context.lineTo(108, 60); context.lineTo(86, 83);
      context.quadraticCurveTo(76, 94, 66, 96); context.stroke();
      return;
    }
    if (icon === 'KEEP_DRY') {
      context.beginPath(); context.arc(63, 55, 43, Math.PI, 2 * Math.PI); context.stroke();
      context.beginPath();
      context.moveTo(20, 55); context.quadraticCurveTo(31, 43, 42, 55);
      context.quadraticCurveTo(53, 43, 63, 55); context.quadraticCurveTo(74, 43, 85, 55);
      context.quadraticCurveTo(96, 43, 106, 55); context.stroke();
      context.beginPath(); context.moveTo(63, 55); context.lineTo(63, 98);
      context.quadraticCurveTo(63, 112, 76, 105); context.stroke();
      return;
    }
    context.fillRect(27, 43, 10, 62); context.fillRect(88, 43, 10, 62);
    context.beginPath();
    context.moveTo(16, 48); context.lineTo(32, 18); context.lineTo(48, 48);
    context.moveTo(77, 48); context.lineTo(93, 18); context.lineTo(109, 48); context.fill();
    context.fillRect(14, 106, 98, 8);
  });
}

function drawHandlingBox(builder: TsplBuilder, x: number, y: number, icon: HandlingIcon): void {
  builder.raw(`BOX ${x},${y},${x + 150},${y + 142},3`);
  const image = iconBitmap(icon);
  if (image) builder.bitmap(x + 12, y + 12, image);
}

function drawFooter(builder: TsplBuilder, lineQrImage?: BitmapImage): void {
  builder.raw('BAR 38,755,724,4');
  drawHandlingBox(builder, 48, 798, 'FRAGILE');
  drawHandlingBox(builder, 218, 798, 'HANDLE_WITH_CARE');
  drawHandlingBox(builder, 48, 958, 'KEEP_DRY');
  drawHandlingBox(builder, 218, 958, 'THIS_SIDE_UP');
  if (lineQrImage) builder.bitmap(500, 820, lineQrImage);
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

export function buildShippingLabelTspl(
  recipient: ShippingLabelRecipient,
  lineQrImage?: BitmapImage,
): Uint8Array {
  const validationError = validateShippingRecipient(recipient);
  if (validationError) throw new Error(validationError);
  const builder = new TsplBuilder();
  setup(builder);
  drawSender(builder);
  drawRecipient(builder, recipient);
  drawFooter(builder, lineQrImage);
  builder.raw('PRINT 1,1');
  return builder.build();
}
