import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, RefreshCw } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { formatDateTime, formatTHB } from '@/lib/format';
import { shopToday } from '@/lib/datetime';
import { usePrinter } from '@/hooks/usePrinter';

interface Props {
  branchId?: string;
}

export function CashHistoryPanel({ branchId }: Props) {
  const today = shopToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(0);
  const printer = usePrinter();
  const query = useQuery({
    queryKey: ['cash-register-history', branchId, from, to, page],
    queryFn: () => cashRegisterApi.history({ from, to, branchId, page, size: 30 }),
    enabled: from <= to,
  });

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body flex flex-wrap items-end gap-3">
          <DateInput label="ตั้งแต่" value={from} onChange={(value) => { setFrom(value); setPage(0); }} />
          <DateInput label="ถึง" value={to} onChange={(value) => { setTo(value); setPage(0); }} />
          <button className="btn-secondary ml-auto" onClick={() => query.refetch()}>
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">ประวัติปิดเก๊ะ ({query.data?.totalElements ?? 0} กะ)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-100 text-left text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2">Session / เก๊ะ</th>
                <th className="px-4 py-2">เปิด–ปิด</th>
                <th className="px-4 py-2">ผู้รับผิดชอบ</th>
                <th className="px-4 py-2 text-right">ยอดรับสุทธิ</th>
                <th className="px-4 py-2 text-right">ควรมี</th>
                <th className="px-4 py-2 text-right">นับจริง</th>
                <th className="px-4 py-2 text-center">ผลตรวจ</th>
                <th className="px-4 py-2 text-center">พิมพ์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.isLoading && <EmptyRow text="กำลังโหลดประวัติ..." />}
              {!query.isLoading && !query.data?.content.length && <EmptyRow text="ไม่พบกะที่ปิดแล้วในช่วงนี้" />}
              {query.data?.content.map((session) => {
                const variance = Number(session.variance ?? 0);
                return (
                  <tr key={session.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="font-mono font-semibold">{session.sessionNo}</div><div className="text-xs text-slate-500">{session.registerName}</div></td>
                    <td className="px-4 py-3 text-xs"><div>{formatDateTime(session.openedAt)}</div><div>{formatDateTime(session.closedAt)}</div></td>
                    <td className="px-4 py-3 text-xs"><div>เปิด: {session.openedBy}</div><div>ปิด: {session.closedBy ?? '-'}</div>{session.note && <div className="mt-1 max-w-52 text-slate-500">{session.note}</div>}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatTHB(session.netSalesTotal)}</td>
                    <td className="px-4 py-3 text-right">{formatTHB(session.expectedClose)}</td>
                    <td className="px-4 py-3 text-right">{formatTHB(session.actualClose)}</td>
                    <td className="px-4 py-3 text-center"><VarianceBadge variance={variance} /></td>
                    <td className="px-4 py-3 text-center">
                      <button className="btn-secondary px-2 py-1" title="พิมพ์ใบสรุปกะนี้"
                        disabled={printer.printing} onClick={() => printer.printCashSessionSummary(session)}>
                        <Printer className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {query.data && query.data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>ก่อนหน้า</button>
            <span>หน้า {page + 1} / {query.data.totalPages}</span>
            <button className="btn-secondary" disabled={query.data.last} onClick={() => setPage((value) => value + 1)}>ถัดไป</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className="input" type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function VarianceBadge({ variance }: { variance: number }) {
  if (variance === 0) return <span className="badge-green">ตรง</span>;
  if (variance < 0) return <span className="badge-red">ขาด {formatTHB(Math.abs(variance))}</span>;
  return <span className="badge-amber">เกิน {formatTHB(variance)}</span>;
}

function EmptyRow({ text }: { text: string }) {
  return <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{text}</td></tr>;
}
