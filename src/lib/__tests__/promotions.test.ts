import { describe, expect, it } from 'vitest';
import {
  buildPromotionRequest, effectSummary, emptyPromotionForm, formFromPromotion, monthsOfPlans, parseMonths, termDown,
  type PromotionForm,
} from '@/lib/promotions';
import type { PromotionResponse } from '@/types/api';

const base = (patch: Partial<PromotionForm> = {}): PromotionForm => ({
  ...emptyPromotionForm(),
  name: 'โปร 11.11', productId: 'p1', cashMode: 'AMOUNT_OFF', cashValue: '2000',
  startAt: '2026-11-11T00:00', endAt: '2026-11-11T23:59',
  ...patch,
});

describe('buildPromotionRequest (FIX-217)', () => {
  it('converts shop time to UTC and sends only the chosen group targets', () => {
    const r = buildPromotionRequest(base({ variantIds: ['v1'], serialIds: ['s1'], termMonths: [10, 12], storage: '256' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.startAt).toBe('2026-11-10T17:00:00.000Z');
    expect(r.request.endAt).toBe('2026-11-11T16:59:00.000Z');
    expect(r.request.variantIds).toEqual(['v1']);
    expect(r.request.serialIds).toEqual([]);
    expect(r.request.termMonths).toBe('10,12');
    expect(r.request.cashValue).toBe(2000);
    expect(r.request.downValue).toBeNull();
    expect(r.request.storage).toBe('256');
  });

  it('second-hand sends devices and drops colours', () => {
    const r = buildPromotionRequest(base({ conditionGroup: 'SECOND_HAND', variantIds: ['v1'], serialIds: ['s1'] }));
    expect(r.ok && r.request.variantIds).toEqual([]);
    expect(r.ok && r.request.serialIds).toEqual(['s1']);
  });

  it('rejects what the backend would reject', () => {
    const err = (f: PromotionForm) => { const r = buildPromotionRequest(f); return r.ok ? null : r.error; };
    expect(err(base({ name: ' ' }))).toContain('ชื่อ');
    expect(err(base({ productId: '' }))).toContain('รุ่น');
    expect(err(base({ endAt: '2026-11-10T23:00' }))).toContain('หลังเวลาเริ่ม');
    expect(err(base({ cashMode: 'NONE' }))).toContain('อย่างน้อย 1');
    expect(err(base({ cashMode: 'PERCENT_OFF', cashValue: '120' }))).toContain('100%');
    expect(err(base({ cashValue: '0' }))).toContain('ไม่ปรับ');
    expect(err(base({ cashValue: '' }))).toContain('ตัวเลข');
    // ตั้งดาวน์ 0 บาท = ฟรีดาวน์ (SET 0 ใช้ได้)
    expect(err(base({ cashMode: 'NONE', downMode: 'SET', downValue: '0' }))).toBeNull();
  });
});

describe('promotion helpers', () => {
  it('round-trips a saved promotion back into the form in shop time', () => {
    const p = {
      id: 'x', name: 'โปร', note: null, startAt: '2026-11-10T17:00:00', endAt: '2026-11-11T16:59:00', active: true,
      priority: 2, status: 'RUNNING', conditionGroup: 'NEW', productId: 'p1', productName: 'iPhone 17', storageDigits: '256',
      variantIds: ['v1'], serialIds: [], cashMode: 'NONE', cashValue: null, downMode: 'SET', downValue: 0,
      monthlyMode: 'PERCENT_OFF', monthlyValue: 10, termMonths: '12,10', rounding: 10,
      createdBy: null, updatedBy: null, updatedAt: null,
    } as PromotionResponse;
    const f = formFromPromotion(p);
    expect(f.startAt).toBe('2026-11-11T00:00');
    expect(f.endAt).toBe('2026-11-11T23:59');
    expect(f.termMonths).toEqual([10, 12]);
    expect(f.downValue).toBe('0');
    expect(effectSummary(p)).toBe('ดาวน์เหลือ ฿0 (10, 12 ด.) · ค่างวดลด 10% (10, 12 ด.)');
  });

  it('parses months and reads plan downs', () => {
    expect(parseMonths('12, 10 ,x,10')).toEqual([10, 12]);
    const plan = { label: null, down: 3990, promo: null, terms: [{ months: 10, monthly: 2890, down: null }, { months: 12, monthly: 2590, down: 4990 }] };
    expect(termDown(plan, 10)).toBe(3990);
    expect(termDown(plan, 12)).toBe(4990);
    expect(monthsOfPlans([[plan], []])).toEqual([10, 12]);
  });
});
