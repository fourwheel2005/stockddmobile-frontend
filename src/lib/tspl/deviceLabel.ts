import { formatInShopZone } from '@/lib/datetime';
import type { SerializedItemResponse } from '@/types/api';
import { barsBitmap, code128Modules } from './code128Bitmap';
import { getLabelConfig, labelRowWidth, validateLabelConfig, type LabelConfig } from './labelConfig';
import { TsplBuilder, type BitmapImage } from './TsplBuilder';
import { inkBounds, lineHeight, measureTextWidth, textBitmap, wrapText } from './textBitmap';

/**
 * ป้ายสติ๊กเกอร์ติดหลังเครื่อง (TSC TTP-247, 203 dpi = 8 dots/มม.)
 *
 * FIX-227 — ไม่พิมพ์ราคาดาวน์แล้ว และจัดทุกส่วนให้สมมาตรบนดวง:
 *   ป้ายใหญ่ (มาตรฐานร้าน 50×40 มม. = 400×320 dots)
 *     ┌──────────────────────────────┐  ขอบ 32 dots (4 มม.) เท่ากันทั้ง 4 ด้าน
 *     │ ชื่อรุ่น                 ▄▄▄▄ │  แถบบนสูงเท่า QR (116 dots): ข้อความ (ซ้าย) + QR (ขวา)
 *     │ สี · ความจุ             █QR█ │  → กลุ่มข้อความจัดกึ่งกลางแนวตั้งตรงกับกึ่งกลาง QR
 *     │ มือ 2 · แบต 87%         ▀▀▀▀ │    และสูงไม่เกิน QR (ข้อความ 5 บรรทัดจะย่อฟอนต์ลง 1 ระดับ)
 *     │        (เว้น 32 dots)        │
 *     │      ║║║║║ Code128 ║║║║║     │  บาร์โค้ดกึ่งกลางดวง (ซ้าย = ขวา)
 *     │           DD00004            │  ตัวเลขกึ่งกลางใต้บาร์ · ขอบล่าง 32 dots
 *     └──────────────────────────────┘
 */
const DPMM = 8;
/** ขอบซ้ายอย่างน้อย 3 มม. — ต่ำกว่านี้หัวพิมพ์ตัดอักษรตัวแรก (FIX-159) */
const MIN_SIDE_MARGIN_DOTS = 24;
const MAX_MARGIN_DOTS = 32;
const QR_CELL_DOTS = 4;
const QR_QUIET_DOTS = 4 * QR_CELL_DOTS;
const QR_BYTE_CAPACITY_L = [17, 32, 53, 78, 106];
const BAR_MODULE_DOTS = 2;
const BAR_QUIET_DOTS = 10 * BAR_MODULE_DOTS;
const BAR_TEXT_GAP_DOTS = 5;
const MIN_BAR_HEIGHT_DOTS = 32;
const MAX_BAR_HEIGHT_DOTS = 96;

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'รีเฟอร์บิช', DEFECTIVE: 'มีตำหนิ',
};

export interface DeviceLabelInput {
  item: SerializedItemResponse;
  url: string;
  /** เฉพาะอุปกรณ์เสริม ("ราคา ฿…") — เครื่องไม่พิมพ์ราคา (FIX-227) */
  priceText?: string | null;
}

interface Zone { x: number; y: number; width: number; height: number }

