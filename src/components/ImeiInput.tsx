import type { InputHTMLAttributes } from 'react';
import { IMEI_LENGTH, cleanImei, imeiDigits } from '@/lib/imei';

/** ป้ายนับหลักท้ายช่อง IMEI เช่น 14/15 — เทา = ยังว่าง · แดง = ยังไม่ครบ · เขียว = ครบ 15 (FIX-211) */
export function ImeiCount({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const n = imeiDigits(value);
  const tone = n === 0 ? 'text-slate-400' : n === IMEI_LENGTH ? 'text-emerald-600' : 'text-rose-600';
  return (
    <span aria-label={`IMEI ${n} จาก ${IMEI_LENGTH} หลัก`}
          className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] font-semibold tabular-nums ${tone} ${className}`}>
      {n}/{IMEI_LENGTH}
    </span>
  );
}

/** ขอบแดงเมื่อกรอกแล้วแต่ยังไม่ครบ 15 หลัก */
export const imeiBorder = (value: string | null | undefined): string => {
  const n = imeiDigits(value);
  return n > 0 && n !== IMEI_LENGTH ? 'border-rose-400 focus:border-rose-500' : '';
};

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  /** ได้ค่าที่ล้างแล้ว (เลขล้วน ≤ 15 หลัก) */
  onChange: (digits: string) => void;
};

/** ช่อง IMEI แบบ controlled — รับเฉพาะตัวเลข 15 หลัก + ตัวนับท้ายช่อง */
export function ImeiInput({ value, onChange, className = 'input', disabled, ...rest }: Props) {
  return (
    <div className="relative">
      <input {...rest} disabled={disabled} inputMode="numeric" maxLength={IMEI_LENGTH}
             className={`${className} pr-12 font-mono ${imeiBorder(value)}`}
             value={value} onChange={(e) => onChange(cleanImei(e.target.value))} />
      {!disabled && <ImeiCount value={value} />}
    </div>
  );
}
