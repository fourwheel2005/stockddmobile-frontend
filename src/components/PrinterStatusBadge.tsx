import { Printer } from 'lucide-react';
import type { PrinterStatus } from '@/hooks/usePrinter';

interface Props {
  status: PrinterStatus;
  onClick?: () => void;
}

/**
 * Compact printer status indicator — แสดงในมุมขวาบนของ POS.
 * คลิกเปิด PrinterSettingsModal.
 */
export function PrinterStatusBadge({ status, onClick }: Props) {
  const dotColor = status.bridge
    ? 'bg-emerald-500'
    : status.webUsb
      ? 'bg-amber-500'
      : 'bg-rose-500';
  const label = status.bridge
    ? 'Local Bridge'
    : status.webUsb
      ? 'WebUSB'
      : 'Browser';

  return (
    <button
      type="button"
      onClick={onClick}
      title={`เครื่องพิมพ์: ${label} — คลิกตั้งค่า`}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <Printer className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
