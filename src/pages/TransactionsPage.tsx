import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/api/inventory';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { StockTxType } from '@/types/api';

const TYPE_BADGE: Record<StockTxType, string> = {
  INBOUND: 'badge-green',
  OUTBOUND: 'badge-red',
  ADJUSTMENT: 'badge-amber',
  TRANSFER: 'badge-blue',
  RETURN: 'badge-blue',
  RESERVE: 'badge-slate',
  RESERVE_CANCEL: 'badge-slate',
};

export function TransactionsPage() {
  const [page, setPage] = useState(0);
  const [type, setType] = useState<StockTxType | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', { page, type }],
    queryFn: () => inventoryApi.getTransactions({
      page, size: 50,
      type: type || undefined,
    }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Stock Transactions</h1>
          <p className="text-sm text-slate-500">ประวัติการเคลื่อนไหวสต็อกทั้งหมด</p>
        </div>
        <div>
          <select className="input w-48" value={type}
                  onChange={(e) => { setType(e.target.value as StockTxType | ''); setPage(0); }}>
            <option value="">ทุกประเภท</option>
            <option value="INBOUND">INBOUND</option>
            <option value="OUTBOUND">OUTBOUND</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="RETURN">RETURN</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Transaction No</th>
                <th className="px-5 py-2.5">Type</th>
                <th className="px-5 py-2.5">Product</th>
                <th className="px-5 py-2.5">SKU</th>
                <th className="px-5 py-2.5 text-right">Qty</th>
                <th className="px-5 py-2.5 text-right">Before → After</th>
                <th className="px-5 py-2.5">Ref</th>
                <th className="px-5 py-2.5">By</th>
                <th className="px-5 py-2.5">At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs">{t.transactionNo}</td>
                  <td className="px-5 py-3"><span className={TYPE_BADGE[t.type]}>{t.type}</span></td>
                  <td className="px-5 py-3">{t.productName}</td>
                  <td className="px-5 py-3 font-mono text-xs">{t.sku}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${t.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {t.quantity > 0 ? '+' : ''}{formatNumber(t.quantity)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">
                    {t.qtyBefore} → {t.qtyAfter}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{t.referenceNo ?? '-'}</td>
                  <td className="px-5 py-3 text-xs">{t.performedBy}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(t.performedAt)}</td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">ยังไม่มี transaction</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
            <div>หน้า {data.page + 1} / {data.totalPages} ({formatNumber(data.totalElements)} รายการ)</div>
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
