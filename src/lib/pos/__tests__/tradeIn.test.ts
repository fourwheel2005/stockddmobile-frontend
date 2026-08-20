import { describe, expect, it } from 'vitest';
import { getTradeInBlockedReason, isTradeInActive, TRADE_IN_INTAKE_POLICY } from '../tradeIn';

const valid = {
  enabled: true,
  productId: 'product-1',
  color: 'Mist Blue',
  storage: '256GB',
  value: '11900',
  imei: '359001234567890',
  serialNumber: '',
  batteryHealth: '88',
  paymentMethod: 'CASH' as const,
  downPayment: 0,
};

describe('POS trade-in state', () => {
  it('states the new-only and pending-intake business policy', () => {
    expect(TRADE_IN_INTAKE_POLICY.newIdentifierOnly).toContain('ไม่เคยอยู่ในระบบ');
    expect(TRADE_IN_INTAKE_POLICY.modelSource).toContain('ไม่ได้เลือกหรือตัดเครื่องใน Stock');
    expect(TRADE_IN_INTAKE_POLICY.destination).toContain('รอลงสต็อก');
    expect(TRADE_IN_INTAKE_POLICY.destination).toContain('ยังขายไม่ได้');
  });

  it('uses explicit enable state and does not depend on accordion visibility', () => {
    expect(isTradeInActive(true, 'product-1', '11900')).toBe(true);
    expect(isTradeInActive(false, 'product-1', '11900')).toBe(false);
  });

  it('requires the customer model/specification, positive value and an identifier', () => {
    expect(getTradeInBlockedReason({ ...valid, productId: null })).toContain('เลือกรุ่น');
    expect(getTradeInBlockedReason({ ...valid, color: '' })).toContain('สี');
    expect(getTradeInBlockedReason({ ...valid, storage: '' })).toContain('ความจุ');
    expect(getTradeInBlockedReason({ ...valid, value: '0' })).toContain('มูลค่า');
    expect(getTradeInBlockedReason({ ...valid, value: '0.001' })).toContain('0.01');
    expect(getTradeInBlockedReason({ ...valid, value: '11900.123' })).toContain('2 ตำแหน่ง');
    expect(getTradeInBlockedReason({ ...valid, value: '10000000' })).toContain('วงเงินสูงสุด');
    expect(getTradeInBlockedReason({ ...valid, imei: '', serialNumber: '' })).toContain('IMEI');
    expect(getTradeInBlockedReason({
      ...valid, imei: '000000000000000', serialNumber: '',
    })).toContain('IMEI');
  });

  it('blocks mixed payment and trade-in above installment down payment', () => {
    expect(getTradeInBlockedReason({ ...valid, paymentMethod: 'MIXED' })).toContain('จ่ายแบบผสม');
    expect(getTradeInBlockedReason({
      ...valid, paymentMethod: 'INSTALLMENT', downPayment: 10000,
    })).toContain('เกินเงินดาวน์');
  });

  it('accepts battery boundaries and rejects values outside 0–100', () => {
    expect(getTradeInBlockedReason({ ...valid, batteryHealth: '0' })).toBeNull();
    expect(getTradeInBlockedReason({ ...valid, batteryHealth: '100' })).toBeNull();
    expect(getTradeInBlockedReason({ ...valid, batteryHealth: '-1' })).toContain('0–100');
    expect(getTradeInBlockedReason({ ...valid, batteryHealth: '101' })).toContain('0–100');
    expect(getTradeInBlockedReason({ ...valid, batteryHealth: '88.5' })).toContain('จำนวนเต็ม');
  });

  it('accepts a complete cash or installment trade-in', () => {
    expect(getTradeInBlockedReason(valid)).toBeNull();
    expect(getTradeInBlockedReason({
      ...valid, paymentMethod: 'INSTALLMENT', downPayment: 11900,
    })).toBeNull();
  });
});
