import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_CONFIG, getLabelConfig, labelRowWidth, parseLabelSize, validateLabelConfig } from '../labelConfig';

describe('labelConfig', () => {
  it('accepts decimal physical label sizes', () => {
    expect(parseLabelSize('49.5 × 30')).toEqual({ w: 49.5, h: 30 });
  });

  it('calculates the complete two-up row width', () => {
    expect(labelRowWidth(DEFAULT_LABEL_CONFIG)).toBe(103);
    expect(DEFAULT_LABEL_CONFIG.h).toBe(40);
    expect(validateLabelConfig(DEFAULT_LABEL_CONFIG)).toBeNull();
  });

  it('migrates the old trial 50x30 standard to the measured 50x40 default', () => {
    const values: Record<string, string> = { 'ddmobile.label.size': '50x30' };
    const storage = { getItem: (key: string) => values[key] ?? null } as Storage;

    expect(getLabelConfig(storage)).toMatchObject({ w: 50, h: 40, across: 2 });
  });

  it('rejects a layout wider than the TTP-247 print head', () => {
    expect(validateLabelConfig({ ...DEFAULT_LABEL_CONFIG, w: 55 }))
      .toContain('เกินพื้นที่พิมพ์ TTP-247');
  });

  it('allows a real zero millimetre gap', () => {
    expect(validateLabelConfig({ ...DEFAULT_LABEL_CONFIG, gapX: 0, gapY: 0 })).toBeNull();
  });

  it('rejects non-finite geometry instead of emitting invalid TSPL', () => {
    expect(validateLabelConfig({ ...DEFAULT_LABEL_CONFIG, gapX: Number.NaN })).toContain('ตัวเลข');
  });
});
