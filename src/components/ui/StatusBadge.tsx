import { CheckCircle2, CircleDot, Info, TriangleAlert, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-700',
  info: 'bg-sky-100 text-sky-800',
  neutral: 'bg-slate-100 text-slate-600',
};

const TONE_ICON: Record<StatusTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: XCircle,
  info: Info,
  neutral: CircleDot,
};

interface Props {
  tone: StatusTone;
  children: ReactNode;
  /** ซ่อนไอคอนเมื่อพื้นที่แคบ — สีและข้อความยังบอกสถานะได้ครบ */
  hideIcon?: boolean;
  className?: string;
}

/**
 * ป้ายสถานะมาตรฐานเดียวทั้งระบบ: สี + ไอคอน SVG + ข้อความ (แทน emoji ที่วาดต่างกันแต่ละเครื่อง)
 * ไอคอนเป็น decorative (aria-hidden จาก lucide) ความหมายอยู่ที่ข้อความเสมอ.
 */
export function StatusBadge({ tone, children, hideIcon = false, className = '' }: Props) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]} ${className}`}>
      {!hideIcon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </span>
  );
}
