import { Banknote, ArrowLeftRight, CreditCard, QrCode, Receipt } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { netPayments, type PaymentMethodKey } from '@/lib/cash/netPayments';
import type { PaymentBreakdown } from '@/types/api';

interface Props {
  breakdown: PaymentBreakdown | null;
  /** เงินที่คืนลูกค้าในกะ/ช่วงนี้ — หักออกจากแถวช่องทางที่เงินออกจริง (FIX-210) */
  refundCashTotal?: number;
  refundTransferTotal?: number;
  className?: string;
}

const METHOD: Record<PaymentMethodKey, { label: string; icon: React.ReactNode; bg: string; fg: string }> = {
  CASH:     { label: 'เงินสด', icon: <Banknote className="h-4 w-4" />, bg: 'bg-emerald-50', fg: 'text-emerald-800' },
  TRANSFER: { label: 'โอน', icon: <ArrowLeftRight className="h-4 w-4" />, bg: 'bg-sky-50', fg: 'text-sky-800' },
  CARD:     { label: 'บัตร', icon: <CreditCard className="h-4 w-4" />, bg: 'bg-violet-50', fg: 'text-violet-800' },
  QR:       { label: 'QR', icon: <QrCode className="h-4 w-4" />, bg: 'bg-orange-50', fg: 'text-orange-800' },
};

/**
 * แสดงสรุปยอดต่อ method ที่หน้าเก๊ะ (ตอบ requirement
 * "เย็นนี้สรุปสดเท่าไหร่ โอนเท่าไหร่") — ทุกแถวเป็นยอดสุทธิหลังหักเงินคืนแล้ว (FIX-210)
 */
export function PaymentBreakdownCard({ breakdown, refundCashTotal = 0, refundTransferTotal = 0, className = '' }: Props) {
  if (!breakdown) {
    return (
      <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-400 ${className}`}>
        ยังไม่มีบิลใน session นี้
      </div>
    );
  }

  const net = netPayments(breakdown, refundCashTotal, refundTransferTotal);
  const hasRefund = net.refundTotal > 0;

  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
        <Receipt className="h-4 w-4" />
        สรุปยอดรับตามวันที่บัญชี ({breakdown.totalOrderCount} บิล/งานซ่อม)
      </div>
      <div className="divide-y divide-slate-100">
        {net.lines.map((l) => {
          const m = METHOD[l.key];
          return (
            <div key={l.key} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <div className={`flex items-center gap-2 text-sm font-medium ${m.fg}`}>
                  <span className={`grid h-7 w-7 place-items-center rounded-md ${m.bg}`}>{m.icon}</span>
                  {m.label}
                  {l.key === 'CASH' && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      ในเก๊ะ
                    </span>
                  )}
                </div>
                {l.refunded > 0 && (
                  <div className="mt-0.5 pl-9 text-[11px] text-slate-500">
                    รับ {formatTHB(l.received)} · <span className="text-rose-700">คืน −{formatTHB(l.refunded)}</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className={`font-bold tabular-nums ${l.net < 0 ? 'text-rose-700' : ''}`}>{formatTHB(l.net)}</div>
                <div className="text-[11px] text-slate-400">{l.count} บิล</div>
              </div>
            </div>
          );
        })}
      </div>
      {(breakdown.repairTotal ?? 0) > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          <span>ในยอดด้านบนเป็นค่าซ่อม ({breakdown.repairCount ?? 0} งาน)</span>
          <span className="font-semibold tabular-nums">{formatTHB(breakdown.repairTotal ?? 0)}</span>
        </div>
      )}
      {(breakdown.depositTotal ?? 0) > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          <span>ในยอดด้านบนเป็นมัดจำ/จองเครื่อง ({breakdown.depositCount ?? 0} ใบ) — ยอดขายนับวันที่ขายเครื่อง</span>
          <span className="font-semibold tabular-nums">{formatTHB(breakdown.depositTotal ?? 0)}</span>
        </div>
      )}
      {hasRefund && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          <span>รับก่อนหักคืน {formatTHB(net.receivedTotal)}</span>
          <span className="font-semibold tabular-nums text-rose-700">คืนเงิน −{formatTHB(net.refundTotal)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">{hasRefund ? 'ยอดรับสุทธิ (หักคืนเงินแล้ว)' : 'ยอดรับรวม'}</span>
        <span className="text-lg font-bold tabular-nums text-slate-900">{formatTHB(net.netTotal)}</span>
      </div>
    </div>
  );
}
