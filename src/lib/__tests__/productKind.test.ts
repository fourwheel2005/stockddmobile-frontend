import { describe, expect, it } from 'vitest';
import { isAccessoryCategory } from '@/lib/productKind';

describe('isAccessoryCategory', () => {
  it('recognizes a child category under the accessory root', () => {
    expect(isAccessoryCategory({
      id: 'charger',
      name: 'อะแดปเตอร์',
      parentId: 'accessory',
      parentName: 'อุปกรณ์เสริม',
    })).toBe(true);
  });

  it('recognizes legacy accessory categories created as a root', () => {
    expect(isAccessoryCategory({
      id: 'legacy-cable',
      name: 'สายชาร์จ/อะแดปเตอร์',
      parentId: null,
      parentName: null,
    })).toBe(true);
  });

  it('does not route a phone category to the accessory form', () => {
    expect(isAccessoryCategory({
      id: 'iphone',
      name: 'iPhone',
      parentId: 'phone',
      parentName: 'มือถือ',
    })).toBe(false);
  });
});
