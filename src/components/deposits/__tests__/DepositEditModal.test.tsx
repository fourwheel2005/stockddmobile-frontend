import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { DepositArrivalModal, DepositEditModal, OrderDeviceModal } from '../DepositModals';
import { SourceInput } from '../SourceInput';
import type { DeviceDeposit } from '@/types/api';

const base: DeviceDeposit = {
  id: 'd1', depositNo: 'DP-20261107-ABC123', kind: 'ORDER', kindLabel: 'วางมัดจำแล้ว', status: 'WAITING_ARRIVAL',
  branchName: 'สาขาหลัก', customerName: 'ลูกค้า ข', customerPhone: '0899999999', productId: 'p1', productName: 'iPhone 17',
  variantId: null, sku: null, serialItemId: null, stockCode: null, deviceColor: 'Black', deviceStorage: '256GB',
  condition: 'NEW', imei: null, serialNumber: null, agreedPrice: 32900, paidTotal: 3000, refundedTotal: 0,
  balance: 3000, remaining: 29900, expectedDate: null, sourceName: 'ร้านเฮีย', note: null, createdBy: 'staff1',
  createdAt: '2026-11-07T01:00:00Z', arrivedAt: null, completedAt: null, cancelledAt: null, cancelReason: null,
  billNo: null, appliedAmount: null, payments: [],
};

function render(node: React.ReactNode) {
  const qc = new QueryClient();
  qc.setQueryData(['purchase-sources'], [{ id: 's1', name: 'ร้านเฮีย', active: true }, { id: 's2', name: 'Amp Mobile', active: true }]);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('แหล่งที่มา + แก้ไขใบ (FIX-215)', () => {
  it('suggests sources typed before', () => {
    const html = render(<SourceInput value="" onChange={() => {}} />);
    expect(html).toContain('value="ร้านเฮีย"');
    expect(html).toContain('value="Amp Mobile"');
    expect(html).toContain('ไม่บังคับ');
  });

  it('order-on-deposit form has an optional source field', () => {
    const html = render(<OrderDeviceModal onClose={() => {}} />);
    expect(html).toContain('แหล่งที่มา (เครื่องมาจากไหน)');
    expect(html).toContain('ระบบจำไว้');
  });

  it('a waiting order can edit specs, IMEI and source', () => {
    const html = render(<DepositEditModal deposit={base} onClose={() => {}} />);
    expect(html).toContain('IMEI');
    expect(html).toContain('ความจุ *');
    expect(html).toContain('แหล่งที่มา');
    expect(html).toContain('value="ร้านเฮีย"');
    expect(html).toContain('มัดจำที่รับไว้ ฿3,000.00');
  });

  it('a reservation edits only customer, price and note — no specs, no source', () => {
    const html = render(<DepositEditModal deposit={{ ...base, kind: 'RESERVE', status: 'READY', sourceName: null }} onClose={() => {}} />);
    expect(html).not.toContain('ความจุ *');
    expect(html).not.toContain('แหล่งที่มา');
    expect(html).toContain('ยึดตามเครื่องจริง');
    expect(html).toContain('ชื่อลูกค้า *');
  });
});

describe('เครื่องถึงแล้ว = ช่องชุดเดียวกับหน้ารับเข้า (FIX-216)', () => {
  it('first-hand: IMEI/Serial, spec, 100% battery, cost, price = SKU, model, network, source type, warranty default, images, purchased-from', () => {
    const html = render(<DepositArrivalModal deposit={base} onClose={() => {}} />);
    for (const label of ['IMEI *', 'Serial', 'สี *', 'ความจุ *', 'มือ', 'แบต %', 'ราคาทุน (บาท)', 'ราคาขาย',
      'เลขรุ่น', 'เครือข่าย', 'ที่มา', 'ประกัน', 'รูปเครื่องนี้', 'ซื้อมาจาก / แหล่งที่มา', 'หมายเหตุล็อต']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('100%');
    expect(html).toContain('เว้น = ราคา SKU');
    expect(html).toContain('เว้น = ประกันศูนย์ 1 ปี (Apple)');
    expect(html).not.toContain('อุปกรณ์ที่มากับเครื่อง');         // กล่อง/สายชาร์จ เฉพาะมือ 2
    expect(html).not.toContain('ผ่อนเครื่องนี้ (มือ 2)');
    expect(html).not.toContain('เครื่องคืน (มีเครดิต)');          // ไม่ใช่เครื่องลูกค้าคืน
    expect(html).toContain('value="ร้านเฮีย"');                 // แหล่งที่มาจากใบมัดจำ
  });

  it('second-hand: battery input, accessories, per-device installment, price defaults to the agreed price', () => {
    const html = render(<DepositArrivalModal deposit={{ ...base, condition: 'SECOND_HAND', agreedPrice: 12900 }} onClose={() => {}} />);
    expect(html).toContain('placeholder="แบต %"');
    expect(html).toContain('อุปกรณ์ที่มากับเครื่อง');
    expect(html).toContain('ผ่อนเครื่องนี้ (มือ 2)');
    expect(html).toContain('ประกันถึงวันที่');
    expect(html).toContain('value="12900"');
  });

  it('iPad: IMEI is disabled and Serial is required, like intake', () => {
    const html = render(<DepositArrivalModal deposit={{ ...base, productName: 'iPad Air 11 Inch Wifi' }} onClose={() => {}} />);
    expect(html).toContain('iPad ไม่มี IMEI');
    expect(html).toContain('Serial *');
  });
});

