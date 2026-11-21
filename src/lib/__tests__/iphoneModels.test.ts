import { describe, expect, it } from 'vitest';
import { IPHONE_MODELS, IPHONE_MODEL_SERIES, hasModel } from '@/lib/iphoneModels';
import { suggestGroupId } from '@/lib/repairParts';

describe('iPhone model list (FIX-236)', () => {
  it('covers the current line-up newest first, including iPhone Duo', () => {
    expect(IPHONE_MODELS[0]).toBe('iPhone Duo');
    expect(IPHONE_MODELS).toEqual(expect.arrayContaining([
      'iPhone 18 Pro Max', 'iPhone 18 Pro', 'iPhone 17e', 'iPhone Air', 'iPhone 17 Pro Max', 'iPhone 16e',
      'iPhone 13', 'iPhone 13 mini', 'iPhone SE 3', 'iPhone XR', 'iPhone 6',
    ]));
    expect(IPHONE_MODEL_SERIES.map((s) => Number(s.series))).toEqual(
      [...IPHONE_MODEL_SERIES.map((s) => Number(s.series))].sort((a, b) => b - a));
  });

  it('has no duplicate names', () => {
    const lower = IPHONE_MODELS.map((m) => m.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it('knows which models are already in the table regardless of case and spacing', () => {
    expect(hasModel(['iphone  13 pro'], 'iPhone 13 Pro')).toBe(true);
    expect(hasModel(['iPhone 13'], 'iPhone 13 Pro')).toBe(false);
  });

  it('every listed name picks itself, not a shorter model, when matching a repair ticket', () => {
    const groups = IPHONE_MODELS.map((name) => ({ id: name, name, general: false }));
    for (const name of IPHONE_MODELS) expect(suggestGroupId(`Apple ${name}`, groups)).toBe(name);
  });
});
