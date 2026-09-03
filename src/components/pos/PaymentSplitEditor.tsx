import { useMemo } from 'react';
import { Banknote, CreditCard, QrCode, ArrowLeftRight, AlertTriangle, CheckCircle2, Check } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import type { PaymentSplit } from '@/types/api';

interface Props {
  value: PaymentSplit;
  onChange: (v: PaymentSplit) => void;
  grandTotal: number;
}

const ZERO_SPLIT: PaymentSplit = { cash: 0, transfer: 0, card: 0, qr: 0 };
/** ปัด 2 ตำแหน่ง — เทียบยอดแบบ exact หลังปัด (F-11/FIX-130): กัน float noise แต่ไม่ยอมต่าง 1 สตางค์จริง */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Editor 4-channel split payment (สด/โอน/บัตร/QR) สำหรับ MIXED order.
 *
 * UX rules:
 *  - Live validation: sum vs grandTotal (badge เขียว/แดง)
 *  - Quick-fill: ปุ่ม "เติมส่วนที่ขาด" ลงช่องที่กำลังโฟกัส
 *  - ห้ามรับเกิน (Q2) → input cap ที่ grandTotal
 *  - Tolerance ±0.01 (rounding) — match backend EPSILON
 */
export function PaymentSplitEditor({ value, onChange, grandTotal }: Props) {
  const safeVal = value ?? ZERO_SPLIT;

  const sum = useMemo(
    () => (safeVal.cash || 0) + (safeVal.transfer || 0)
        + (safeVal.card || 0) + (safeVal.qr || 0),
    [safeVal],
  );
  const diff = round2(grandTotal - sum);   // > 0 = ยังขาด, < 0 = เกิน (ปัด 2 ตำแหน่ง)
  const matched = diff === 0;               // F-11: ต้องตรงเป๊ะหลังปัด (ไม่ยอม ±0.01)
  const overflow = diff < 0;

  const update = (key: keyof PaymentSplit, raw: string) => {
    // QA FIX-151 (M): ปัด 2 ตำแหน่ง "ต่อช่อง" ให้ตรงกับ BE ที่ setScale(2) ต่อ field ก่อนบวก —
    // เดิมกรอก 33.333×3 FE บวกก่อนปัด = 100.00 "ยอดตรง" แต่ BE ปัดก่อนบวก = 99.99 → 400 ปริศนา
    const n = round2(Math.max(0, Number(raw) || 0));
    // ห้ามใส่เกิน grandTotal ในแต่ละช่อง (Q2)
    const capped = Math.min(n, grandTotal);
    onChange({ ...safeVal, [key]: capped });
  };

  const fillRemaining = (key: keyof PaymentSplit) => {
    if (diff <= 0) return;
    onChange({ ...safeVal, [key]: (safeVal[key] || 0) + diff });
  };

  const rows: Array<{
    key: keyof PaymentSplit;
    label: string;
    icon: React.ReactNode;
    accent: string;
  }> = [
    { key: 'cash',     label: 'เงินสด',           icon: <Banknote className="h-4 w-4" />, accent: 'border-emerald-300 bg-emerald-50/40' },
    { key: 'transfer', label: 'โอน',              icon: <ArrowLeftRight className="h-4 w-4" />, accent: 'border-sky-300 bg-sky-50/40' },
    { key: 'card',     label: 'บัตรเครดิต/เดบิต', icon: <CreditCard className="h-4 w-4" />, accent: 'border-violet-300 bg-violet-50/40' },
    { key: 'qr',       label: 'QR/พร้อมเพย์',     icon: <QrCode className="h-4 w-4" />, accent: 'border-orange-300 bg-orange-50/40' },
  ];

  return (
    <div className="space-y-3">
      {/* ────── 4 channel inputs ────── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ key, label, icon, accent }) => (
          <div key={key} className={`rounded-lg border-2 ${accent} p-2.5`}>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">{icon} {label}</span>
              {diff > 0 && (
                <button
                  type="button"
                  onClick={() => fillRemaining(key)}
                  className="rounded bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-900/10"
                  title="เติมยอดที่ขาดลงช่องนี้">
                  +{formatTHB(diff)}
                </button>
              )}
            </label>
            <input
              type="number"
              min={0}
              max={grandTotal}
              step={0.01}
              inputMode="decimal"
              className="input mt-1 text-base font-semibold tabular-nums"
              value={safeVal[key] || ''}
              placeholder="0.00"
              onChange={(e) => update(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* ────── Live sum vs grandTotal ────── */}
      <div className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 ${
        matched ? 'border-emerald-400 bg-emerald-50' :
        overflow ? 'border-red-400 bg-red-50' :
                   'border-amber-300 bg-amber-50'
      }`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {matched && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          {!matched && <AlertTriangle className="h-5 w-5 text-amber-600" />}
          <span>
            รวมที่จะรับ: <span className="tabular-nums">{formatTHB(sum)}</span>
            {' / '}
            <span className="text-slate-500 tabular-nums">{formatTHB(grandTotal)}</span>
          </span>
        </div>
        <div className="text-xs font-medium">
          {matched && <span className="text-emerald-700"><Check className="inline h-3.5 w-3.5 align-[-2px]" /> ยอดตรง</span>}
          {diff > 0 && (
            <span className="text-amber-700">ขาดอีก {formatTHB(diff)}</span>
          )}
          {overflow && (
            <span className="text-red-700">เกิน {formatTHB(-diff)} (Q2: รับเกินไม่ได้)</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** ตรวจ split ผ่านเกณฑ์ก่อน submit checkout — ต้องตรงเป๊ะหลังปัด 2 ตำแหน่ง (F-11/FIX-130) */
export function validateSplit(split: PaymentSplit, grandTotal: number): string | null {
  const sum = split.cash + split.transfer + split.card + split.qr;
  const diff = round2(grandTotal - sum);
  if (diff !== 0) {
    if (diff > 0) return `ยอดผสมขาด ${formatTHB(diff)}`;
    return `ยอดผสมเกิน ${formatTHB(-diff)} — ห้ามรับเกิน`;
  }
  return null;
}
