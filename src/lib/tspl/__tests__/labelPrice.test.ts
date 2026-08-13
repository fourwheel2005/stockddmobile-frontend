import { describe, expect, it } from 'vitest';
import type { SerializedItemResponse, VariantResponse } from '@/types/api';
import {
  formatDeviceLabelPrice,
  formatLabelDownPayment,
  resolveDeviceLabelPrice,
  resolveLabelDownPayment,
} from '../labelPrice';

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

describe('resolveLabelDownPayment', () => {
  it('uses the per-device down payment for a second-hand phone', () => {
    expect(resolveLabelDownPayment(item({ downPayment: 3990 }), [variant({ downPayment: 8990 })])).toBe(3990);
  });

  it('uses the matching first-hand variant down payment instead of full price', () => {
    const newItem = item({ condition: 'NEW', downPayment: 3990, sellingPrice: 29900 });
    expect(resolveLabelDownPayment(newItem, [variant({ downPayment: 8990 })])).toBe(8990);
  });

  it('uses the primary plan instead of inventing a lowest-down offer across plans', () => {
    const plans = JSON.stringify([{ down: 8990, terms: [] }, { down: 6990, terms: [] }]);
    expect(resolveLabelDownPayment(item({ condition: 'NEW' }), [variant({ installmentPlans: plans })])).toBe(8990);
  });

  it('does not fall back to the selling price when installment data is missing', () => {
    expect(resolveLabelDownPayment(item({ sellingPrice: 29900, downPayment: null }), [variant()])).toBeNull();
  });

  it('formats the amount explicitly as a down payment', () => {
    expect(formatLabelDownPayment(8990)).toContain('ดาวน์ ฿8,990');
  });

  it('uses the full selling price only for serialized accessories', () => {
    const accessory = item({ categoryRootName: 'อุปกรณ์เสริม', sellingPrice: 4290, downPayment: null });
    const price = resolveDeviceLabelPrice(accessory, [variant({ sellingPrice: 4990 })]);
    expect(price).toEqual({ kind: 'SELLING_PRICE', value: 4290 });
    expect(price && formatDeviceLabelPrice(price)).toBe('ราคา ฿4,290');
  });
});
