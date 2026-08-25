import type { SalesOrderResponse } from '@/types/api';
import { TsplBuilder } from './TsplBuilder';
import type { BitmapImage } from './TsplBuilder';
import { textBitmap, wrapText, type TextBitmapOptions } from './textBitmap';

const DPMM = 8;
const LABEL_WIDTH_MM = 100;
const LABEL_HEIGHT_MM = 150;
const CONTENT_X = 38;
const CONTENT_WIDTH = 724;
const BODY: TextBitmapOptions = { fontSize: 28, bold: false, maxWidth: CONTENT_WIDTH };
const BODY_BOLD: TextBitmapOptions = { fontSize: 30, bold: true, maxWidth: CONTENT_WIDTH };
const SENDER_BODY: TextBitmapOptions = { fontSize: 26, bold: false, maxWidth: 410 };
const SENDER_BOLD: TextBitmapOptions = { fontSize: 29, bold: true, maxWidth: 410 };

export const SHIPPING_LABEL_SENDER = {
  name: 'ดีดีโมบาย',
  address: ['734/51 ต.แม่กลอง อ.เมือง', 'จ.สมุทรสงคราม 75000'],
  phone: '088-818-8385',
} as const;

export const SHIPPING_LABEL_SOCIAL = {
  tiktok: 'ddmobileplus',
  facebook: 'ดีดีโมบาย ไอโฟนผ่อนง่าย (สำรอง)',
} as const;

export interface ShippingLabelBranding {
  senderName: string;
  senderAddress: string[];
  senderPhone: string;
  tiktok: string;
  facebook: string;
}

export const DEFAULT_SHIPPING_LABEL_BRANDING: ShippingLabelBranding = {
  senderName: SHIPPING_LABEL_SENDER.name,
  senderAddress: [...SHIPPING_LABEL_SENDER.address],
  senderPhone: SHIPPING_LABEL_SENDER.phone,
  tiktok: SHIPPING_LABEL_SOCIAL.tiktok,
  facebook: SHIPPING_LABEL_SOCIAL.facebook,
};

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

function drawTextAt(builder: TsplBuilder, text: string, x: number, y: number,
                    options: TextBitmapOptions): number {
  const image = textBitmap(text, options);
  if (!image) return y;
  builder.bitmap(x, y, image);
  return y + image.h + 5;
}

function drawSender(builder: TsplBuilder, branding: ShippingLabelBranding,
                    lineQrImage?: BitmapImage): void {
  let y = drawTextAt(builder, 'ผู้ส่ง :', CONTENT_X, 42, SENDER_BOLD);
  y = drawTextAt(builder, branding.senderName, CONTENT_X, y,
    { ...SENDER_BOLD, fontSize: 36 });
  for (const line of branding.senderAddress) {
    y = drawTextAt(builder, line, CONTENT_X, y, SENDER_BODY);
  }
  drawTextAt(builder, `โทร. ${branding.senderPhone}`, CONTENT_X, y, SENDER_BOLD);
  if (lineQrImage) builder.bitmap(470, 36, lineQrImage);
  builder.raw('BAR 38,500,724,4');
}

function drawRecipient(builder: TsplBuilder, recipient: ShippingLabelRecipient): void {
  let y = drawText(builder, 'ผู้รับ :', 526, { ...BODY_BOLD, fontSize: 34 });
  y = drawText(builder, `คุณ ${recipient.name.trim()}`, y, { ...BODY_BOLD, fontSize: 34 });
  const addressText = removeDuplicatedPhone(recipient.address, recipient.phone);
  const address = wrapText(addressText, BODY, 3);
  for (const line of address) y = drawText(builder, line, y, BODY);
  drawText(builder, `โทร. ${recipient.phone.trim()}`, Math.max(y + 8, 740), BODY_BOLD);
}

export function removeDuplicatedPhone(address: string, phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const phonePattern = /(?:โทร(?:ศัพท์)?\.?\s*:?\s*)?(?:\+66|0)[\d()\s-]{8,}/gi;
  return address
    .replace(phonePattern, (candidate) => {
      const candidateDigits = candidate.replace(/\D/g, '');
      return digits.length >= 9 && candidateDigits.includes(digits) ? ' ' : candidate;
    })
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function drawFooter(
  builder: TsplBuilder,
  branding: ShippingLabelBranding,
  handlingSymbolsImage?: BitmapImage,
): void {
  // Recipient content ends no lower than ~790 dots; keep a physical safety gap before footer.
  builder.raw('BAR 38,875,724,4');
  if (handlingSymbolsImage) builder.bitmap(48, 886, handlingSymbolsImage);

  const social: TextBitmapOptions = { fontSize: 25, bold: true, maxWidth: 350 };
  let y = drawTextAt(builder, `TikTok : ${branding.tiktok}`, 405, 915, social);
  y = drawTextAt(builder, 'Facebook :', 405, y + 18, social);
  for (const line of wrapText(branding.facebook, social, 3)) {
    y = drawTextAt(builder, line, 405, y, social);
  }
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
  branding: ShippingLabelBranding = DEFAULT_SHIPPING_LABEL_BRANDING,
  handlingSymbolsImage?: BitmapImage,
): Uint8Array {
  const validationError = validateShippingRecipient(recipient);
  if (validationError) throw new Error(validationError);
  const builder = new TsplBuilder();
  setup(builder);
  drawSender(builder, branding, lineQrImage);
  drawRecipient(builder, recipient);
  drawFooter(builder, branding, handlingSymbolsImage);
  builder.raw('PRINT 1,1');
  return builder.build();
}
