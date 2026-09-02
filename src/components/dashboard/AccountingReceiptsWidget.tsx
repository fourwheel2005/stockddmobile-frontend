import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight, Banknote, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  CreditCard, Download, FileSpreadsheet, Loader2, TriangleAlert, Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi } from '@/api/reports';
import { extractErrorMessage } from '@/api/client';
import { STORE_LOGO_IMAGE_URL } from '@/assets/storeLogo';
import { formatMonthLabel, monthRange, shiftMonth } from '@/components/cash/CashSummaryPanel';
import { RECEIPT_METHOD_FILTERS, methodTotal, receiptsExcelFilename, totalsTieOut } from '@/lib/accountingReceipts';
import { formatDateTime, formatNumber, formatTHB } from '@/lib/format';
import { shopToday } from '@/lib/datetime';
import { useBranchStore } from '@/stores/branchStore';
import type { AccountingReceiptReport, ReceiptMethodFilter } from '@/types/api';

/** จำนวนใบเสร็จล่าสุดที่โชว์บน Dashboard — รายการครบทุกบรรทัดอยู่ใน Excel */
export const DASHBOARD_RECEIPT_ROWS = 20;

interface Props {
  className?: string;
}

/**
 * การ์ด "สรุปรายรับ-รายจ่ายส่งบัญชี" — โครงเดียวกับไฟล์รายงานใบเสร็จของบัญชี:
 * ยอดตามช่องทาง (สด/โอน/บัตร/QR), ตามประเภทใบเสร็จ, รายจ่าย+เงินคืน และรายการใบเสร็จล่าสุด.
 */
