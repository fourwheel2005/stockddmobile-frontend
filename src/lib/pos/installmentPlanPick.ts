import { effectiveDown } from '@/lib/installment';

/** แผนผ่อนจาก backend (CartScanResponse/InStockItem.installmentPlans) — FIX-200 */
export interface PosInstallmentTerm { months: number; monthly: number; down: number | null }
export interface PosInstallmentPlan {
  label: string | null;
  down: number | null;
  promo: string | null;
  terms: PosInstallmentTerm[];
}

export interface InstallmentDefaults {
  planIndex: number;
  months: number;
  down: number;
  monthly: number;
  promo: string | null;
}

export const planLabel = (plan: PosInstallmentPlan, index: number): string =>
  plan.label?.trim() || (plan.down != null ? `ดาวน์ ${plan.down.toLocaleString('th-TH')}` : `แผน ${index + 1}`);

/** เดือนที่แผนนี้ตั้งราคาไว้ (เรียงน้อย→มาก, ไม่ซ้ำ) */
export function monthsOfPlan(plan: PosInstallmentPlan | undefined): number[] {
  return [...new Set((plan?.terms ?? []).map((t) => t.months).filter((m) => Number.isInteger(m) && m > 0))].sort((a, b) => a - b);
}

/**
 * ค่าที่ POS ควรเติมเมื่อพนักงานเลือก "แผน + จำนวนเดือน":
 * ดาวน์ = ดาวน์เฉพาะงวด (ถ้าร้านตั้ง) ไม่งั้นดาวน์หลักของแผน · ค่างวด = ของงวดนั้น
 * คืน null ถ้าแผนไม่มีงวดนั้น (พนักงานพิมพ์เอง)
 */
export function pickInstallmentDefaults(
  plans: PosInstallmentPlan[] | null | undefined,
  planIndex: number,
  months: number,
): InstallmentDefaults | null {
  const plan = plans?.[planIndex];
  if (!plan) return null;
  const term = plan.terms.find((t) => t.months === months);
  if (!term) return null;
  return {
    planIndex,
    months,
    down: effectiveDown(plan.down, term.down) ?? 0,
    monthly: term.monthly,
    promo: plan.promo ?? null,
  };
}

/**
 * แผนผ่อนที่ใช้กับบิลนี้ = ของ "เครื่องที่ผ่อน" (serialized และไม่ได้ติ๊กจ่ายวันนี้) ตัวแรกที่มีแผน
 * บิลผ่อนปกติมีเครื่องเดียว; หลายเครื่องให้พนักงานตรวจเอง (มีคำเตือนบนจอ)
 */
export function plansForCart<T extends { serialized: boolean; payToday: boolean; installmentPlans?: PosInstallmentPlan[] | null }>(
  cart: T[],
): { line: T; plans: PosInstallmentPlan[] } | null {
  for (const line of cart) {
    if (!line.serialized || line.payToday) continue;
    if (line.installmentPlans && line.installmentPlans.length > 0) return { line, plans: line.installmentPlans };
  }
  return null;
}
