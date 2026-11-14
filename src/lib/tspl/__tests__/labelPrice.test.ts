import { describe, expect, it } from 'vitest';
import type { SerializedItemResponse, VariantResponse } from '@/types/api';
import { formatLabelSellingPrice, isAccessoryLabelItem, resolveAccessoryLabelPrice } from '../labelPrice';

function item(overrides: Partial<SerializedItemResponse> = {}): SerializedItemResponse {
  return {
    id: 'serial-1', variantId: 'variant-1', productId: 'product-1', sku: 'IP17-MB-256',
    productName: 'iPhone 17', serialNumber: 'SN1', status: 'IN_STOCK', condition: 'SECOND_HAND',
    receivedAt: '2026-08-13T10:00:00', acquisitionType: 'PURCHASE',
    ...overrides,
  } as SerializedItemResponse;
}

function variant(overrides: Partial<VariantResponse> = {}): VariantResponse {
  return {
    id: 'variant-1', productId: 'product-1', productName: 'iPhone 17', sku: 'IP17-MB-256',
    color: 'Mist Blue', storage: '256GB', network: null, barcode: null, costPrice: null,
    costCode: null, sellingPrice: 29900, reorderPoint: 1, imageUrl: null, active: true,
    createdAt: '', updatedAt: '', ...overrides,
  } as VariantResponse;
}

describe('label price (FIX-227: เครื่องไม่พิมพ์ราคา)', () => {
  it('treats only the accessory root category as a priced label', () => {
    expect(isAccessoryLabelItem(item({ categoryRootName: 'อุปกรณ์เสริม' }))).toBe(true);
    expect(isAccessoryLabelItem(item({ categoryRootName: 'มือถือ' }))).toBe(false);
    expect(isAccessoryLabelItem(item())).toBe(false);
  });

  it('uses the per-item selling price of a serialized accessory first', () => {
    const accessory = item({ categoryRootName: 'อุปกรณ์เสริม', sellingPrice: 4290 });
    expect(resolveAccessoryLabelPrice(accessory, [variant({ sellingPrice: 4990 })])).toBe(4290);
  });

  it('falls back to the SKU selling price when the item has none', () => {
    const accessory = item({ categoryRootName: 'อุปกรณ์เสริม', sellingPrice: null });
    expect(resolveAccessoryLabelPrice(accessory, [variant({ sellingPrice: 4990 })])).toBe(4990);
  });

  it('returns null instead of inventing a price when none is set', () => {
    const accessory = item({ categoryRootName: 'อุปกรณ์เสริม', sellingPrice: null });
    expect(resolveAccessoryLabelPrice(accessory, [])).toBeNull();
  });

  it('formats the accessory amount as a full selling price', () => {
    expect(formatLabelSellingPrice(4290)).toBe('ราคา ฿4,290');
  });
});
