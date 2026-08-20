import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Download, Loader2, Printer, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { cashRegisterApi } from '@/api/cashRegister';
import { reportsApi } from '@/api/reports';
import { extractErrorMessage } from '@/api/client';
import { PaymentBreakdownCard } from './PaymentBreakdownCard';
import { formatTHB } from '@/lib/format';
import { shopToday } from '@/lib/datetime';
import { usePrinter } from '@/hooks/usePrinter';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  branchId?: string;
}

export function CashSummaryPanel({ branchId }: Props) {
  const [month, setMonth] = useState(shopToday().slice(0, 7));
  const [exporting, setExporting] = useState(false);
  const printer = usePrinter();
  const canExportAccounting = useAuthStore((state) => state.hasRole('ADMIN', 'MANAGER'));
  const range = monthRange(month);
  const query = useQuery({
    queryKey: ['cash-register-summary', branchId, range.from, range.to],
    queryFn: () => cashRegisterApi.summary({ ...range, branchId }),
  });
  const summary = query.data;

  async function exportMonthlySales() {
    setExporting(true);
    try {
      const blob = await reportsApi.monthlySalesExcel({ month, branchId });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DDMobile_monthly-sales_${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดไฟล์ยอดขายสำหรับบัญชีแล้ว');
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <label className="mb-1 block text-sm font-medium">เดือนที่ต้องการสรุป</label>
            <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
              <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                title="เดือนก่อนหน้า" onClick={() => setMonth(shiftMonth(month, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <label className="relative flex min-w-52 flex-1 cursor-pointer items-center gap-2 px-2">
                <CalendarDays className="h-4 w-4 text-brand-600" />
                <span className="pointer-events-none flex-1 text-sm font-semibold text-slate-800">
                  {formatMonthLabel(month)}
                </span>
                <input className="absolute inset-0 cursor-pointer opacity-0" type="month" value={month}
                  aria-label="เลือกเดือนที่ต้องการสรุป"
                  onChange={(event) => setMonth(event.target.value || shopToday().slice(0, 7))} />
              </label>
              <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                title="เดือนถัดไป" onClick={() => setMonth(shiftMonth(month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button type="button" className="text-xs font-medium text-brand-600 hover:underline"
              onClick={() => setMonth(shopToday().slice(0, 7))}>กลับเดือนปัจจุบัน</button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {canExportAccounting && (
              <button className="btn-secondary border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={exporting} onClick={exportMonthlySales}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exporting ? 'กำลังสร้าง Excel...' : 'ดาวน์โหลด Excel ส่งบัญชี'}
              </button>
            )}
            <button className="btn-primary" disabled={!summary?.sessionCount || printer.printing}
              onClick={() => summary && printer.printCashPeriodSummary(summary)}>
              <Printer className="h-4 w-4" />
              {printer.printing ? 'กำลังพิมพ์...' : 'พิมพ์สรุปรายเดือน'}
            </button>
          </div>
        </div>
      </div>

      {query.isLoading && <div className="card card-body text-center text-slate-500">กำลังรวมยอด...</div>}
      {query.isError && (
        <div className="card card-body flex items-center gap-2 text-rose-700">
          <TriangleAlert className="h-5 w-5" /> โหลดสรุปยอดไม่สำเร็จ
        </div>
      )}
      {summary && (
        <>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <CalendarRange className="mr-2 inline h-4 w-4" />
            รวมเฉพาะกะที่ปิดแล้ว {summary.sessionCount} กะ · {summary.registerName}
            {' '}— “ยอดรับสุทธิ” คือเงินที่รับจากการขายหักเงินคืน ไม่รวมเงินทอนหรือเงินเติมเก๊ะ
          </div>
          <PaymentBreakdownCard breakdown={summary.breakdown}
            refundTotal={summary.refundTotal} netSalesTotal={summary.netSalesTotal} />
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card">
              <div className="card-header">สรุปยอดรับและรายการประกอบ</div>
              <div className="card-body space-y-2 text-sm">
                <SummaryLine label={`ยอดรับรวม (${summary.breakdown.totalOrderCount} บิล)`}
                  value={summary.breakdown.grandTotal} />
                <SummaryLine label={`คืนเงิน (${summary.refundCount} รายการ)`} value={-summary.refundTotal} danger />
                <SummaryLine label="ยอดรับสุทธิ" value={summary.netSalesTotal} strong />
                <hr />
                <SummaryLine label="เงินเติมเข้าเก๊ะ" value={summary.cashInTotal} />
                <SummaryLine label="จ่ายค่าใช้จ่ายจากเก๊ะ" value={-summary.payoutTotal} />
                <SummaryLine label="เก็บเข้าตู้นิรภัย" value={-summary.safeDropTotal} />
                <SummaryLine label="ปรับปรุงสุทธิ" value={summary.adjustmentTotal} />
                <SummaryLine label="ไฟแนนซ์โอนเข้าบัญชี" value={summary.financePayoutTotal} />
                <SummaryLine label="ตา/ยายสำรองจ่าย" value={summary.ownerPaidTotal} />
              </div>
            </section>
            <section className="card">
              <div className="card-header">ผลตรวจนับเงินสด</div>
              <div className="card-body space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <CountBadge label="ตรง" count={summary.balancedSessionCount} tone="green" />
                  <CountBadge label="ขาด" count={summary.shortageSessionCount} tone="red" />
                  <CountBadge label="เกิน" count={summary.overageSessionCount} tone="amber" />
                </div>
                <SummaryLine label="เงินที่ควรมีรวม" value={summary.expectedCloseTotal} />
                <SummaryLine label="นับเงินจริงรวม" value={summary.actualCloseTotal} />
                <SummaryLine label="ส่วนต่างสุทธิ" value={summary.varianceTotal} strong />
                <SummaryLine label="ยอดขาดสะสม (ไม่หักกลบ)" value={summary.shortageTotal} danger />
                <SummaryLine label="ยอดเกินสะสม (ไม่หักกลบ)" value={summary.overageTotal} />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function SummaryLine({ label, value, strong, danger }: {
  label: string; value: number; strong?: boolean; danger?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'border-t pt-2 font-bold' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span className={danger ? 'font-semibold text-rose-700' : strong ? 'text-brand-700' : 'font-semibold'}>
        {value > 0 && label.includes('ส่วนต่าง') ? '+' : ''}{formatTHB(value)}
      </span>
    </div>
  );
}

function CountBadge({ label, count, tone }: { label: string; count: number; tone: 'green' | 'red' | 'amber' }) {
  const classes = { green: 'bg-emerald-50 text-emerald-800', red: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800' };
  return <div className={`rounded-lg p-2 ${classes[tone]}`}><div className="text-xl font-bold">{count}</div><div>{label}</div></div>;
}
