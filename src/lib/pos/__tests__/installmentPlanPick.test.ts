import { describe, expect, it } from 'vitest';
import { monthsOfPlan, pickInstallmentDefaults, plansForCart, type PosInstallmentPlan } from '@/lib/pos/installmentPlanPick';

const plans: PosInstallmentPlan[] = [
  { label: null, down: 3000, promo: 'ฟรีเคส', terms: [
    { months: 10, monthly: 2190, down: null }, { months: 24, monthly: 1090, down: 5000 },
  ] },
  { label: 'ดาวน์ 0', down: 0, promo: null, terms: [{ months: 12, monthly: 2490, down: null }] },
];

describe('POS installment plan pick (FIX-200)', () => {
  it('fills down and monthly for the chosen months, using the per-term down when set', () => {
    expect(pickInstallmentDefaults(plans, 0, 10)).toEqual({ planIndex: 0, months: 10, down: 3000, monthly: 2190, promo: 'ฟรีเคส' });
    expect(pickInstallmentDefaults(plans, 0, 24)).toEqual({ planIndex: 0, months: 24, down: 5000, monthly: 1090, promo: 'ฟรีเคส' });
    expect(pickInstallmentDefaults(plans, 1, 12)?.down).toBe(0);
  });

  it('returns null for months the shop did not price so staff type manually', () => {
    expect(pickInstallmentDefaults(plans, 0, 36)).toBeNull();
    expect(pickInstallmentDefaults([], 0, 10)).toBeNull();
    expect(monthsOfPlan(plans[0])).toEqual([10, 24]);
  });

  it('uses the first financed serialized line that carries plans, skipping pay-today accessories', () => {
    const cart = [
      { serialized: false, payToday: true, installmentPlans: plans },          // อุปกรณ์เสริม
      { serialized: true, payToday: true, installmentPlans: plans },           // AirPods จ่ายวันนี้
      { serialized: true, payToday: false, installmentPlans: [] },             // เครื่องไม่มีแผน
      { serialized: true, payToday: false, installmentPlans: plans, sku: 'X' },
    ];
    expect(plansForCart(cart)?.line).toBe(cart[3]);
    expect(plansForCart(cart.slice(0, 3))).toBeNull();
  });
});
