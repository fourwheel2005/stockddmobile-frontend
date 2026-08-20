import { formatInShopZone } from '@/lib/datetime';
import type { SerializedItemResponse } from '@/types/api';
import { formatDeviceLabelPrice } from './labelPrice';
import { getLabelConfig, labelRowWidth, validateLabelConfig, type LabelConfig } from './labelConfig';
import { TsplBuilder } from './TsplBuilder';
import { textBitmap } from './textBitmap';

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
  const warrantyLines = formatLabelWarrantyLines(item.warrantyTerms, item.warrantyExpire);
  const lines: Array<[string, number, boolean]> = [
    [item.productName ?? item.sku ?? '', geo.big ? 26 : 20, true],
    ...detailLines.map((text): [string, number, boolean] => [text, geo.big ? 18 : 16, false]),
    ...warrantyLines.map((text): [string, number, boolean] => [text, geo.big ? 18 : 16, false]),
    [input.priceText, geo.big ? 27 : 21, true],
  ];
  let y = LABEL_MARGIN_DOTS;
  for (const [text, size, bold] of lines) {
    const image = textBitmap(text, { fontSize: size, bold, maxWidth: geo.textWidth });
    if (!image) continue;
    builder.bitmap(x + LABEL_LEFT_SAFE_DOTS, y, image);
    y += image.h + 2;
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