export function AccountingReceiptsWidget({ className = '' }: Props) {
  const [month, setMonth] = useState(shopToday().slice(0, 7));
  const [method, setMethod] = useState<ReceiptMethodFilter | null>(null);
  const [exporting, setExporting] = useState(false);
  const branchId = useBranchStore((s) => s.activeBranchId) ?? undefined;
  const range = monthRange(month);
  const params = { ...range, branchId, method };

  const query = useQuery({
    queryKey: ['accounting-receipts', branchId ?? null, range.from, range.to, method],
    queryFn: () => reportsApi.accountingReceipts({ ...params, limit: DASHBOARD_RECEIPT_ROWS }),
    staleTime: 60_000,
  });
  const report = query.data;

  async function downloadExcel() {
    setExporting(true);
    try {
      const blob = await reportsApi.accountingReceiptsExcel(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = receiptsExcelFilename(range.from, range.to);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดไฟล์ใบเสร็จส่งบัญชีแล้ว');
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={`card ${className}`}>
      <div className="card-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <img src={STORE_LOGO_IMAGE_URL} alt="โลโก้ร้าน" className="h-12 w-12 rounded-full object-cover shadow-sm" />
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="h-5 w-5 text-brand-600" />
              สรุปรายรับ-รายจ่ายส่งบัญชี
            </div>
            <div className="text-xs font-normal text-slate-500">
              {report?.shopName ?? 'DDMobile'} · {report?.scopeLabel ?? 'ทุกสาขา'} · ใบเสร็จตามวันขาย {range.from} ถึง {range.to}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          <button className="btn-secondary border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            disabled={exporting || !report} onClick={downloadExcel}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'กำลังสร้าง Excel...' : 'ดาวน์โหลด Excel ส่งบัญชี'}
          </button>
        </div>
      </div>

      <div className="card-body space-y-4">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1 text-slate-500">ประเภทการชำระเงิน:</span>
          {RECEIPT_METHOD_FILTERS.map((option) => (
            <button key={option.label} type="button"
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                method === option.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              onClick={() => setMethod(option.value)}>
              {option.label}
            </button>
          ))}
        </div>

        {query.isLoading && <div className="py-6 text-center text-slate-500">กำลังรวมยอดใบเสร็จ...</div>}
        {query.isError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <TriangleAlert className="h-5 w-5" /> โหลดสรุปส่งบัญชีไม่สำเร็จ: {extractErrorMessage(query.error)}
          </div>
        )}
        {report && <ReportBody report={report} />}
      </div>
    </div>
  );
}

function ReportBody({ report }: { report: AccountingReceiptReport }) {
  const tieOut = totalsTieOut(report);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile icon={<Wallet className="h-4 w-4" />} label={`รายรับรวม (${formatNumber(report.totals.receiptCount)} ใบ)`}
          value={formatTHB(report.totals.receivedTotal)} tone="bg-emerald-50 text-emerald-800" />
        <Tile icon={<Banknote className="h-4 w-4" />} label="เงินสด" value={formatTHB(methodTotal(report, 'CASH'))}
          tone="bg-emerald-50 text-emerald-800" />
        <Tile icon={<ArrowLeftRight className="h-4 w-4" />} label="เงินโอน" value={formatTHB(methodTotal(report, 'TRANSFER'))}
          tone="bg-sky-50 text-sky-800" />
        <Tile icon={<CreditCard className="h-4 w-4" />} label="บัตร + QR"
          value={formatTHB(methodTotal(report, 'CARD') + methodTotal(report, 'QR'))} tone="bg-violet-50 text-violet-800" />
        <Tile icon={<TriangleAlert className="h-4 w-4" />} label="รายจ่าย + เงินคืน" value={`-${formatTHB(report.expenses.total)}`}
          tone="bg-rose-50 text-rose-800" />
        <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="รายรับสุทธิ" value={formatTHB(report.netTotal)}
          tone="bg-slate-100 text-slate-800" />
      </div>

      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
        tieOut ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
        {tieOut ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
        {tieOut
          ? 'ตรวจสอบแล้ว: ยอดตามช่องทาง = ยอดตามประเภท = รายรับรวม และ ยอดก่อนภาษี + ภาษี = รายรับรวม'
          : 'ยอดไม่ตรงกันระหว่างช่องทาง/ประเภท/รายรับรวม — อย่าส่งบัญชีจนกว่าจะตรวจสอบ'}
        {' · '}VAT {formatTHB(report.totals.vatTotal)} · ก่อน VAT {formatTHB(report.totals.preVatTotal)}
        {report.repairIncluded ? ' · รวมค่าซ่อมที่รับเครื่องคืนแล้ว' : ' · ไม่รวมค่าซ่อมเมื่อกรองรายสาขา'}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TotalsTable title="ตามช่องทางรับเงิน" rows={report.totals.byMethod.map((r) => ({ key: r.label, label: r.label, count: r.count, total: r.total }))}
          totalLabel="รวมรายรับ" total={report.totals.receivedTotal} count={report.totals.receiptCount} />
        <TotalsTable title="ตามประเภทใบเสร็จ" rows={report.totals.byType.map((r) => ({ key: r.type, label: r.label, count: r.count, total: r.total }))}
          totalLabel="รวมรายรับ" total={report.totals.receivedTotal} count={report.totals.receiptCount} />
        <ExpensesTable report={report} />
      </div>

      <ReceiptsTable report={report} />
    </>
  );
}

function ExpensesTable({ report }: { report: AccountingReceiptReport }) {
  const e = report.expenses;
  const rows = [
    { key: 'refund-cash', label: 'คืนเงินลูกค้า (เงินสด)', total: e.refundCashTotal },
    { key: 'refund-transfer', label: 'คืนเงินลูกค้า (โอน)', total: e.refundTransferTotal },
    { key: 'shipping', label: 'ค่าส่งจ่ายจากเก๊ะ', total: e.shippingPayoutTotal },
    { key: 'owner-shipping', label: 'ค่าส่งที่ตา/ยายสำรองจ่าย', total: e.ownerShippingTotal },
    { key: 'expense', label: 'ค่าใช้จ่ายอื่นจากเก๊ะ', total: e.expensePayoutTotal },
    { key: 'tradein-cash', label: 'จ่ายส่วนต่างเทิร์น (เงินสด)', total: e.tradeInPayoutCashTotal },
    { key: 'tradein-transfer', label: 'จ่ายส่วนต่างเทิร์น (โอน)', total: e.tradeInPayoutTransferTotal },
  ].filter((row) => row.total > 0);
  return (
    <TotalsTable title="รายจ่ายและเงินคืน (ตามวันที่บันทึกจริง)" rows={rows} negative
      totalLabel="รวมรายจ่าย" total={e.total} count={e.refundCount + e.payoutCount}
      empty="ไม่มีรายจ่าย/เงินคืนในช่วงนี้" />
  );
}

function TotalsTable({ title, rows, totalLabel, total, count, negative = false, empty = 'ยังไม่มีใบเสร็จในช่วงนี้' }: {
  title: string;
  rows: Array<{ key: string; label: string; count?: number; total: number }>;
  totalLabel: string; total: number; count: number; negative?: boolean; empty?: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{title}</div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-4 py-2 text-slate-700">{row.label}</td>
              <td className="px-2 py-2 text-right text-xs text-slate-400">{row.count != null ? `${formatNumber(row.count)} ใบ` : ''}</td>
              <td className={`px-4 py-2 text-right font-semibold tabular-nums ${negative ? 'text-rose-700' : ''}`}>
                {negative ? '-' : ''}{formatTHB(row.total)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-400">{empty}</td></tr>}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
            <td className="px-4 py-2">{totalLabel}</td>
            <td className="px-2 py-2 text-right text-xs font-normal text-slate-500">{formatNumber(count)} รายการ</td>
            <td className={`px-4 py-2 text-right tabular-nums ${negative ? 'text-rose-700' : 'text-slate-900'}`}>
              {negative ? '-' : ''}{formatTHB(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function ReceiptsTable({ report }: { report: AccountingReceiptReport }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm">
        <span className="font-semibold text-slate-700">รายการใบเสร็จล่าสุด</span>
        <span className="text-xs text-slate-500">
          แสดง {formatNumber(report.rows.length)} จาก {formatNumber(report.rowCount)} รายการ — ดูครบทุกรายการใน Excel
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">ลำดับ</th>
              <th className="px-3 py-2">เลขที่ใบเสร็จ/บิล</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2 text-right">ยอดรับชำระ</th>
              <th className="px-3 py-2 text-right">ก่อนภาษี</th>
              <th className="px-3 py-2 text-right">ภาษี</th>
              <th className="px-3 py-2">วันที่/เวลาชำระ</th>
              <th className="px-3 py-2">บัญชี/ช่องทาง</th>
              <th className="px-3 py-2">วิธีชำระ</th>
              <th className="px-3 py-2">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.rows.map((row) => (
              <tr key={`${row.seq}-${row.documentNo}`} className={row.refunded ? 'bg-rose-50/40 text-slate-500' : ''}>
                <td className="px-3 py-2 text-slate-400">{row.seq}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.documentNo}</td>
                <td className="px-3 py-2">{row.typeLabel}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatTHB(row.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatTHB(row.preVat)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatTHB(row.vat)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.paidAt)}</td>
                <td className="px-3 py-2">{row.account}</td>
                <td className="px-3 py-2">{row.methodLabel}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {[row.counterparty, row.note, row.refunded ? 'คืนเงินแล้ว' : null].filter(Boolean).join(' · ')}
                </td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">ยังไม่มีใบเสร็จในช่วงนี้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
      <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="เดือนก่อนหน้า"
        onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <label className="relative flex min-w-40 cursor-pointer items-center gap-2 px-2">
        <CalendarDays className="h-4 w-4 text-brand-600" />
        <span className="pointer-events-none flex-1 text-sm font-semibold text-slate-800">{formatMonthLabel(month)}</span>
        <input className="absolute inset-0 cursor-pointer opacity-0" type="month" value={month}
          aria-label="เลือกเดือนที่ต้องการสรุปส่งบัญชี"
          onChange={(event) => onChange(event.target.value || shopToday().slice(0, 7))} />
      </label>
      <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="เดือนถัดไป"
        onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">{icon}{label}</div>
      <div className="truncate text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
