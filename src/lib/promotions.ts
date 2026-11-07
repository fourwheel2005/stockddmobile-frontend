import type {
  PosInstallmentPlan, PromoAdjust, PromotionRequest, PromotionResponse, PromotionStatus,
} from '@/types/api';
import { shopDateTimeInput, shopDateTimeInputToUtc } from '@/lib/datetime';

/**
 * ฟอร์มโปรโมชันราคา (FIX-217) — แปลงฟอร์ม ↔ คำขอ API + ข้อความสรุปผลโปร
 * ตรวจเบื้องต้นให้ตรงกับ backend (PricePromotionService.fill) เพื่อบอกพนักงานก่อนยิง API
 */

export const ADJUST_LABEL: Record<PromoAdjust, string> = {
  NONE: 'ไม่ปรับ',
  AMOUNT_OFF: 'ลดเป็นบาท',
  PERCENT_OFF: 'ลดเป็น %',
  SET: 'ตั้งราคาใหม่',
};

export const STATUS_LABEL: Record<PromotionStatus, { text: string; badge: string }> = {
  RUNNING: { text: 'กำลังใช้', badge: 'badge-green' },
  SCHEDULED: { text: 'รอเริ่ม', badge: 'badge-blue' },
  ENDED: { text: 'จบแล้ว', badge: 'badge-slate' },
  INACTIVE: { text: 'ปิดอยู่', badge: 'badge-amber' },
};

export const ROUNDING_OPTIONS = [1, 10, 100] as const;

export interface PromotionForm {
  name: string;
  note: string;
  conditionGroup: 'NEW' | 'SECOND_HAND';
  productId: string;
  storage: string;               // '' = ทุกความจุ
  variantIds: string[];          // มือ 1: ว่าง = ทุกสี
  serialIds: string[];           // มือ 2: ว่าง = ทุกเครื่อง
  cashMode: PromoAdjust;
  cashValue: string;
  downMode: PromoAdjust;
  downValue: string;
  monthlyMode: PromoAdjust;
  monthlyValue: string;
  termMonths: number[];          // ว่าง = ทุกงวด
  rounding: number;
  priority: string;
  active: boolean;
  startAt: string;               // datetime-local เวลาร้าน
  endAt: string;
}

export function emptyPromotionForm(): PromotionForm {
  return {
    name: '', note: '', conditionGroup: 'NEW', productId: '', storage: '', variantIds: [], serialIds: [],
    cashMode: 'AMOUNT_OFF', cashValue: '', downMode: 'NONE', downValue: '', monthlyMode: 'NONE', monthlyValue: '',
    termMonths: [], rounding: 10, priority: '0', active: true, startAt: '', endAt: '',
  };
}

export function formFromPromotion(p: PromotionResponse): PromotionForm {
  const num = (n: number | null) => (n == null ? '' : String(n));
  return {
    name: p.name, note: p.note ?? '', conditionGroup: p.conditionGroup, productId: p.productId,
    storage: p.storageDigits ?? '', variantIds: [...p.variantIds], serialIds: [...p.serialIds],
    cashMode: p.cashMode, cashValue: num(p.cashValue),
    downMode: p.downMode, downValue: num(p.downValue),
    monthlyMode: p.monthlyMode, monthlyValue: num(p.monthlyValue),
    termMonths: parseMonths(p.termMonths), rounding: p.rounding, priority: String(p.priority), active: p.active,
    startAt: shopDateTimeInput(p.startAt), endAt: shopDateTimeInput(p.endAt),
  };
}

