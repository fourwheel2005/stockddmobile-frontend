import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  StockDeviceListModal,
  stockDeviceListKey,
} from '@/components/inventory/StockDeviceListModal';
import type { PageResponse, SerializedItemResponse } from '@/types/api';

const DEVICE = {
  id: 'serial-1',
  variantId: 'variant-1',
  sku: 'IP17-256',
  productName: 'iPhone 17',
  imei: '352660520272888',
  imei2: null,
  serialNumber: 'SN-001',
  stockCode: 'DD00999',
  status: 'PENDING_INTAKE',
  condition: 'NEW',
  receivedAt: '2026-08-31T10:00:00Z',
  soldAt: null,
  warrantyExpire: null,
  warrantyTerms: null,
  purchasePrice: null,
  purchasePriceCode: null,
  refurbCost: null,
  totalCost: null,
  sellingPrice: 21900,
  batteryHealth: 100,
  deviceColor: 'Black',
  modelNumber: null,
  deviceStorage: '256GB',
  deviceNetwork: 'TH',
  acquisitionType: 'PURCHASE',
  sourceCustomer: null,
  serviceState: null,
  defectNote: null,
  branchId: 'branch-main',
  branchName: 'สาขาหลัก',
} as SerializedItemResponse;

describe('StockDeviceListModal', () => {
  it('shows exact on-site devices and explains the physical-count scope', () => {
    const queryClient = new QueryClient();
    const page: PageResponse<SerializedItemResponse> = {
      content: [DEVICE], page: 0, size: 50,
      totalElements: 1, totalPages: 1, last: true,
    };
    queryClient.setQueryData(
      stockDeviceListKey('NEW', 'PHYSICAL', 'branch-main', 0, ''),
      page,
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <StockDeviceListModal
          condition="NEW"
          scope="PHYSICAL"
          branchId="branch-main"
          expectedTotal={1}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(html).toContain('รายการเครื่องมือ 1 (ใหม่)');
    expect(html).toContain('เครื่องที่ควรพบจริงในร้าน (พร้อมขาย + รอดำเนินการ)');
    expect(html).toContain('352660520272888');
    expect(html).toContain('DD00999');
    expect(html).toContain('รอลงสต๊อก');
    expect(html).toContain('สาขาหลัก');
  });
});
