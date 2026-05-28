import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, BellRing } from 'lucide-react';
import { alertsApi } from '@/api/alerts';
import { extractErrorMessage } from '@/api/client';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { AlertStatus } from '@/types/api';

const STATUS_BADGE: Record<AlertStatus, string> = {
  ACTIVE: 'badge-amber',
  ACKNOWLEDGED: 'badge-blue',
  RESOLVED: 'badge-green',
};

export function AlertsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AlertStatus>('ACTIVE');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', status, page],
    queryFn: () => alertsApi.list({ status, page, size: 50 }),
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: () => {
      toast.success('รับทราบการแจ้งเตือนแล้ว');
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <BellRing className="h-6 w-6 text-amber-600" /> Low Stock Alerts
          </h1>
          <p className="text-sm text-slate-500">แจ้งเตือนสินค้าใกล้หมด</p>
        </div>
        <div className="flex gap-2">
          {(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as AlertStatus[]).map((s) => (
            <button key={s}
                    className={status === s ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setStatus(s); setPage(0); }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Product</th>
                <th className="px-5 py-2.5">SKU</th>
                <th className="px-5 py-2.5 text-right">Current</th>
                <th className="px-5 py-2.5 text-right">Threshold</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Created</th>
                <th className="px-5 py-2.5">Acknowledged By</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{a.productName}</td>
                  <td className="px-5 py-3 font-mono text-xs">{a.sku}</td>
                  <td className="px-5 py-3 text-right font-bold text-amber-700">{formatNumber(a.currentQty)}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{formatNumber(a.thresholdQty)}</td>
                  <td className="px-5 py-3"><span className={STATUS_BADGE[a.status]}>{a.status}</span></td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(a.createdAt)}</td>
                  <td className="px-5 py-3 text-xs">{a.acknowledgedBy ?? '-'}</td>
                  <td className="px-5 py-3 text-right">
                    {a.status === 'ACTIVE' && (
                      <button className="btn-secondary" onClick={() => acknowledge.mutate(a.id)}>
                        <Check className="h-4 w-4" /> รับทราบ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">ไม่มี alert ในสถานะนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
            <div>หน้า {data.page + 1} / {data.totalPages}</div>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              <button className="btn-secondary" disabled={data.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
