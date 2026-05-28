import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { lotsApi } from '@/api/lots';
import { formatTHB, formatDate, formatDateTime, formatNumber } from '@/lib/format';

export function LotsPage() {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ['lots', page],
    queryFn: () => lotsApi.list({ page, size: 20 }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Layers className="h-6 w-6 text-brand-600" /> ล็อตการนำเข้า (Stock Lots)
        </h1>
        <p className="text-sm text-slate-500">ประวัติการรับสินค้าเข้าแบบเป็นล็อต</p>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">เลขล็อต (Lot No)</th>
                <th className="px-5 py-2.5">วันที่นำเข้า</th>
                <th className="px-5 py-2.5 text-right">จำนวนรวม</th>
                <th className="px-5 py-2.5 text-right">ต้นทุนรวม</th>
                <th className="px-5 py-2.5">หมายเหตุ</th>
                <th className="px-5 py-2.5">ผู้บันทึก</th>
                <th className="px-5 py-2.5">วันที่บันทึก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-brand-700">{l.lotNo}</td>
                  <td className="px-5 py-3">{formatDate(l.importDate)}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatNumber(l.totalItems)} เครื่อง</td>
                  <td className="px-5 py-3 text-right">{formatTHB(l.totalCost)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{l.note ?? '-'}</td>
                  <td className="px-5 py-3 text-xs">{l.createdBy ?? '-'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(l.createdAt)}</td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">ยังไม่มีล็อต</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
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
