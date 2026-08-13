import type { SerializedItemResponse, VariantResponse } from '@/types/api';

interface DownValue { down?: unknown }
interface TermDownValue { down?: unknown }

function validDown(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function downValuesFromJson(json?: string | null): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value: DownValue & { terms?: TermDownValue[] }) => {
      const planDown = validDown(value?.down);
      const termDowns = Array.isArray(value?.terms)
        ? value.terms.map((term) => validDown(term?.down)).filter((down): down is number => down != null)
        : [];
      return planDown == null ? termDowns : [planDown, ...termDowns];
    });
  } catch {
    return [];
  }
}

function firstValid(values: Array<number | null>): number | null {
  return values.find((value): value is number => value != null) ?? null;
}

export function resolveLabelDownPayment(item: SerializedItemResponse, variants: VariantResponse[]): number | null {
  const serialDowns = [validDown(item.downPayment), ...downValuesFromJson(item.installmentTerms)];
  if (item.condition !== 'NEW') return firstValid(serialDowns);
  const variant = variants.find((candidate) => candidate.id === item.variantId);
  const variantDowns = variant
    ? [validDown(variant.downPayment), ...downValuesFromJson(variant.installmentPlans), ...downValuesFromJson(variant.installmentTerms)]
    : [];
  return firstValid(variantDowns);
}

export function formatLabelDownPayment(value: number): string {
  return `ดาวน์ ฿${new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value)}`;
}
