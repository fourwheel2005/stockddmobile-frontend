import { describe, expect, it } from 'vitest';
import { isAccessoryCategory, isImeiLessCategory, isImeiLessName, isImeiLessProduct } from '@/lib/productKind';

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

describe('isImeiLess (FIX-203 — iPad ไม่มี IMEI)', () => {
  it('flags iPad by category, parent category or product name', () => {
    expect(isImeiLessCategory({ id: 'ipad', name: 'iPad', parentId: 'tablet', parentName: 'แท็บเล็ต' })).toBe(true);
    expect(isImeiLessCategory({ id: 'air', name: 'Air', parentId: 'ipad', parentName: 'iPad' })).toBe(true);
    expect(isImeiLessName('Apple iPad Air M3 11"')).toBe(true);
    expect(isImeiLessProduct({ name: 'iPad mini 7', category: { id: 'x', name: 'Tablet', parentId: null, parentName: null } })).toBe(true);
  });

  it('keeps phones, watches and accessories on the IMEI/normal flow', () => {
    expect(isImeiLessName('iPhone 17 Pro')).toBe(false);
    expect(isImeiLessName('Apple Watch Series 10')).toBe(false);
    expect(isImeiLessCategory({ id: 'iphone', name: 'iPhone', parentId: 'phone', parentName: 'มือถือ' })).toBe(false);
    expect(isImeiLessName(null)).toBe(false);
  });
});
