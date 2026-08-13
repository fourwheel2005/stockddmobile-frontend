import { encodeCp874 } from '@/lib/escpos/cp874';
import { formatInShopZone } from '@/lib/datetime';
import type { SerializedItemResponse } from '@/types/api';
import { formatDeviceLabelPrice } from './labelPrice';
import { getLabelConfig, labelRowWidth, validateLabelConfig, type LabelConfig } from './labelConfig';

const DPMM = 8;
const LABEL_MARGIN_DOTS = 8;
const LABEL_LEFT_SAFE_DOTS = 24;
const QR_CELL_DOTS = 4;
const QR_QUIET_MODULES = 4;
const QR_BYTE_CAPACITY_L = [17, 32, 53, 78, 106];

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'รีเฟอร์บิช', DEFECTIVE: 'มีตำหนิ',
};

export interface DeviceLabelInput {
  item: SerializedItemResponse;
  url: string;
  priceText: string;
}

interface BitmapImage { data: Uint8Array; wBytes: number; h: number }
interface LabelGeometry {
  width: number;
  height: number;
  qrArea: number;
  qrQuiet: number;
  qrSymbol: number;
  big: boolean;
  smallQr: boolean;
  textWidth: number;
}

class TsplBuilder {
  private readonly parts: Uint8Array[] = [];

  raw(command: string): void {
    this.parts.push(encodeCp874(`${command}\r\n`));
  }

  bitmap(x: number, y: number, image: BitmapImage): void {
    this.parts.push(encodeCp874(`BITMAP ${x},${y},${image.wBytes},${image.h},0,`));
    this.parts.push(image.data);
    this.parts.push(encodeCp874('\r\n'));
  }

  build(): Uint8Array {
    const total = this.parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of this.parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }
}

