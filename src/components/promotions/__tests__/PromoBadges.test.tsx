import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PromoTag } from '../PromoTag';
import { promotionsFor } from '../RunningPromoBadge';
import type { PromoInfo, RunningPromotion } from '@/types/api';

const info = (price: number): PromoInfo => ({
  id: 'x', name: 'โปร 11.11', startAt: '2026-11-10T17:00:00', endAt: '2026-11-11T16:59:00',
  originalPrice: 32900, price, plans: [], originalPlans: [],
});

describe('promo badges (FIX-217)', () => {
  it('shows the promo price next to the normal price', () => {
    const html = renderToStaticMarkup(<PromoTag promotion={info(30900)} />);
    expect(html).toContain('โปร 11.11');
    expect(html).toMatch(/30,900/);
  });

  it('installment-only promo shows just the name', () => {
    const html = renderToStaticMarkup(<PromoTag promotion={info(32900)} />);
    expect(html).toContain('โปร 11.11');
    expect(html).not.toMatch(/32,900/);
  });

  it('nothing without a promotion', () => {
    expect(renderToStaticMarkup(<PromoTag promotion={null} />)).toBe('');
  });

  it('matches running promos by hand, model and storage (no storage = every storage)', () => {
    const list: RunningPromotion[] = [
      { id: 'a', name: 'A', productId: 'p1', productName: 'iPhone 17', storageDigits: '256', conditionGroup: 'NEW', endAt: '' },
      { id: 'b', name: 'B', productId: 'p1', productName: 'iPhone 17', storageDigits: null, conditionGroup: 'NEW', endAt: '' },
      { id: 'c', name: 'C', productId: 'p1', productName: 'iPhone 17', storageDigits: '256', conditionGroup: 'SECOND_HAND', endAt: '' },
    ];
    expect(promotionsFor(list, 'NEW', 'p1', '256').map((p) => p.id)).toEqual(['a', 'b']);
    expect(promotionsFor(list, 'NEW', 'p1', '512').map((p) => p.id)).toEqual(['b']);
    expect(promotionsFor(list, 'SECOND_HAND', 'p1', '256GB').map((p) => p.id)).toEqual(['c']);
  });
});
