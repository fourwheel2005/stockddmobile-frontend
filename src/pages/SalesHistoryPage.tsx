import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Receipt, Printer, Undo2 } from 'lucide-react';
import { posApi } from '@/api/pos';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { ReceiptPrintView } from '@/components/ReceiptPrintView';
import { formatTHB, formatDateTime } from '@/lib/format';
import type { SalesOrderResponse, SalesOrderStatus } from '@/types/api';

const STATUS_BADGE: Record<SalesOrderStatus, string> = {
  DRAFT: 'badge-slate',
  PAID: 'badge-green',
  CANCELLED: 'badge-red',
  REFUNDED: 'badge-amber',
};

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  DRAFT: 'ยังไม่ปิดบิล',
  PAID: 'จ่ายแล้ว',
  CANCELLED: 'ยกเลิก',
  REFUNDED: 'คืนเงินแล้ว',
};

export function SalesHistoryPage() {
  const qc = useQueryClient();
  const canRefund = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<SalesOrderStatus | ''>('');
  const [printOrder, setPrintOrder] = useState<SalesOrderResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-orders', { page, status }],
    queryFn: () => posApi.listOrders({ page, size: 50, status: status || undefined }),
  });

  const refund = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => posApi.refund(id, reason),
    onSuccess: (order) => {
      toast.success(`คืนเงินบิล ${order.billNo} สำเร็จ`);
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleRefund = (o: SalesOrderResponse) => {
    const reason = window.prompt(
      `ยืนยันคืนเงินบิล ${o.billNo}\n\nยอด ${formatTHB(o.grandTotal)} จะคืนเข้าสต็อก\nกรอกเหตุผล:`
    );
    if (!reason || !reason.trim()) return;
    refund.mutate({ id: o.id, reason: reason.trim() });
  };

  const handlePrint = async (id: string) => {
    try {
      const order = await posApi.getOrder(id);
      setPrintOrder(order);
      // Wait next frame so React renders the receipt before print fires
      setTimeout(() => window.print(), 100);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Receipt className="h-6 w-6 text-brand-600" /> ประวัติการขาย (Sales History)
          </h1>
          <p className="text-sm text-slate-500">บิลทั้งหมดที่ออกจากระบบ POS</p>
        </div>
        <select className="input w-48" value={status}
                onChange={(e) => { setStatus(e.target.value as SalesOrderStatus | ''); setPage(0); }}>
          <option value="">ทุกสถานะ</option>
          <option value="PAID">จ่ายแล้ว</option>
          <option value="REFUNDED">คืนเงินแล้ว</option>
          <option value="DRAFT">ยังไม่ปิด</option>
          <option value="CANCELLED">ยกเลิก</option>
        </select>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">เลขที่บิล</th>
                <th className="px-5 py-2.5">ลูกค้า</th>
                <th className="px-5 py-2.5 text-right">รายการ</th>
                <th className="px-5 py-2.5 text-right">ยอดสุทธิ</th>
                <th className="px-5 py-2.5">วิธีชำระ</th>
                <th className="px-5 py-2.5">สถานะ</th>
                <th className="px-5 py-2.5">ผู้ขาย</th>
                <th className="px-5 py-2.5">วันที่</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/pos/orders/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                      {o.billNo}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{o.customerName ?? <span className="text-slate-400">Walk-in</span>}</td>
                  <td className="px-5 py-3 text-right">{o.items.length}</td>
                  <td className="px-5 py-3 text-right font-bold">{formatTHB(o.grandTotal)}</td>
                  <td className="px-5 py-3 text-xs">{o.paymentMethod ?? '-'}</td>
                  <td className="px-5 py-3"><span className={STATUS_BADGE[o.status]}>{STATUS_LABEL[o.status]}</span></td>
                  <td className="px-5 py-3 text-xs">{o.createdBy}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(o.createdAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                        title="พิมพ์ใบเสร็จ"
                        onClick={() => handlePrint(o.id)}>
                        <Printer className="h-4 w-4" />
                      </button>
                      {canRefund && o.status === 'PAID' && (
                        <button
                          className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                          title="คืนเงิน"
                          onClick={() => handleRefund(o)}>
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">ยังไม่มีบิล</td></tr>
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

      {printOrder && <ReceiptPrintView order={printOrder} />}
    </div>
  );
}