/** พิกัดทุกส่วนของ 1 ดวง (dots, นับจากมุมซ้ายบนของดวง) — ฟังก์ชันล้วน ทดสอบความสมมาตรได้โดยไม่ต้องพิมพ์. */
export interface DeviceLabelFrame {
  width: number;
  height: number;
  /** full = ข้อความ + QR + บาร์โค้ด · qr = ดวงเล็ก ข้อความ + QR · barcode = ดวงเล็ก ข้อความ + บาร์โค้ด */
  mode: 'full' | 'qr' | 'barcode';
  marginX: number;
  marginY: number;
  text: Zone;
  textAlign: 'left' | 'center';
  /** ตัว QR จริง (ไม่รวม quiet zone) */
  qr: { x: number; y: number; size: number } | null;
  barcode: {
    centerX: number;
    y: number;
    barHeight: number;
    fontSize: number;
    /** เส้นล่างของหมึกตัวเลขใต้บาร์ = height − marginY */
    inkBottom: number;
  } | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** ความสูงหมึกของตัวเลข/ตัวพิมพ์ใหญ่ (cap height ≈ 0.72em) — ใช้กันที่ให้บรรทัดรหัสใต้บาร์โค้ด. */
function digitInkHeight(fontSize: number): number {
  return Math.round(fontSize * 0.72);
}

function qrModules(url: string): number {
  const bytes = new TextEncoder().encode(url).length;
  const version = QR_BYTE_CAPACITY_L.findIndex((capacity) => bytes <= capacity) + 1;
  if (version === 0) throw new Error('ลิงก์ QR ยาวเกิน 106 bytes — ต้องใช้ short link /d/{stockCode}');
  return 21 + (version - 1) * 4;
}

function fullFrame(width: number, height: number, qrSize: number): DeviceLabelFrame {
  const fontSize = 18;
  const footer = BAR_TEXT_GAP_DOTS + digitInkHeight(fontSize);
  // แถบบนสูงเท่า QR พอดี → ขอบบนของดวงวัดถึง QR ได้เท่ากับขอบล่างที่วัดถึงตัวเลขใต้บาร์โค้ด
  const band = qrSize;
  let margin = clamp(Math.round(height * 0.1), 16, MAX_MARGIN_DOTS);
  let barHeight = height - 3 * margin - band - footer;
  if (barHeight > MAX_BAR_HEIGHT_DOTS) {
    barHeight = MAX_BAR_HEIGHT_DOTS;
    margin = Math.floor((height - band - footer - barHeight) / 3);
  }
  barHeight = Math.max(MIN_BAR_HEIGHT_DOTS, barHeight);
  const marginX = clamp(margin, MIN_SIDE_MARGIN_DOTS, MAX_MARGIN_DOTS);
  const qrX = width - marginX - qrSize;
  return {
    width, height, mode: 'full', marginX, marginY: margin,
    text: { x: marginX, y: margin, width: Math.max(80, qrX - QR_QUIET_DOTS - marginX), height: band },
    textAlign: 'left',
    qr: { x: qrX, y: margin, size: qrSize },
    barcode: { centerX: width / 2, y: margin + band + margin, barHeight, fontSize, inkBottom: height - margin },
  };
}

function compactQrFrame(width: number, height: number, qrSize: number): DeviceLabelFrame {
  const marginX = MIN_SIDE_MARGIN_DOTS;
  const marginY = clamp(Math.round(height * 0.06), 8, 16);
  const qrX = width - marginX - qrSize;
  return {
    width, height, mode: 'qr', marginX, marginY,
    text: { x: marginX, y: marginY, width: Math.max(80, qrX - QR_QUIET_DOTS - marginX), height: height - 2 * marginY },
    textAlign: 'left',
    qr: { x: qrX, y: Math.round((height - qrSize) / 2), size: qrSize },
    barcode: null,
  };
}

function compactBarcodeFrame(width: number, height: number): DeviceLabelFrame {
  const fontSize = 16;
  const marginX = MIN_SIDE_MARGIN_DOTS;
  const marginY = clamp(Math.round(height * 0.06), 8, 16);
  const available = height - 3 * marginY - BAR_TEXT_GAP_DOTS - digitInkHeight(fontSize);
  const barHeight = clamp(Math.round(available * 0.3), 24, 44);
  const band = Math.max(0, available - barHeight);
  return {
    width, height, mode: 'barcode', marginX, marginY,
    text: { x: marginX, y: marginY, width: width - 2 * marginX, height: band },
    textAlign: 'center',
    qr: null,
    barcode: { centerX: width / 2, y: marginY + band + marginY, barHeight, fontSize, inkBottom: height - marginY },
  };
}

export function deviceLabelFrame(config: LabelConfig, url: string): DeviceLabelFrame {
  const width = Math.round(config.w * DPMM);
  const height = Math.round(config.h * DPMM);
  const qrSize = qrModules(url) * QR_CELL_DOTS;
  const textBesideQr = width - 2 * MIN_SIDE_MARGIN_DOTS - qrSize - QR_QUIET_DOTS;
  if (height >= 30 * DPMM && textBesideQr >= 150) return fullFrame(width, height, qrSize);
  const qrFits = height >= qrSize + QR_QUIET_DOTS * 2 + 16;
  return config.code === 'qr' && qrFits ? compactQrFrame(width, height, qrSize) : compactBarcodeFrame(width, height);
}

interface LabelLine {
  text: string;
  size: number;
  bold: boolean;
  /** ลำดับความสำคัญ: ถ้าที่ไม่พอ ตัดบรรทัดเลขมากสุดออกก่อน (ชื่อรุ่น = 0 ไม่เคยถูกตัด) */
  rank: number;
}

/** ระดับขนาดตัวอักษร: ใช้ระดับแรกที่ข้อความทั้งกลุ่มสูงไม่เกินแถบ · name = ขนาดที่ลองไล่จนชื่อรุ่นไม่ถูกตัด */
interface SizeTier { name: number[]; body: number; price: number; gap: number }

const FULL_TIERS: SizeTier[] = [
  { name: [26, 24, 22, 20], body: 18, price: 27, gap: 2 },
  { name: [24, 22, 20, 18], body: 16, price: 21, gap: 0 },
  { name: [24, 22, 20, 18], body: 16, price: 16, gap: 0 },
];
const COMPACT_TIERS: SizeTier[] = [
  { name: [20, 18, 16], body: 16, price: 21, gap: 2 },
  { name: [18, 16], body: 14, price: 16, gap: 1 },
];

function fitsWidth(text: string, size: number, bold: boolean, maxWidth: number): boolean {
  const width = measureTextWidth(text, { fontSize: size, bold });
  return width == null || width <= maxWidth;
}

function labelLines(input: DeviceLabelInput, tier: SizeTier, maxWidth: number): LabelLine[] {
  const item = input.item;
  const name = item.productName ?? item.sku ?? '';
  // ชื่อรุ่นยาว (เช่น iPhone 17 Pro Max) ย่อฟอนต์ให้พอดีความกว้างก่อน · ยังไม่พอ → ขึ้น 2 บรรทัด ไม่ตัดเป็น "…"
  const fittingSize = tier.name.find((size) => fitsWidth(name, size, true, maxWidth));
  const nameSize = fittingSize ?? tier.name[tier.name.length - 1];
  const nameLines = fittingSize ? [name] : wrapText(name, { fontSize: nameSize, bold: true, maxWidth }, 2);
  const spec = [item.deviceColor, item.deviceStorage].filter(Boolean).join(' · ');
  const battery = item.condition !== 'NEW' && item.batteryHealth != null ? `แบต ${item.batteryHealth}%` : '';
  const condition = [CONDITION_TH[item.condition] ?? item.condition, battery].filter(Boolean).join(' · ');
  const combined = [spec, condition].filter(Boolean).join(' · ');
  // สี/ความจุ + สภาพ อยู่บรรทัดเดียวเมื่อพอดี · มีแบตหรือยาวเกิน → แยกสภาพลงบรรทัดถัดไป (ไม่ให้ข้อมูลท้ายถูกตัด)
  const details = !battery && fitsWidth(combined, tier.body, false, maxWidth) ? [combined] : [spec, condition];
  const warranty = formatLabelWarrantyLines(item.warrantyTerms, item.warrantyExpire);
  const lines: LabelLine[] = [
    ...nameLines.map((text): LabelLine => ({ text, size: nameSize, bold: true, rank: 0 })),
    ...details.map((text, index): LabelLine => ({ text, size: tier.body, bold: false, rank: 2 + index })),
    ...warranty.map((text, index): LabelLine => ({ text, size: tier.body, bold: false, rank: 4 + index })),
    { text: input.priceText ?? '', size: tier.price, bold: true, rank: 1 },
  ];
  return lines.filter((line) => line.text.trim());
}

function stackHeight(lines: LabelLine[], gap: number): number {
  return lines.reduce((sum, line) => sum + lineHeight(line.size), 0) + gap * Math.max(0, lines.length - 1);
}

/**
 * กล่องบรรทัดมีขอบขาวเหนือบรรทัดแรก (~0.23em) และใต้บรรทัดสุดท้าย (~0.17em) — วัดจากการเรนเดอร์จริง
 * หมึกของทั้งกลุ่มจึงเตี้ยกว่าผลรวมกล่องเท่านี้ และยังสูงไม่เกินแถบ.
 */
function fits(lines: LabelLine[], gap: number, zoneHeight: number): boolean {
  if (lines.length === 0) return true;
  const allowance = Math.round(lines[0].size * 0.23) + Math.round(lines[lines.length - 1].size * 0.17);
  return stackHeight(lines, gap) <= zoneHeight + allowance;
}

function fittedLines(input: DeviceLabelInput, frame: DeviceLabelFrame): { lines: LabelLine[]; gap: number } {
  const tiers = frame.mode === 'full' ? FULL_TIERS : COMPACT_TIERS;
  const { width, height } = frame.text;
  for (const tier of tiers) {
    const lines = labelLines(input, tier, width);
    if (fits(lines, tier.gap, height)) return { lines, gap: tier.gap };
  }
  const smallest = tiers[tiers.length - 1];
  let lines = labelLines(input, smallest, width);
  while (lines.length > 1 && !fits(lines, smallest.gap, height)) {
    const dropped = lines.reduce((worst, line) => (line.rank > worst.rank ? line : worst));
    lines = lines.filter((line) => line !== dropped);
  }
  return { lines, gap: smallest.gap };
}

interface Origin { x: number; y: number }

function place(builder: TsplBuilder, origin: Origin, x: number, y: number, image: BitmapImage): void {
  builder.bitmap(Math.max(0, origin.x + x), Math.max(0, origin.y + y), image);
}

/** x ที่ทำให้ "หมึก" ของ bitmap อยู่กึ่งกลางรอบ centerX พอดี. */
function centeredX(centerX: number, image: BitmapImage): number {
  const ink = inkBounds(image);
  const inkCenter = ink ? (ink.left + ink.right) / 2 : (image.wBytes * 8) / 2;
  return Math.round(centerX - inkCenter);
}

function drawText(builder: TsplBuilder, input: DeviceLabelInput, frame: DeviceLabelFrame, origin: Origin): void {
  const zone = frame.text;
  const { lines, gap } = fittedLines(input, frame);
  const images = lines
    .map((line) => textBitmap(line.text, { fontSize: line.size, bold: line.bold, maxWidth: zone.width }))
    .filter((image): image is BitmapImage => image != null);
  if (images.length === 0) return;
  const inks = images.map((image) => inkBounds(image));
  const last = images[images.length - 1];
  const stack = images.reduce((sum, image) => sum + image.h, 0) + gap * (images.length - 1);
  const blankTop = inks[0]?.top ?? 0;
  const lastInk = inks[inks.length - 1];
  const blankBottom = lastInk ? last.h - lastInk.bottom : 0;
  // แนวตั้ง: กึ่งกลางแถบด้วยขอบหมึกจริง (บนสุดของบรรทัดแรก → ล่างสุดของบรรทัดสุดท้าย)
  let y = zone.y + Math.round((zone.height - (stack - blankTop - blankBottom)) / 2) - blankTop;
  // แนวนอน (ชิดซ้าย): ให้หมึกซ้ายสุดของกลุ่มแตะขอบซ้ายพอดี — ขอบซ้าย = ขอบขวาของ QR เป๊ะ
  const blankLeft = Math.min(...inks.map((ink) => ink?.left ?? 0));
  for (const image of images) {
    const x = frame.textAlign === 'center' ? centeredX(zone.x + zone.width / 2, image) : zone.x - blankLeft;
    place(builder, origin, x, y, image);
    y += image.h + gap;
  }
}

export function formatLabelWarrantyExpire(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = formatInShopZone(value, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return date === '-' ? null : `หมดประกัน ${date}`;
}

export function formatLabelWarrantyLines(
  terms: string | null | undefined,
  expire: string | null | undefined,
): string[] {
  const termsLine = terms?.trim() || null;
  const expireLine = formatLabelWarrantyExpire(expire);
  return [termsLine, expireLine].filter((line): line is string => line != null);
}

function drawQr(builder: TsplBuilder, input: DeviceLabelInput, frame: DeviceLabelFrame, origin: Origin): void {
  if (!frame.qr) return;
  const safeUrl = input.url.replace(/["\r\n]/g, '');
  const x = Math.max(0, origin.x + frame.qr.x);
  const y = Math.max(0, origin.y + frame.qr.y);
  builder.raw(`QRCODE ${x},${y},L,${QR_CELL_DOTS},A,0,M2,S7,"${safeUrl}"`);
}

function labelCode(item: SerializedItemResponse): string {
  return (item.stockCode || item.imei || item.serialNumber || '').replace(/[^\x20-\x7e]/g, '');
}

function drawBarcode(builder: TsplBuilder, input: DeviceLabelInput, frame: DeviceLabelFrame, origin: Origin): void {
  const zone = frame.barcode;
  const code = labelCode(input.item);
  if (!zone || !code) return;
  // แถบ: รู้ความกว้างจริง → วางกึ่งกลางดวงพอดี; รหัสยาวเกินดวงจะไม่พิมพ์แถบ (พิมพ์แต่ตัวรหัส) ดีกว่าแถบล้นดวงยิงไม่ติด
  const modules = code128Modules(code);
  const barWidth = (modules?.length ?? 0) * BAR_MODULE_DOTS;
  if (modules && barWidth <= frame.width - 2 * BAR_QUIET_DOTS) {
    place(builder, origin, Math.round(zone.centerX - barWidth / 2), zone.y, barsBitmap(modules, BAR_MODULE_DOTS, zone.barHeight));
  }
  const text = textBitmap(code, { fontSize: zone.fontSize, bold: true, maxWidth: frame.width - 2 * frame.marginX });
  if (!text) return;
  // ให้เส้นล่างของหมึกตัวเลขตรงขอบล่างที่กำหนด → ขอบล่างของดวง = ขอบบน
  const inkBottom = inkBounds(text)?.bottom ?? Math.round(zone.fontSize * 1.1);
  place(builder, origin, centeredX(zone.centerX, text), zone.inkBottom - inkBottom, text);
}

function drawLabel(builder: TsplBuilder, input: DeviceLabelInput, column: number, config: LabelConfig): void {
  const origin: Origin = {
    x: Math.round((column * (config.w + config.gapX) + config.offsetX) * DPMM),
    y: Math.round(config.offsetY * DPMM),
  };
  const frame = deviceLabelFrame(config, input.url);
  drawText(builder, input, frame, origin);
  drawQr(builder, input, frame, origin);
  drawBarcode(builder, input, frame, origin);
}

function setup(builder: TsplBuilder, config: LabelConfig): void {
  builder.raw(`SIZE ${labelRowWidth(config)} mm,${config.h} mm`);
  builder.raw(`GAP ${config.gapY} mm,0`);
  builder.raw(`SPEED ${config.speed}`);
  builder.raw(`DENSITY ${config.density}`);
  builder.raw('DIRECTION 1');
  builder.raw('REFERENCE 0,0');
}

export function buildDeviceLabelsTspl(inputs: DeviceLabelInput[], config: LabelConfig = getLabelConfig()): Uint8Array {
  if (inputs.length === 0) throw new Error('ต้องมีอย่างน้อย 1 เครื่องสำหรับพิมพ์ป้าย');
  const configError = validateLabelConfig(config);
  if (configError) throw new Error(configError);
  const builder = new TsplBuilder();
  setup(builder, config);
  for (let start = 0; start < inputs.length; start += config.across) {
    builder.raw('CLS');
    inputs.slice(start, start + config.across)
      .forEach((input, column) => drawLabel(builder, input, column, config));
    builder.raw('PRINT 1,1');
  }
  return builder.build();
}

export { getLabelConfig } from './labelConfig';
