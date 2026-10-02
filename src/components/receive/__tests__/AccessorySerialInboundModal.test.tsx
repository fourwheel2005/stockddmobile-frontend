import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  buildAccessoryLotInboundRequest,
} from '@/components/receive/AccessorySerialInboundModal';
import { ProductFastInboundModal } from '@/components/receive/ProductFastInboundModal';
import type { ProductDetail, VariantResponse } from '@/types/api';

const variant: VariantResponse = {
  id: 'variant-1',
  productId: 'product-1',
  productName: 'Apple 20W USB-C Power Adapter',
  sku: 'ACC-20W',
  color: null,
  storage: null,
  network: null,
  barcode: null,
  costPrice: 590,
  costCode: null,
  sellingPrice: 790,
  reorderPoint: 5,
  imageUrl: null,
  imageUrls: null,
  active: true,
  condition: null,
  createdAt: '2026-08-31T00:00:00Z',
  updatedAt: '2026-08-31T00:00:00Z',
};

const accessory: ProductDetail = {
  id: 'product-1',
  name: 'Apple 20W USB-C Power Adapter',
  brand: 'Apple',
  modelNumber: null,
  description: null,
  serialized: true,
  active: true,
  category: {
    id: 'adapter',
    name: 'อะแดปเตอร์',
    parentId: 'accessory',
    parentName: 'อุปกรณ์เสริม',
  },
  variants: [variant],
  createdAt: '2026-08-31T00:00:00Z',
  updatedAt: '2026-08-31T00:00:00Z',
};

describe('Accessory serial inbound business', () => {
  it('maps each scanned barcode to one new serialized stock item without a fake IMEI', () => {
    const request = buildAccessoryLotInboundRequest({
      lotNo: 'ACC-20260831-TEST',
      importDate: '2026-08-31',
      branchId: 'branch-main',
      variantId: variant.id,
      serialNumbers: [' SN-001 ', '885000000002'],
      acquisitionType: 'PURCHASE',
      purchasePrice: 590,
      purchasedFrom: ' Supplier A ',
      invoiceNo: 'INV-99',
      warrantyTerms: 'ประกันศูนย์ 1 ปี',
      warrantyExpire: '2027-08-31',
      note: 'ล็อตทดสอบ',
    });

    expect(request.branchId).toBe('branch-main');
    expect(request.items).toHaveLength(2);
    expect(request.items[0]).toEqual({
      variantId: 'variant-1',
      serialNumber: 'SN-001',
      condition: 'NEW',
      acquisitionType: 'PURCHASE',
      purchasePrice: 590,
      warrantyTerms: 'ประกันศูนย์ 1 ปี',
      warrantyExpire: '2027-08-31',
    });
    expect(request.items[0]).not.toHaveProperty('imei');
    expect(request.purchasedFrom).toBe('Supplier A');
    expect(request.note).not.toContain('Supplier A');
    expect(request.note).toContain('INV-99');
  });

  it('routes a serialized accessory to the compact Barcode/SN form', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ProductFastInboundModal
          product={accessory}
          initialVariant={variant}
          onClose={vi.fn()}
          onDone={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(html).toContain('กรอกเฉพาะ Barcode/S/N ต่อชิ้น');
    expect(html).toContain('ยิงบาร์โค้ดที่นี่');
    expect(html).not.toContain('รายการเครื่อง (IMEI/Serial)');
    expect(html).not.toContain('แบตเตอรี่');
    expect(html).not.toContain('แผนผ่อน');
    expect(html).toContain('ซื้อมาจาก');
    expect(html).toContain('+ เพิ่มแหล่งซื้อใหม่');
  });
});

describe('iPad intake (FIX-203 — no IMEI)', () => {
  it('disables the IMEI field and makes Serial the primary field for an iPad', () => {
    const ipad: ProductDetail = {
      ...accessory,
      id: 'ipad-1', name: 'iPad Air M3', serialized: true,
      category: { id: 'ipad', name: 'iPad', parentId: 'tablet', parentName: 'แท็บเล็ต' },
      variants: [{ ...variant, id: 'v-ipad', productId: 'ipad-1', productName: 'iPad Air M3', sku: 'DD00100', color: 'Sage', storage: '256GB', condition: 'NEW' }],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ProductFastInboundModal product={ipad} onClose={vi.fn()} onDone={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(html).toContain('placeholder="iPad ไม่มี IMEI"');
    expect(html).toMatch(/placeholder="iPad ไม่มี IMEI"[^>]*disabled=""/);
    expect(html).toContain('placeholder="Serial *"');
    expect(html).toContain('Serial — iPad ไม่มี IMEI');
  });

  it('keeps the IMEI field enabled for phones', () => {
    const phone: ProductDetail = {
      ...accessory, id: 'ip-1', name: 'iPhone 17', serialized: true,
      category: { id: 'iphone', name: 'iPhone', parentId: 'phone', parentName: 'มือถือ' },
      variants: [{ ...variant, id: 'v-ip', productId: 'ip-1', productName: 'iPhone 17', sku: 'DD00200', condition: 'NEW' }],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ProductFastInboundModal product={phone} onClose={vi.fn()} onDone={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(html).toContain('placeholder="IMEI"');
    expect(html).not.toMatch(/placeholder="IMEI"[^>]*disabled=""/);
  });
});
