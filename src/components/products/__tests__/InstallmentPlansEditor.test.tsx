import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallmentPlansEditor } from '@/components/products/InstallmentPlansEditor';
import { effectiveDown, parsePlans, serializePlans } from '@/lib/installment';

describe('InstallmentPlansEditor per-term down payment (FIX-200)', () => {
  it('renders a down-payment input for every term with the plan down as placeholder', () => {
    const html = renderToStaticMarkup(
      <InstallmentPlansEditor onChange={vi.fn()} value={[{
        label: '', down: '3000', promo: '',
        terms: [{ months: '10', monthly: '2190' }, { months: '24', monthly: '1090', down: '5000' }],
      }]} />,
    );
    expect(html).toContain('placeholder="เว้น=3000"');
    expect(html).toContain('value="5000"');
    expect(html).toContain('กี่เดือนก็ได้');
  });

  it('serializes per-term down only where filled and parses it back', () => {
    const out = serializePlans([{
      label: 'ดาวน์ 3000', down: '3000', promo: '',
      terms: [{ months: '10', monthly: '2190', down: '' }, { months: '36', monthly: '790', down: '6000' }],
    }]);
    expect(JSON.parse(out.installmentPlans!)).toEqual([{
      label: 'ดาวน์ 3000', down: 3000,
      terms: [{ months: 10, monthly: 2190 }, { months: 36, monthly: 790, down: 6000 }],
    }]);
    expect(JSON.parse(out.installmentTerms!)).toEqual([{ months: 10, monthly: 2190 }, { months: 36, monthly: 790, down: 6000 }]);
    const back = parsePlans(out.installmentPlans);
    expect(back[0].terms[1]).toEqual({ months: '36', monthly: '790', down: '6000' });
  });

  it('effectiveDown prefers the term override over the plan down', () => {
    expect(effectiveDown(3000, 6000)).toBe(6000);
    expect(effectiveDown(3000, '')).toBe(3000);
    expect(effectiveDown('3000', 0)).toBe(0);
    expect(effectiveDown(null, null)).toBeNull();
  });
});
