import { useMemo } from 'react';
import { Banknote, CreditCard, QrCode, ArrowLeftRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import type { PaymentSplit } from '@/types/api';

interface Props {
  value: PaymentSplit;
  onChange: (v: PaymentSplit) => void;
  grandTotal: number;
  /** ถ้าจริง — แสดง slip warning เมื่อ transfer > 0 + ไม่มีสลิป */
  hasSlip?: boolean;
}

const EPSILON = 0.01;
const ZERO_SPLIT: PaymentSplit = { cash: 0, transfer: 0, card: 0, qr: 0 };

/**
 * Editor 4-channel split payment (สด/โอน/บัตร/QR) สำหรับ MIXED order.
 *
 * UX rules:
 *  - Live validation: sum vs grandTotal (badge เขียว/แดง)
 *  - Quick-fill: ปุ่ม "เติมส่วนที่ขาด" ลงช่องที่กำลังโฟกัส
 *  - ห้ามรับเกิน (Q2) → input cap ที่ grandTotal
 *  - Tolerance ±0.01 (rounding) — match backend EPSILON
 *  - Warn ถ้า transfer > 0 + ไม่ได้ upload slip
 */
export function PaymentSplitEditor({ value, onChange, grandTotal, hasSlip }: Props) {
  const safeVal = value ?? ZERO_SPLIT;

  const sum = useMemo(
    () => (safeVal.cash || 0) + (safeVal.transfer || 0)
        + (safeVal.card || 0) + (safeVal.qr || 0),
    [safeVal],
  );
  const diff = grandTotal - sum;       // > 0 = ยังขาด, < 0 = เกิน
  const matched = Math.abs(diff) <= EPSILON;
  const overflow = diff < -EPSILON;

  const update = (key: keyof PaymentSplit, raw: string) => {
    const n = Math.max(0, Number(raw) || 0);
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
              {diff > EPSILON && (
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
          {matched && <span className="text-emerald-700">✓ ยอดตรง</span>}
          {!matched && diff > 0 && (
            <span className="text-amber-700">ขาดอีก {formatTHB(diff)}</span>
          )}
          {overflow && (
            <span className="text-red-700">เกิน {formatTHB(-diff)} (Q2: รับเกินไม่ได้)</span>
          )}
        </div>
      </div>

      {/* ────── Transfer-slip warning ────── */}
      {safeVal.transfer > 0 && !hasSlip && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            มียอดโอน <strong>{formatTHB(safeVal.transfer)}</strong> —
            ต้องแนบสลิปก่อนปิดบิล (อนุญาตหลายใบ)
          </span>
        </div>
      )}
    </div>
  );
}

/** ตรวจ split ผ่านเกณฑ์ก่อน submit checkout */
export function validateSplit(split: PaymentSplit, grandTotal: number): string | null {
  const sum = split.cash + split.transfer + split.card + split.qr;
  if (Math.abs(grandTotal - sum) > EPSILON) {
    if (sum < grandTotal) return `ยอดผสมขาด ${formatTHB(grandTotal - sum)}`;
    return `ยอดผสมเกิน ${formatTHB(sum - grandTotal)} — ห้ามรับเกิน`;
  }
  return null;
}
