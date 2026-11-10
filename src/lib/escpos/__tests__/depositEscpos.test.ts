import { describe, expect, it } from 'vitest';
import { encodeCp874 } from '../cp874';
import { buildDepositSlip, depositForfeited, depositSlipTitle } from '../depositEscpos';
import type { DeviceDeposit } from '@/types/api';

const base: DeviceDeposit = {
  id: 'd1', depositNo: 'DP-20261110-C30211', kind: 'RESERVE', kindLabel: 'จองแล้ว', status: 'READY',
  branchName: 'สาขาหลัก', customerName: 'ลูกค้า ก', customerPhone: '0614638318', productId: 'p1',
  productName: 'iPhone 17 Pro Max', variantId: 'v1', sku: 'DD00563', serialItemId: 's1', stockCode: 'DD00563',
  deviceColor: 'Silver', deviceStorage: '256GB', condition: 'SECOND_HAND', imei: '355829990102975', serialNumber: null,
  agreedPrice: 17900, paidTotal: 4000, refundedTotal: 0, balance: 4000, remaining: 13900, expectedDate: null,
  sourceName: null, note: null, createdBy: 'staff1', createdAt: '2026-11-10T11:03:00Z', arrivedAt: null,
  completedAt: null, cancelledAt: null, cancelReason: null, billNo: null, appliedAmount: null,
  payments: [{ kind: 'RECEIVE', amount: 4000, method: 'CASH', paidAt: '2026-11-10T11:03:00Z', createdBy: 'staff1', note: null }],
};

/** หา bytes ของข้อความ (CP874) ในใบ */
function has(slip: Uint8Array, text: string): boolean {
  const needle = encodeCp874(text);
  outer: for (let i = 0; i + needle.length <= slip.length; i++) {
    for (let j = 0; j < needle.length; j++) if (slip[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

describe('deposit slip (FIX-222)', () => {
  it('shows the deposit taken and what is left to pay', () => {
    const slip = buildDepositSlip(base);
    expect(depositSlipTitle(base)).toBe('ใบรับเงินมัดจำจองเครื่อง');
    expect(has(slip, 'DP-20261110-C30211')).toBe(true);
    expect(has(slip, '355829990102975')).toBe(true);
    expect(has(slip, '4,000.00')).toBe(true);
    expect(has(slip, '13,900.00')).toBe(true);
  });

  it('a cancelled deposit prints the refund and what the shop kept', () => {
    const cancelled: DeviceDeposit = {
      ...base, status: 'CANCELLED', refundedTotal: 3000, balance: 1000, remaining: 0, cancelReason: 'ลูกค้าเปลี่ยนใจ',
      payments: [...base.payments, { kind: 'REFUND', amount: 3000, method: 'TRANSFER', paidAt: '2026-11-11T03:00:00Z', createdBy: 'admin', note: null }],
    };
    const slip = buildDepositSlip(cancelled);
    expect(depositSlipTitle(cancelled)).toBe('ใบยกเลิก / คืนเงินมัดจำ');
    expect(depositForfeited(cancelled)).toBe(1000);
    expect(has(slip, '-3,000.00')).toBe(true);
    expect(has(slip, '1,000.00')).toBe(true);
    expect(depositForfeited(base)).toBe(0);
  });
});
