import { describe, expect, it } from 'vitest';
import {
  calculateTradeInSettlement, getTradeInBlockedReason, installmentPayToday, isTradeInActive,
  TRADE_IN_INTAKE_POLICY,
} from '../tradeIn';
import { changeFromTender } from '../tender';

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

  it('blocks mixed payment but allows trade-in above installment down payment', () => {
    expect(getTradeInBlockedReason({ ...valid, paymentMethod: 'MIXED' })).toContain('จ่ายแบบผสม');
    expect(getTradeInBlockedReason({
      ...valid, paymentMethod: 'INSTALLMENT', value: 15000,
    })).toBeNull();
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
      ...valid, paymentMethod: 'INSTALLMENT',
    })).toBeNull();
  });

  it('calculates who pays the difference for installment trade-in', () => {
    expect(calculateTradeInSettlement({
      paymentMethod: 'INSTALLMENT', grandTotal: 30000,
      downPayment: 10000, addOnToday: 0, tradeInValue: 8000,
    })).toEqual({ settlementAmount: 10000, differenceAmount: 2000, customerPays: 2000, storePays: 0 });

    expect(calculateTradeInSettlement({
      paymentMethod: 'INSTALLMENT', grandTotal: 30000,
      downPayment: 5000, addOnToday: 1000, tradeInValue: 8000,
    })).toEqual({ settlementAmount: 6000, differenceAmount: -2000, customerPays: 0, storePays: 2000 });

    expect(calculateTradeInSettlement({
      paymentMethod: 'INSTALLMENT', grandTotal: 30000,
      downPayment: 5000, addOnToday: 1000, tradeInValue: 6000,
    })).toEqual({ settlementAmount: 6000, differenceAmount: 0, customerPays: 0, storePays: 0 });
  });

  it('uses the full bill as settlement base for non-installment trade-in', () => {
    expect(calculateTradeInSettlement({
      paymentMethod: 'CASH', grandTotal: 30000,
      downPayment: 0, addOnToday: 0, tradeInValue: 35000,
    })).toEqual({ settlementAmount: 30000, differenceAmount: -5000, customerPays: 0, storePays: 5000 });
  });

  it('calculates cash tender/change from the customer-pay difference only', () => {
    const settlement = calculateTradeInSettlement({
      paymentMethod: 'INSTALLMENT', grandTotal: 30000,
      downPayment: 5000, addOnToday: 1000, tradeInValue: 4000,
    });

    expect(settlement.customerPays).toBe(2000);
    expect(changeFromTender('3000', settlement.customerPays)).toBe(1000);
    expect(changeFromTender('1999.99', settlement.customerPays)).toBe(-0.01);
  });
});

describe('installment discount (FIX-209)', () => {
  it('takes the discount off what the customer pays today', () => {
    expect(installmentPayToday(9999, 0, 9999)).toBe(0);          // ฟรีดาวน์
    expect(installmentPayToday(5000, 590, 1000)).toBe(4590);
    expect(installmentPayToday(5000, 0, 0)).toBe(5000);
  });

  it('compares the trade-in with the discounted amount, and ignores it on cash bills', () => {
    const inst = calculateTradeInSettlement({
      paymentMethod: 'INSTALLMENT', grandTotal: 28000, downPayment: 5000, addOnToday: 1000,
      todayDiscount: 2000, tradeInValue: 3000,
    });
    expect(inst.settlementAmount).toBe(4000);
    expect(inst.customerPays).toBe(1000);

    const cash = calculateTradeInSettlement({
      paymentMethod: 'CASH', grandTotal: 9000, downPayment: 0, addOnToday: 0,
      todayDiscount: 1000, tradeInValue: 0,
    });
    expect(cash.settlementAmount).toBe(9000);
  });
});
