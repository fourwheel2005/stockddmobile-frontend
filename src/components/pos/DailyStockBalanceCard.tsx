import { useQuery } from '@tanstack/react-query';
import { Boxes, RefreshCw } from 'lucide-react';
import { posApi } from '@/api/pos';
import type { DailyStockBalance, DailyStockGroup } from '@/types/api';

const REFRESH_INTERVAL_MS = 60_000;

interface Props {
  branchId?: string;
}

export function dailyStockBalanceKey(branchId?: string) {
  return ['inventory', 'daily-stock-balance', branchId ?? 'all'] as const;
}

export function DailyStockBalanceCard({ branchId }: Props) {
  const query = useQuery({
    queryKey: dailyStockBalanceKey(branchId),
    queryFn: () => posApi.dailyStockBalance(branchId),
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  return (
    <section className="card overflow-hidden" aria-label="รายงานตรวจนับเครื่องวันนี้">
      <ReportHeader data={query.data} fetching={query.isFetching} onRefresh={() => query.refetch()} />
      <ReportContent data={query.data} loading={query.isLoading} error={query.isError} />
    </section>
  );
}

function ReportHeader({ data, fetching, onRefresh }: {
  data?: DailyStockBalance; fetching: boolean; onRefresh: () => void;
}) {
  return (
    <div className="card-header flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="flex items-center gap-2"><Boxes className="h-5 w-5" /> ตรวจนับเครื่องวันนี้</div>
        <p className="mt-0.5 text-xs font-normal text-slate-500">
          {data ? `วันที่ ${formatThaiDate(data.context.businessDate)}` : 'กำลังโหลดวันที่'} · ยอดปัจจุบันหลังหักเครื่องที่ขายแล้ว · อัปเดตทุก 1 นาที
        </p>
      </div>
      <button type="button" className="btn-secondary" onClick={onRefresh} disabled={fetching}>
        <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} /> อัปเดตยอด
      </button>
    </div>
  );
}

function ReportContent({ data, loading, error }: {
  data?: DailyStockBalance; loading: boolean; error: boolean;
}) {
  if (loading) return <div className="p-5 text-sm text-slate-500">กำลังสรุปยอดสต๊อก...</div>;
  if (error || !data) return <div className="p-5 text-sm text-red-600">โหลดรายงานสต๊อกไม่สำเร็จ กรุณากดอัปเดตยอดอีกครั้ง</div>;
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StockGroupCard group={data.newDevices} tone="emerald" />
        <StockGroupCard group={data.secondHandDevices} tone="amber" />
      </div>
      <ReportFooter data={data} />
    </div>
  );
}

function StockGroupCard({ group, tone }: { group: DailyStockGroup; tone: 'emerald' | 'amber' }) {
  const held = heldTotal(group);
  const color = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60';
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-700">{group.label}</p><p className="text-xs text-slate-500">ยอดที่ควรพบจริงในร้าน</p></div>
        <p className="text-3xl font-bold text-slate-900">{group.onHand.expectedPhysical}<span className="ml-1 text-sm font-medium">เครื่อง</span></p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Metric label="พร้อมขาย" value={group.onHand.readyToSell} />
        <Metric label="รอดำเนินการ" value={held} />
        <Metric label="ขายวันนี้" value={group.soldToday} />
      </div>
      {held > 0 && <HeldBreakdown group={group} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-white/80 px-2 py-2"><div className="text-lg font-bold text-slate-800">{value}</div><div className="text-slate-500">{label}</div></div>;
}

function HeldBreakdown({ group }: { group: DailyStockGroup }) {
  const h = group.onHand.held;
  return (
    <p className="mt-2 text-[11px] leading-5 text-slate-500">
      รอลงสต๊อก {h.pendingIntake} · จอง {h.reserved} · เสีย/ซ่อม {h.defective} · รับคืนรอตรวจ {h.returned}
    </p>
  );
}

function ReportFooter({ data }: { data: DailyStockBalance }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm">
      <span className="text-slate-600">
        รวมควรพบจริง <strong className="text-slate-900">{data.total.onHand.expectedPhysical} เครื่อง</strong>
        {' · ขายวันนี้ '}{data.total.soldToday} เครื่อง
        {/* FIX-158: รับเข้าวันนี้ทุกช่องทาง */}
        {data.intakeToday.total > 0 && (
          <>
            {' · รับเข้าวันนี้ '}<strong className="text-slate-900">{data.intakeToday.total} เครื่อง</strong>
            <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
              {data.intakeToday.purchase > 0 && (
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">ซื้อเข้า {data.intakeToday.purchase}</span>
              )}
              {data.intakeToday.tradeIn > 0 && (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">เทิร์น {data.intakeToday.tradeIn}</span>
              )}
              {data.intakeToday.outright > 0 && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">ลูกค้ามาขาย {data.intakeToday.outright}</span>
              )}
              {data.intakeToday.buyback > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">บอลลูน/คืนเครื่อง {data.intakeToday.buyback}</span>
              )}
            </span>
          </>
        )}
      </span>
      <span className="text-xs text-slate-500">ไม่รวมเครื่องขายแล้ว เครื่องโอนออก และเครื่องกำลังโอน</span>
    </div>
  );
}

function heldTotal(group: DailyStockGroup) {
  const h = group.onHand.held;
  return h.pendingIntake + h.reserved + h.defective + h.returned;
}

function formatThaiDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year + 543}`;
}
