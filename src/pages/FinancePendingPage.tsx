import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Landmark, CheckCircle2, XCircle, RefreshCw, Building2, Clock, Check, X } from 'lucide-react';
import { posApi } from '@/api/pos';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDateTime } from '@/lib/format';
import { FINANCE_PARTNER_LABEL, FINANCE_STATUS_LABEL } from '@/types/api';
import type { SalesOrderResponse } from '@/types/api';

/**
 * V31 — หน้ารายการบิลผ่อนกับไฟแนนซ์ที่ยังรอเงินโอนคืน
 *
 *  Flow:
 *   PENDING (เพิ่งสร้างบิล)
 *      ↓ ไฟแนนซ์อนุมัติ → APPROVED (แก้มือเพิ่ม ถ้ามี webhook อนาคต)
 *      ↓ เงินเข้าบัญชีร้าน → กดยืนยัน → RECEIVED
 *      ↓ ไฟแนนซ์ปฏิเสธ   → กดปฏิเสธ → DECLINED (ต้อง refund แยก)
 */
export function FinancePendingPage() {
  const qc = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [refNo, setRefNo] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance-pending'],
    queryFn: posApi.financePending,
    refetchInterval: 60_000,
  });

  const confirm = useMutation({
    mutationFn: (vars: { id: string; referenceNo?: string }) =>
      posApi.financeConfirm(vars.id, vars.referenceNo),
    onSuccess: (o) => {
      toast.success(`ยืนยันไฟแนนซ์โอนคืนแล้ว — ${o.billNo}`);
      qc.invalidateQueries({ queryKey: ['finance-pending'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      setConfirmingId(null);
      setRefNo('');
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const decline = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      posApi.financeDecline(vars.id, vars.reason),
    onSuccess: (o) => {
      toast.success(`บันทึกไฟแนนซ์ปฏิเสธแล้ว — ${o.billNo}`);
      qc.invalidateQueries({ queryKey: ['finance-pending'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleDecline = (o: SalesOrderResponse) => {
    const reason = window.prompt(
      `ปฏิเสธโดยไฟแนนซ์ ${o.billNo}\n\nกรอกเหตุผล:`,
    );
    if (!reason || !reason.trim()) return;
    decline.mutate({ id: o.id, reason: reason.trim() });
  };

  const totalPending = (data ?? []).reduce(
    (sum, o) => sum + Number(o.financePayoutAmount ?? 0), 0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Landmark className="h-6 w-6 text-brand-600" />
            ไฟแนนซ์ค้างจ่าย
          </h1>
          <p className="page-subtitle">
            บิลผ่อนผ่านสถาบันการเงิน — รอเงินโอนคืนเข้าบัญชีร้าน
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary" disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          รีเฟรช
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card border-2 border-amber-300">
          <div className="card-body">
            <div className="text-xs text-slate-500">บิลที่รออยู่</div>
            <div className="text-2xl font-bold text-amber-700">{data?.length ?? 0}</div>
          </div>
        </div>
        <div className="card border-2 border-amber-300 sm:col-span-2">
          <div className="card-body">
            <div className="text-xs text-slate-500">ยอดรวมที่ไฟแนนซ์ต้องโอนคืน</div>
            <div className="text-2xl font-bold text-amber-700 tabular-nums">{formatTHB(totalPending)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">เลขที่บิล</th>
                <th className="px-4 py-2.5">ลูกค้า</th>
                <th className="px-4 py-2.5">ไฟแนนซ์</th>
                <th className="px-4 py-2.5">งวด</th>
                <th className="px-4 py-2.5 text-right">ดาวน์</th>
                <th className="px-4 py-2.5 text-right">รอโอนคืน</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5">สร้าง</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {!isLoading && data && data.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
                    <div className="mt-2">ยอดเยี่ยม — ไม่มีบิลค้างจ่ายจากไฟแนนซ์</div>
                  </td>
                </tr>
              )}
              {data?.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/pos/orders/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                      {o.billNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{o.customerName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                      <Building2 className="h-3 w-3" />
                      {o.financePartner ? FINANCE_PARTNER_LABEL[o.financePartner] : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{o.installmentMonths ?? '—'} เดือน</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">{formatTHB(o.downPaymentAmount ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-amber-700">
                    {formatTHB(o.financePayoutAmount ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                      o.financePayoutStatus === 'PENDING'
                        ? 'bg-amber-100 text-amber-800'
                        : o.financePayoutStatus === 'APPROVED'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      <Clock className="h-3 w-3" />
                      {o.financePayoutStatus ? FINANCE_STATUS_LABEL[o.financePayoutStatus] : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    {confirmingId === o.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="input h-8 w-32 text-xs"
                          placeholder="เลขอ้างอิงโอน"
                          value={refNo}
                          onChange={(e) => setRefNo(e.target.value)}
                          autoFocus
                        />
                        <button
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          disabled={confirm.isPending}
                          onClick={() => confirm.mutate({
                            id: o.id,
                            referenceNo: refNo.trim() || undefined,
                          })}>
                          <Check className="inline h-3.5 w-3.5 align-[-2px]" />
                        </button>
                        <button
                          className="rounded px-1 text-slate-500 hover:bg-slate-100"
                          onClick={() => { setConfirmingId(null); setRefNo(''); }}>
                          <X className="inline h-3.5 w-3.5 align-[-2px]" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setConfirmingId(o.id)}
                          title="ยืนยันไฟแนนซ์โอนคืนแล้ว">
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          onClick={() => handleDecline(o)}
                          title="ไฟแนนซ์ปฏิเสธ">
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
