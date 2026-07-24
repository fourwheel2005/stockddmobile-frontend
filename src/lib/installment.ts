/**
 * แผนผ่อน "หลายแบบ" (ปุ่มเลือก) ต่อรุ่นย่อย — helper แปลงระหว่าง form state ↔ JSON payload.
 *
 * โครงสร้าง JSON ที่เก็บใน backend (`ProductVariant.installmentPlans`):
 *   [{ "label": "ดาวน์ 3000", "down": 3000, "promo": "ฟรีเคส",
 *      "terms": [{ "months": 10, "monthly": 2000 }, { "months": 12, "monthly": 1750 }] }, ...]
 *
 * back-compat: field เดิม downPayment/installmentTerms/installmentPromo = "แผนแรก"
 * (เว็บหน้าร้านที่ยังอ่าน field เก่าจะยังเห็นแผนหลัก) — `serializePlans` mirror ให้อัตโนมัติ.
 */

export interface PlanTerm {
  months: string;
  monthly: string;
  /**
   * ดาวน์เฉพาะงวดนี้ (override ดาวน์ระดับแผน) — คงไว้เพื่อ back-compat กับข้อมูลเดิม
   * (ฟอร์มเดิมก่อน FIX-107 เก็บ down รายงวดใน installment_terms). editor ใหม่ไม่ได้โชว์ช่องนี้
   * แต่ parse/serialize จะ "ส่งผ่าน" ค่าเดิมไม่ให้หาย (non-destructive).
   */
  down?: string;
}

export interface InstallmentPlan {
  label: string;
  down: string;
  promo: string;
  terms: PlanTerm[];
}

export interface SerializedPlans {
  installmentPlans: string | null;
  downPayment: number | null;
  installmentTerms: string | null;
  installmentPromo: string | null;
}

/** สร้างแผนเปล่า 1 แผน (มี 1 งวดว่างให้เริ่มกรอก). */
export const emptyPlan = (): InstallmentPlan => ({
  label: '', down: '', promo: '', terms: [{ months: '', monthly: '' }],
});

/**
 * แปลงจาก payload → form state.
 * ถ้ายังไม่มี `installmentPlans` แต่มี field เก่า (downPayment/installmentTerms) → สร้างเป็น 1 แผน (bridge).
 */
export function parsePlans(
  plansJson?: string | null,
  legacy?: {
    downPayment?: number | null;
    installmentTerms?: string | null;
    installmentPromo?: string | null;
  },
): InstallmentPlan[] {
  if (plansJson) {
    try {
      const arr = JSON.parse(plansJson);
      if (Array.isArray(arr) && arr.length) {
        return arr.map((p: {
          label?: string; down?: number; promo?: string;
          terms?: { months?: number; monthly?: number; down?: number }[];
        }) => ({
          label: String(p.label ?? ''),
          down: p.down != null ? String(p.down) : '',
          promo: String(p.promo ?? ''),
          terms: Array.isArray(p.terms) && p.terms.length
            ? p.terms.map((t) => ({
                months: t.months != null ? String(t.months) : '',
                monthly: t.monthly != null ? String(t.monthly) : '',
                ...(t.down != null ? { down: String(t.down) } : {}),
              }))
            : [{ months: '', monthly: '' }],
        }));
      }
    } catch { /* JSON เพี้ยน → ลอง bridge จาก field เก่า */ }
  }

  if (legacy && (legacy.downPayment != null || (legacy.installmentTerms ?? '').trim() !== '')) {
    let terms: PlanTerm[] = [];
    try {
      const arr = legacy.installmentTerms ? JSON.parse(legacy.installmentTerms) : [];
      if (Array.isArray(arr)) {
        terms = arr.map((t: { months?: number; monthly?: number; down?: number }) => ({
          months: t.months != null ? String(t.months) : '',
          monthly: t.monthly != null ? String(t.monthly) : '',
          ...(t.down != null ? { down: String(t.down) } : {}),   // คงดาวน์รายงวดเดิมไว้ (M1)
        }));
      }
    } catch { /* ignore */ }
    return [{
      label: '',
      down: legacy.downPayment != null ? String(legacy.downPayment) : '',
      promo: legacy.installmentPromo ?? '',
      terms: terms.length ? terms : [{ months: '', monthly: '' }],
    }];
  }

  return [];
}

/**
 * แปลง form state → payload (พร้อม mirror แผนแรกลง field เก่า).
 * - ตัดงวดที่ไม่ครบ (months/monthly ไม่เป็นเลขที่ถูกต้อง) ออก
 * - ตัดแผนที่ "ว่างเปล่า" (ไม่มีทั้ง งวด/ดาวน์/โปรโม/label) ออก
 * - ถ้าไม่มีแผนที่ใช้ได้เลย → คืน null ทุก field (ล้างค่า)
 */
export function serializePlans(plans: InstallmentPlan[]): SerializedPlans {
  const clean = plans
    .map((p) => {
      const terms = p.terms
        .map((t) => {
          const td = (t.down ?? '').trim() === '' ? undefined : Number(t.down);   // ดาวน์รายงวด (back-compat)
          return {
            months: Number(t.months),
            monthly: Number(t.monthly),
            ...(td != null && Number.isFinite(td) && td >= 0 ? { down: td } : {}),
          };
        })
        .filter((t) => Number.isFinite(t.months) && t.months > 0
          && Number.isFinite(t.monthly) && t.monthly >= 0);
      const downNum = p.down.trim() === '' ? undefined : Number(p.down);
      const obj: { label?: string; down?: number; promo?: string; terms: { months: number; monthly: number; down?: number }[] } = { terms };
      if (p.label.trim()) obj.label = p.label.trim();
      if (downNum != null && Number.isFinite(downNum) && downNum >= 0) obj.down = downNum;
      if (p.promo.trim()) obj.promo = p.promo.trim();
      return obj;
    })
    // เก็บเฉพาะแผนที่ "ใช้ได้จริง" — ต้องมีงวดผ่อน หรือมีเงินดาวน์ (ตัด label/promo ล้วนทิ้ง — m3)
    .filter((p) => p.terms.length > 0 || p.down != null);

  if (clean.length === 0) {
    return { installmentPlans: null, downPayment: null, installmentTerms: null, installmentPromo: null };
  }

  const first = clean[0];
  return {
    installmentPlans: JSON.stringify(clean),
    downPayment: first.down != null ? first.down : null,
    installmentTerms: first.terms.length ? JSON.stringify(first.terms) : null,
    installmentPromo: first.promo ?? null,
  };
}
