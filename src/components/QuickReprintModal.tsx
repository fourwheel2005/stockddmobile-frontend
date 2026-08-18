import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Search, Printer, ScanLine } from 'lucide-react';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { posApi } from '@/api/pos';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDateTime } from '@/lib/format';
import type { SalesOrderResponse } from '@/types/api';

interface Props {
  onClose: () => void;
  onPrint: (order: SalesOrderResponse) => Promise<unknown>;
  printing: boolean;
}

/**
 * Quick Receipt Print — ใช้ในหน้า POS เพื่อค้นหาแล้วพิมพ์บิลเก่า
 *
 * <h3>วิธีใช้:</h3>
 *  1. ยิงสแกน QR code บนใบเสร็จเก่า — billNo จะถูก paste
 *  2. หรือ พิมพ์ billNo (เช่น INV-20260603-3F768549) มือ
 *  3. กด ค้นหา → ระบบดึงบิล → preview
 *  4. กดพิมพ์ → backend ตัดสินต้นฉบับ/สำเนาจาก audit จริง
 */
export function QuickReprintModal({ onClose, onPrint, printing }: Props) {
  useModalChrome(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [billNo, setBillNo] = useState('');
  const [order, setOrder] = useState<SalesOrderResponse | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = useMutation({
    mutationFn: async (q: string) => {
      // 1. ลอง getByBillNo ถ้ามี — fallback ใช้ list filter
      // SalesOrderRepository หา bill_no ตรง
      const list = await posApi.listOrders({ page: 0, size: 5 });
      const found = list.content.find((o) => o.billNo === q.trim());
      if (!found) {
        // ถ้าไม่เจอใน 5 บิลล่าสุด — ใช้ findByBillNo endpoint (ถ้ามี) หรือ search wider
        // ตอนนี้ทำ widening เป็น 200 บิลล่าสุด — เพียงพอสำหรับ 1 สัปดาห์
        const wider = await posApi.listOrders({ page: 0, size: 200 });
        return wider.content.find((o) => o.billNo === q.trim()) ?? null;
      }
      return found;
    },
    onSuccess: (o) => {
      if (!o) {
        toast.error(`ไม่พบบิลเลขที่ ${billNo}`);
        return;
      }
      setOrder(o);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const doSearch = () => {
    if (!billNo.trim()) return;
    setOrder(null);
    search.mutate(billNo.trim());
  };

  const doPrint = async () => {
    if (!order) return;
    try {
      await onPrint(order);
      onClose();
    } catch {
      // toast already shown by hook
    }
  };

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[10vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Printer className="h-5 w-5 text-brand-600" />
            ค้นหาและพิมพ์บิล
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Hint */}
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            💡 <strong>ยิง QR code</strong> บนใบเสร็จเก่า (เลข bill จะ paste อัตโนมัติ)
            <br />
            หรือพิมพ์เลขบิลเอง เช่น <code className="font-mono bg-white px-1 rounded">INV-20260603-3F768549</code>
          </div>

          {/* Search input */}
          <div>
            <label className="mb-1 block text-sm font-medium">เลขบิล (Bill No)</label>
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                className="input pl-9 font-mono"
                placeholder="ยิงสแกน / พิมพ์ INV-..."
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
              />
            </div>
            <button
              onClick={doSearch}
              disabled={search.isPending || !billNo.trim()}
              className="btn-primary w-full mt-2 justify-center">
              <Search className="h-4 w-4" />
              {search.isPending ? 'กำลังค้น...' : 'ค้นบิล'}
            </button>
          </div>

          {/* Preview */}
          {order && (
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <span className="text-sm font-semibold">✅ พบบิล</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">เลขบิล</div>
                  <div className="font-mono font-semibold">{order.billNo}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">วันที่</div>
                  <div className="text-xs">{formatDateTime(order.closedAt ?? order.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">ลูกค้า</div>
                  <div>{order.customerName ?? 'Walk-in'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">ยอดสุทธิ</div>
                  <div className="font-bold text-brand-700">{formatTHB(order.grandTotal)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-slate-500">รายการ</div>
                  <div className="text-xs">{order.items.length} รายการ · {order.paymentMethod}</div>
                </div>
              </div>
              <div className="mt-3 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
                ระบบจะลองพิมพ์ <strong>ต้นฉบับ</strong> หากครั้งก่อนยังไม่สำเร็จ และระบุ <strong>สำเนา</strong> เฉพาะบิลที่มีต้นฉบับแล้ว · ไม่เปิดลิ้นชัก
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button onClick={onClose} className="btn-secondary">ปิด</button>
          <button
            onClick={doPrint}
            disabled={!order || printing}
            className="btn-primary bg-emerald-600 hover:bg-emerald-700">
            <Printer className="h-4 w-4" />
            {printing ? 'กำลังพิมพ์...' : 'พิมพ์ใบเสร็จ'}
          </button>
        </div>
      </div>
    </div>
  );
}
