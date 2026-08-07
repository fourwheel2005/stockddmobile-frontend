import { useState } from 'react';
import { X, PackageOpen, Banknote } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { SalesOrderResponse } from '@/types/api';

interface Props {
  order: SalesOrderResponse;
  onClose: () => void;
  onConfirm: (refundAmount: number, reason: string) => void;
  loading?: boolean;
}

/**
 * รับเครื่องคืนจากลูกค้าผ่อน (ผ่อนไม่ไหว → คืนของ).
 *
 * ต่างจาก "คืนเงิน" ปกติ: เครื่องกลับเข้าสต็อกเหมือนกัน แต่ "คืนเงิน" พนักงานระบุเอง
 * (ปกติ 0 — ร้านเก็บงวดที่จ่ายมาแล้ว). คืนเป็นเงินสดจากลิ้นชัก.
 */
export function ReturnDeviceModal({ order, onClose, onConfirm, loading }: Props) {
  const [refundText, setRefundText] = useState('0');
  const [reason, setReason] = useState('');
  useModalChrome(onClose);

  const paid = order.paidAmount ?? 0;
  const refund = Number(refundText);
  // F-05 (FIX-134): รับคืนเฉพาะ "เครื่อง" (มี IMEI/SN) ไม่รวมอุปกรณ์เสริม
  const deviceCount = order.items.filter((i) => i.imei || i.serialNumber).length;
  const refundValid = Number.isFinite(refund) && refund >= 0 && refund <= paid;
  const canConfirm = !loading && refundValid && reason.trim().length > 0;

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <PackageOpen className="h-5 w-5 text-amber-600" />
            รับเครื่องคืน (ผ่อนไม่ไหว) — {order.billNo}
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* สรุปยอด */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">ลูกค้า</span>
              <span className="font-medium">{order.customerName ?? 'Walk-in'}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500">ลูกค้าจ่ายมาแล้ว</span>
              <span className="font-semibold tabular-nums">{formatTHB(paid)}</span>
            </div>
          </div>

          {/* FIX-140: รับคืนเฉพาะเครื่อง → กลับเข้าสต็อกขายได้ทันที (ไม่ต้องกดรับเข้าสต็อกอีก) */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            📦 เฉพาะ <strong>เครื่อง {deviceCount} รายการ</strong> จะกลับเข้าสต็อก <strong>ขายได้ทันที</strong> ·
            อุปกรณ์เสริมที่จ่ายแล้วไม่ถูกดึงกลับ
          </div>

          {/* จำนวนเงินคืน */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              คืนเงินให้ลูกค้า (บาท) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Banknote className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
              <input
                type="number"
                min={0}
                max={paid}
                step="0.01"
                className="input pl-9 tabular-nums"
                value={refundText}
                onChange={(e) => setRefundText(e.target.value)}
                autoFocus
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              💡 ปกติ <strong>0</strong> = ร้านเก็บงวดที่จ่ายมาแล้ว · ใส่จำนวนถ้าตกลงคืนบางส่วน
              {refund > 0 && <> · คืนเป็นเงินสดจากลิ้นชัก {formatTHB(refund)}</>}
            </p>
            {!refundValid && (
              <p className="mt-1 text-xs font-medium text-red-600">
                จำนวนต้องอยู่ระหว่าง 0 ถึง {formatTHB(paid)}
              </p>
            )}
          </div>

          {/* เหตุผล */}
          <div>
            <label className="mb-1 block text-sm font-medium">เหตุผล <span className="text-red-500">*</span></label>
            <textarea
              className="input"
              rows={2}
              placeholder="เช่น ลูกค้าผ่อนต่อไม่ไหว นำเครื่องมาคืน"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-xl border-t bg-slate-50/50 px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary bg-amber-600 hover:bg-amber-700"
            disabled={!canConfirm}
            onClick={() => onConfirm(refund, reason.trim())}>
            <PackageOpen className="h-4 w-4" />
            {loading ? 'กำลังรับคืน...' : 'ยืนยันรับเครื่องคืน'}
          </button>
        </div>
      </div>
    </div>
  );
}
