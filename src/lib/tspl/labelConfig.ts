const MAX_PRINT_WIDTH_MM = 108;
const MIN_LABEL_LENGTH_MM = 10;
const LABEL_CONFIG_VERSION = '157';
const LEGACY_STANDARD_SIZES = new Set(['35x25', '50x30']);

export type LabelCodeMode = 'barcode' | 'qr';

export interface LabelConfig {
  w: number;
  h: number;
  across: number;
  gapX: number;
  gapY: number;
  code: LabelCodeMode;
  speed: number;
  density: number;
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  w: 50,
  h: 40,
  across: 2,
  gapX: 3,
  gapY: 2,
  code: 'qr',
  speed: 3,
  density: 8,
};

export function parseLabelSize(value: string): Pick<LabelConfig, 'w' | 'h'> | null {
  const match = value.trim().match(/^(\d{1,3}(?:\.\d)?)\s*[xX×]\s*(\d{1,3}(?:\.\d)?)$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
}

export function labelRowWidth(config: LabelConfig): number {
  return config.w * config.across + config.gapX * (config.across - 1);
}

export function validateLabelConfig(config: LabelConfig): string | null {
  if (![config.w, config.h, config.gapX, config.gapY].every(Number.isFinite)) return 'ขนาดและช่องว่างต้องเป็นตัวเลข';
  if (config.w <= 0 || config.h < MIN_LABEL_LENGTH_MM) return 'ขนาดป้ายต้องมากกว่า 0 และสูงอย่างน้อย 10 มม.';
  if (!Number.isInteger(config.across) || config.across < 1 || config.across > 4) return 'จำนวนดวงต่อแถวต้องอยู่ระหว่าง 1–4';
  if (config.gapX < 0 || config.gapY < 0 || config.gapX > 25.4 || config.gapY > 25.4) return 'ช่องว่างต้องอยู่ระหว่าง 0–25.4 มม.';
  if (labelRowWidth(config) > MAX_PRINT_WIDTH_MM) return `ความกว้างรวม ${labelRowWidth(config)} มม. เกินพื้นที่พิมพ์ TTP-247 ที่ 108 มม.`;
  if (!Number.isInteger(config.speed) || config.speed < 1 || config.speed > 7) return 'ความเร็วต้องอยู่ระหว่าง 1–7 นิ้ว/วินาที';
  if (!Number.isInteger(config.density) || config.density < 0 || config.density > 15) return 'ความเข้มต้องอยู่ระหว่าง 0–15';
  return null;
}

function storedNumber(storage: Storage | null, key: string, fallback: number): number {
  const raw = storage?.getItem(key);
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getLabelConfig(storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null): LabelConfig {
  const storedSize = storage?.getItem('ddmobile.label.size') ?? '';
  const isLegacyStandard = storage?.getItem('ddmobile.label.config-version') !== LABEL_CONFIG_VERSION
    && LEGACY_STANDARD_SIZES.has(storedSize.replace(/\s/g, '').toLowerCase());
  const size = isLegacyStandard ? DEFAULT_LABEL_CONFIG : parseLabelSize(storedSize) ?? DEFAULT_LABEL_CONFIG;
  const config: LabelConfig = {
    w: size.w,
    h: size.h,
    across: Math.trunc(storedNumber(storage, 'ddmobile.label.across', DEFAULT_LABEL_CONFIG.across)),
    gapX: storedNumber(storage, 'ddmobile.label.gapx', DEFAULT_LABEL_CONFIG.gapX),
    gapY: storedNumber(storage, 'ddmobile.label.gapy', DEFAULT_LABEL_CONFIG.gapY),
    code: storage?.getItem('ddmobile.label.code') === 'barcode' ? 'barcode' : 'qr',
    speed: Math.trunc(storedNumber(storage, 'ddmobile.label.speed', DEFAULT_LABEL_CONFIG.speed)),
    density: Math.trunc(storedNumber(storage, 'ddmobile.label.density', DEFAULT_LABEL_CONFIG.density)),
  };
  return validateLabelConfig(config) == null ? config : DEFAULT_LABEL_CONFIG;
}

export function saveLabelConfig(config: LabelConfig, storage: Storage = window.localStorage): void {
  const error = validateLabelConfig(config);
  if (error) throw new Error(error);
  storage.setItem('ddmobile.label.size', `${config.w}x${config.h}`);
  storage.setItem('ddmobile.label.across', String(config.across));
  storage.setItem('ddmobile.label.gapx', String(config.gapX));
  storage.setItem('ddmobile.label.gapy', String(config.gapY));
  storage.setItem('ddmobile.label.code', config.code);
  storage.setItem('ddmobile.label.speed', String(config.speed));
  storage.setItem('ddmobile.label.density', String(config.density));
  storage.setItem('ddmobile.label.config-version', LABEL_CONFIG_VERSION);
}
