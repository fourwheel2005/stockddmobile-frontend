import { describe, expect, it } from 'vitest';
import { cancelEffects, cancelPlan, defaultRefundMethod } from '@/lib/depositCancel';

const pay = (kind: 'RECEIVE' | 'REFUND', method: 'CASH' | 'TRANSFER' | 'CARD' | 'QR') =>
  ({ kind, amount: 1000, method, paidAt: '2026-11-10T03:00:00Z', createdBy: null, note: null });

describe('deposit cancel (FIX-224)', () => {
  it('full refund is the default plan and returns everything', () => {
    expect(cancelPlan(4000, 'FULL', NaN)).toEqual({ refund: 4000, kept: 0, error: null });
  });

  it('keeping the deposit refunds nothing', () => {
    expect(cancelPlan(4000, 'NONE', NaN)).toEqual({ refund: 0, kept: 4000, error: null });
  });

  it('partial refund splits the money and rejects bad amounts', () => {
    expect(cancelPlan(4000, 'PARTIAL', 1500)).toEqual({ refund: 1500, kept: 2500, error: null });
    expect(cancelPlan(4000, 'PARTIAL', NaN).error).toContain('กรอกยอด');
    expect(cancelPlan(4000, 'PARTIAL', 5000).error).toContain('ไม่เกิน');
    expect(cancelPlan(4000, 'PARTIAL', 4000).error).toContain('ทั้งหมด');
  });

  it('refunds the way the customer paid by default', () => {
    expect(defaultRefundMethod({ payments: [pay('RECEIVE', 'CASH')] })).toBe('CASH');
    expect(defaultRefundMethod({ payments: [pay('RECEIVE', 'CASH'), pay('RECEIVE', 'TRANSFER')] })).toBe('TRANSFER');
    expect(defaultRefundMethod({ payments: [pay('RECEIVE', 'QR')] })).toBe('TRANSFER');
  });

  it('explains where the money goes', () => {
    const cash = cancelEffects({ refund: 4000, kept: 0, error: null }, 'CASH').join(' ');
    expect(cash).toContain('เงินสดในเก๊ะลดลง');
    const kept = cancelEffects({ refund: 0, kept: 4000, error: null }, 'CASH').join(' ');
    expect(kept).toContain('ร้านเก็บมัดจำไว้');
    expect(kept).not.toContain('คืนลูกค้า');
  });
});
