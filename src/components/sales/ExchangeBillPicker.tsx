import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Repeat, Search, X } from 'lucide-react';
import { posApi } from '@/api/pos';
import { formatDateTime, formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { billRefundOptions } from '@/lib/pos/billRefund';
import type { SalesOrderResponse } from '@/types/api';

/**
 * เปลี่ยนเครื่องที่ POS (FIX-230) — หาบิลเดิมของลูกค้า (เลขบิล / IMEI / ชื่อ / เบอร์) แล้วเลือกเพื่อเปิดหน้าต่างเลือกของที่คืน
 * แสดงเฉพาะบิลที่เปลี่ยนได้ (จ่ายแล้ว · ไม่มีใบกำกับ · ยังมีรายการที่ลูกค้าถืออยู่)
 */
export function ExchangeBillPicker({ onClose, onPick }: {
  onClose: () => void;
  onPick: (order: SalesOrderResponse) => void;
}) {
  useModalChrome(onClose);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ['exchange-bill-search', q],
    queryFn: () => posApi.listOrders({ q, status: 'PAID', page: 0, size: 10 }),
    enabled: q.length >= 3,
  });
  const bills = (data?.content ?? []);

  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[6vh] backdrop-blur-sm animate-modal-fade-in">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="เปลี่ยนเครื่อง — หาบิลเดิม"
           className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold"><Repeat className="h-5 w-5 text-brand-600" /> เปลี่ยนเครื่อง — หาบิลเดิม</h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="ปิด"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus className="input pl-9" value={text} onChange={(e) => setText(e.target.value)}
                   placeholder="ยิง IMEI เครื่องที่ลูกค้าคืน / เลขบิล / ชื่อ / เบอร์" aria-label="ค้นหาบิลเดิม" />
          </div>
          {q.length < 3 && <p className="text-xs text-slate-500">พิมพ์อย่างน้อย 3 ตัว — เร็วสุดคือยิง IMEI เครื่องที่ลูกค้านำมาคืน</p>}
          {q.length >= 3 && isFetching && <p className="text-xs text-slate-400">กำลังค้นหา…</p>}
          {q.length >= 3 && !isFetching && bills.length === 0 && <p className="text-xs text-slate-500">ไม่พบบิลที่จ่ายแล้ว</p>}
          <ul className="space-y-2">
            {bills.map((o) => {
              const opt = billRefundOptions(o).find((x) => x.action === 'EXCHANGE');
              const why = o.taxInvoiceNo ? 'ออกใบกำกับแล้ว — ต้องทำใบลดหนี้' : !opt ? 'ไม่มีรายการเหลือให้คืน' : null;
              return (
                <li key={o.id}>
                  <button type="button" disabled={!!why} onClick={() => onPick(o)}
                          className="w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-semibold text-brand-700">{o.billNo}</span>
                      <span className="tabular-nums font-semibold">{formatTHB(o.grandTotal)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDateTime(o.saleDate ?? o.closedAt ?? o.createdAt)} · {o.customerName ?? 'Walk-in'} · {o.paymentMethod ?? '-'}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-600">
                      {o.items.map((i) => i.productName + (i.imei ? ` ${i.imei}` : '')).join(', ')}
                    </div>
                    {why && <div className="mt-0.5 text-xs font-medium text-amber-700">{why}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