export function parseMonths(csv: string | null | undefined): number[] {
  if (!csv) return [];
  return [...new Set(csv.split(/[,\s]+/).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b);
}

/** ความจุ → ตัวเลขล้วน (backend เทียบความจุด้วยตัวเลข: "256GB" = "256") */
export const storageDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

type Effect = { mode: PromoAdjust; value: string; label: string };

function effectError(e: Effect): string | null {
  if (e.mode === 'NONE') return null;
  const v = Number(e.value);
  if (e.value.trim() === '' || !Number.isFinite(v) || v < 0) return `${e.label}: กรอกตัวเลข 0 ขึ้นไป`;
  if (e.mode === 'PERCENT_OFF' && v > 100) return `${e.label}: ลดได้ไม่เกิน 100%`;
  if (e.mode !== 'SET' && v === 0) return `${e.label}: ลด 0 ไม่มีผล — เลือก "ไม่ปรับ" แทน`;
  return null;
}

export type BuildResult = { ok: true; request: PromotionRequest } | { ok: false; error: string };

export function buildPromotionRequest(f: PromotionForm): BuildResult {
  if (!f.name.trim()) return { ok: false, error: 'กรอกชื่อโปร' };
  if (!f.productId) return { ok: false, error: 'เลือกรุ่น' };
  const startAt = shopDateTimeInputToUtc(f.startAt);
  const endAt = shopDateTimeInputToUtc(f.endAt);
  if (!startAt || !endAt) return { ok: false, error: 'กรอกวันเวลาเริ่ม/จบโปร' };
  if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'เวลาจบต้องหลังเวลาเริ่ม' };
  const effects: Effect[] = [
    { mode: f.cashMode, value: f.cashValue, label: 'ราคาสด' },
    { mode: f.downMode, value: f.downValue, label: 'ดาวน์' },
    { mode: f.monthlyMode, value: f.monthlyValue, label: 'ค่างวด' },
  ];
  if (effects.every((e) => e.mode === 'NONE')) return { ok: false, error: 'เลือกอย่างน้อย 1 อย่างที่โปรจะปรับ (ราคาสด/ดาวน์/ค่างวด)' };
  for (const e of effects) {
    const err = effectError(e);
    if (err) return { ok: false, error: err };
  }
  const value = (e: Effect) => (e.mode === 'NONE' ? null : Number(e.value));
  const priority = Number(f.priority || 0);
  if (!Number.isInteger(priority)) return { ok: false, error: 'ลำดับความสำคัญต้องเป็นจำนวนเต็ม' };
  return {
    ok: true,
    request: {
      name: f.name.trim(),
      note: f.note.trim() || null,
      startAt, endAt,
      active: f.active,
      priority,
      conditionGroup: f.conditionGroup,
      productId: f.productId,
      storage: f.storage || null,
      variantIds: f.conditionGroup === 'NEW' ? f.variantIds : [],
      serialIds: f.conditionGroup === 'SECOND_HAND' ? f.serialIds : [],
      cashMode: f.cashMode, cashValue: value(effects[0]),
      downMode: f.downMode, downValue: value(effects[1]),
      monthlyMode: f.monthlyMode, monthlyValue: value(effects[2]),
      termMonths: f.termMonths.length > 0 ? f.termMonths.join(',') : null,
      rounding: f.rounding,
    },
  };
}

function adjustText(mode: PromoAdjust, value: number | null, unit: string): string | null {
  if (mode === 'NONE' || value == null) return null;
  const n = value.toLocaleString('th-TH');
  if (mode === 'AMOUNT_OFF') return `${unit}ลด ฿${n}`;
  if (mode === 'PERCENT_OFF') return `${unit}ลด ${n}%`;
  return `${unit}เหลือ ฿${n}`;
}

/** "สดลด ฿2,000 · ดาวน์เหลือ ฿0 (10, 12 ด.)" */
export function effectSummary(p: Pick<PromotionResponse,
  'cashMode' | 'cashValue' | 'downMode' | 'downValue' | 'monthlyMode' | 'monthlyValue' | 'termMonths'>): string {
  const months = parseMonths(p.termMonths);
  const scope = months.length > 0 ? ` (${months.join(', ')} ด.)` : '';
  const parts = [
    adjustText(p.cashMode, p.cashValue, 'สด'),
    adjustText(p.downMode, p.downValue, 'ดาวน์') && `${adjustText(p.downMode, p.downValue, 'ดาวน์')}${scope}`,
    adjustText(p.monthlyMode, p.monthlyValue, 'ค่างวด') && `${adjustText(p.monthlyMode, p.monthlyValue, 'ค่างวด')}${scope}`,
  ].filter(Boolean);
  return parts.join(' · ') || '-';
}

/** งวดทั้งหมดที่มีในแผนผ่อน (ไว้ทำชิปเลือกงวด) */
export function monthsOfPlans(plans: PosInstallmentPlan[][]): number[] {
  const s = new Set<number>();
  for (const list of plans) for (const p of list ?? []) for (const t of p.terms ?? []) s.add(t.months);
  return [...s].sort((a, b) => a - b);
}

/** ดาวน์ที่งวดนี้ใช้จริง (ดาวน์เฉพาะงวด หรือดาวน์ของแผน) */
export const termDown = (plan: PosInstallmentPlan, months: number) => {
  const t = plan.terms.find((x) => x.months === months);
  return t?.down != null ? t.down : plan.down;
};
