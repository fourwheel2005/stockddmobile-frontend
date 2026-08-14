import { Banknote, ArrowLeftRight, CreditCard, QrCode, Receipt } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import type { PaymentBreakdown } from '@/types/api';

interface Props {
  breakdown: PaymentBreakdown | null;
  refundTotal?: number;
  netSalesTotal?: number;
  className?: string;
}

/**
 * แสดงสรุปยอดต่อ method ที่หน้าเก๊ะ (ตอบ requirement
 * "เย็นนี้สรุปสดเท่าไหร่ โอนเท่าไหร่")
 */
export function PaymentBreakdownCard({ breakdown, refundTotal = 0, netSalesTotal, className = '' }: Props) {
  if (!breakdown) {
    return (
      <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-400 ${className}`}>
        ยังไม่มีบิลใน session นี้
      </div>
    );
  }

  const rows: Array<{
    label: string;
    icon: React.ReactNode;
    total: number;
    count: number;
    bg: string;
    fg: string;
    isCash?: boolean;
  }> = [
    {
      label: 'เงินสด', icon: <Banknote className="h-4 w-4" />,
      total: breakdown.cashTotal, count: breakdown.cashOrderCount,
      bg: 'bg-emerald-50', fg: 'text-emerald-800', isCash: true,
    },
    {
      label: 'โอน', icon: <ArrowLeftRight className="h-4 w-4" />,
      total: breakdown.transferTotal, count: breakdown.transferOrderCount,
      bg: 'bg-sky-50', fg: 'text-sky-800',
    },
    {
      label: 'บัตร', icon: <CreditCard className="h-4 w-4" />,
      total: breakdown.cardTotal, count: breakdown.cardOrderCount,
      bg: 'bg-violet-50', fg: 'text-violet-800',
    },
    {
      label: 'QR', icon: <QrCode className="h-4 w-4" />,
      total: breakdown.qrTotal, count: breakdown.qrOrderCount,
      bg: 'bg-orange-50', fg: 'text-orange-800',
    },
  ];

  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
        <Receipt className="h-4 w-4" />
        สรุปยอดรับเงิน ({breakdown.totalOrderCount} บิล)
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
            <div className={`flex items-center gap-2 text-sm font-medium ${r.fg}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-md ${r.bg}`}>{r.icon}</span>
              {r.label}
              {r.isCash && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  ในเก๊ะ
                </span>
              )}
            </div>
            <div className="text-right">
              <div className="font-bold tabular-nums">{formatTHB(r.total)}</div>
              <div className="text-[11px] text-slate-400">{r.count} บิล</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">ยอดรับรวม</span>
        <span className="text-lg font-bold tabular-nums text-slate-900">{formatTHB(breakdown.grandTotal)}</span>
      </div>
      {refundTotal > 0 && (
        <>
          <div className="flex items-center justify-between border-t border-slate-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            <span>หักคืนเงิน</span><span className="font-semibold">-{formatTHB(refundTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-emerald-50 px-4 py-2.5">
            <span className="text-sm font-semibold text-emerald-800">ยอดรับสุทธิ</span>
            <span className="text-lg font-bold text-emerald-800">{formatTHB(netSalesTotal ?? breakdown.grandTotal - refundTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
}