function textBitmap(text: string, px: number, bold: boolean, maxWidth: number): BitmapImage | null {
  if (!text.trim() || maxWidth <= 0 || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const font = `${bold ? '700' : '400'} ${px}px Tahoma, 'Leelawadee UI', sans-serif`;
  context.font = font;
  const fitted = fitText(context, text, maxWidth);
  const width = Math.min(maxWidth, Math.ceil(context.measureText(fitted).width) + 2);
  const height = Math.ceil(px * 1.35);
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000';
  context.font = font;
  context.textBaseline = 'top';
  context.fillText(fitted, 0, Math.round(px * 0.1));
  return canvasToBitmap(context, width, height);
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted}…`;
}

function canvasToBitmap(context: CanvasRenderingContext2D, width: number, height: number): BitmapImage {
  const rgba = context.getImageData(0, 0, width, height).data;
  const wBytes = Math.ceil(width / 8);
  const data = new Uint8Array(wBytes * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const luminance = 0.299 * rgba[pixel] + 0.587 * rgba[pixel + 1] + 0.114 * rgba[pixel + 2];
      if (luminance < 140) data[y * wBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { data, wBytes, h: height };
}

function qrModules(url: string): number {
  const bytes = new TextEncoder().encode(url).length;
  const version = QR_BYTE_CAPACITY_L.findIndex((capacity) => bytes <= capacity) + 1;
  if (version === 0) throw new Error('ลิงก์ QR ยาวเกิน 106 bytes — ต้องใช้ short link /d/{stockCode}');
  return 21 + (version - 1) * 4;
}

function geometry(config: LabelConfig, url: string): LabelGeometry {
  const width = Math.round(config.w * DPMM);
  const height = Math.round(config.h * DPMM);
  const qrQuiet = QR_QUIET_MODULES * QR_CELL_DOTS;
  const qrSymbol = qrModules(url) * QR_CELL_DOTS;
  const qrArea = qrSymbol + qrQuiet * 2;
  const remaining = width - qrArea - LABEL_LEFT_SAFE_DOTS - LABEL_MARGIN_DOTS * 2;
  const big = height >= 30 * DPMM && remaining >= 150;
  const smallQr = !big && config.code === 'qr' && height >= qrArea + LABEL_MARGIN_DOTS * 2;
  return { width, height, qrArea, qrQuiet, qrSymbol, big, smallQr,
    textWidth: big || smallQr ? Math.max(80, remaining) : width - LABEL_LEFT_SAFE_DOTS - LABEL_MARGIN_DOTS };
}

function drawText(builder: TsplBuilder, input: DeviceLabelInput, x: number, geo: LabelGeometry): void {
  const item = input.item;
  const spec = [item.deviceColor, item.deviceStorage].filter(Boolean).join(' · ');
  const condition = CONDITION_TH[item.condition] ?? item.condition;
  const battery = item.condition !== 'NEW' && item.batteryHealth != null ? `แบต ${item.batteryHealth}%` : '';
  const detailLines = battery ? [spec, [condition, battery].join(' · ')] : [[spec, condition].filter(Boolean).join(' · ')];
  const warranty = formatLabelWarrantyExpire(item.warrantyExpire);
  const lines: Array<[string, number, boolean]> = [
    [item.productName ?? item.sku ?? '', geo.big ? 26 : 20, true],
    ...detailLines.map((text): [string, number, boolean] => [text, geo.big ? 18 : 16, false]),
    ...(warranty ? [[warranty, geo.big ? 18 : 16, false] as [string, number, boolean]] : []),
    [input.priceText, geo.big ? 27 : 21, true],
  ];
  let y = LABEL_MARGIN_DOTS;
  for (const [text, size, bold] of lines) {
    const image = textBitmap(text, size, bold, geo.textWidth);
    if (!image) continue;
    builder.bitmap(x + LABEL_LEFT_SAFE_DOTS, y, image);
    y += image.h + 2;
  }
}

export function formatLabelWarrantyExpire(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = formatInShopZone(value, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return date === '-' ? null : `ประกันถึง ${date}`;
}

function drawQr(builder: TsplBuilder, input: DeviceLabelInput, x: number, geo: LabelGeometry): void {
  if (!geo.big && !geo.smallQr) return;
  const areaX = x + geo.width - LABEL_MARGIN_DOTS - geo.qrArea;
  const areaY = geo.big ? LABEL_MARGIN_DOTS : Math.round((geo.height - geo.qrArea) / 2);
  const qrX = areaX + geo.qrQuiet;
  const qrY = areaY + geo.qrQuiet;
  const safeUrl = input.url.replace(/["\r\n]/g, '');
  builder.raw(`QRCODE ${qrX},${qrY},L,${QR_CELL_DOTS},A,0,M2,S7,"${safeUrl}"`);
}

function drawBarcode(builder: TsplBuilder, input: DeviceLabelInput, x: number, geo: LabelGeometry): void {
  if (geo.smallQr) return;
  const code = (input.item.stockCode || input.item.imei || input.item.serialNumber || '').replace(/[^\x20-\x7e]/g, '');
  if (!code) return;
  const height = geo.big ? 52 : 44;
  const zone = height + 26 + 4;
  builder.raw(`BARCODE ${x + LABEL_LEFT_SAFE_DOTS},${geo.height - zone},"128",${height},1,0,2,3,"${code}"`);
}

function drawLabel(builder: TsplBuilder, input: DeviceLabelInput, column: number, config: LabelConfig): void {
  const x = Math.round(column * (config.w + config.gapX) * DPMM);
  const geo = geometry(config, input.url);
  drawText(builder, input, x, geo);
  drawQr(builder, input, x, geo);
  drawBarcode(builder, input, x, geo);
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

/** Backward-compatible single-item entry point: one machine prints on one physical sticker only. */
export function buildDeviceLabelTspl(item: SerializedItemResponse, url: string, downPayment: number): Uint8Array {
  return buildDeviceLabelsTspl([{
    item, url, priceText: formatDeviceLabelPrice({ kind: 'DOWN_PAYMENT', value: downPayment }),
  }]);
}

export { getLabelConfig } from './labelConfig';
