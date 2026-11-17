import { useState } from 'react';
import { AlertTriangle, Ban, Banknote, Package, Receipt, X } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { SalesOrderResponse } from '@/types/api';
import { ReturnBatteryField, parseBattery } from '@/components/sales/ReturnBatteryField';
import { deviceLines } from '@/lib/pos/billRefund';

interface Props {
  order: SalesOrderResponse;
  onClose: () => void;
  /** batteryHealth: % แบตตอนรับคืน (undefined = ไม่แก้) — FIX-229 */
  onConfirm: (reason: string, batteryHealth?: number) => void;
  loading?: boolean;
  /** บิลที่ออกใบกำกับแล้ว → ยกเลิกด้วยใบลดหนี้ */
  creditNote?: boolean;
}

/**
 * ยกเลิกบิล (FIX-232 — แทน RefundMethodModal ของ FIX-194)
 * สินค้าทั้งบิลกลับเข้าสต็อก + ยอดขายบิลนี้ถูกตัด · <b>ไม่มีเงินออกจากเก๊ะทุกกรณี</b>
 * เงินที่ต้องคืนลูกค้า (ถ้ามี) ร้านทำนอกระบบ POS — ระบบไม่ถามวิธีคืนเงินอีกแล้ว
 */
export function CancelBillModal({ order, onClose, onConfirm, loading, creditNote = false }: Props) {
  const [reason, setReason] = useState('');
  const [batteryText, setBatteryText] = useState('');
  const battery = parseBattery(batteryText);
  // ยกเลิกทั้งบิล = เครื่องที่ลูกค้ายังถืออยู่ทั้งหมดกลับเข้าสต็อก
  const devices = deviceLines(order.items);
  useModalChrome(onClose);
  const title = creditNote ? 'ออกใบลดหนี้ (ยกเลิกบิล)' : 'ยกเลิกบิล';

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Ban className="h-5 w-5 text-red-600" />
            {title} — {order.billNo}
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="ปิด">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 p-5">
          <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
               role="note" aria-label="ไม่มีเงินออกจากเก๊ะ">
            <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">ไม่มีเงินออกจากเก๊ะ</div>
              <div className="text-xs text-emerald-800">
                ระบบตัดยอดขายบิลนี้ ({formatTHB(order.grandTotal)}) และคืนสินค้าเข้าสต็อกเท่านั้น
                · เงินที่ต้องคืนลูกค้า (ถ้ามี) ร้านทำนอกระบบ POS
              </div>
            </div>
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="note">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">ใช้กับบิลที่ขายผิด / ยกเลิกการขาย (ยอดขายถูกตัด)</div>
              ลูกค้า<strong>ขายคืนร้าน / ผ่อนไม่ไหวคืนเครื่อง</strong> ให้ใช้ "รับคืนสินค้า" แทน — ยอดขายเดิมยังอยู่
              และเครื่องเข้าสต็อกด้วยราคารับซื้อคืน
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
            <Package className="inline h-4 w-4 align-[-2px]" /> สินค้า {order.items.length} รายการจะถูกคืนกลับเข้าสต็อกอัตโนมัติ
          </div>

          <ReturnBatteryField device={devices.length === 1 ? devices[0] : null} deviceCount={devices.length}
                              value={batteryText} onChange={setBatteryText} />

          {creditNote && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
              <Receipt className="inline h-4 w-4 align-[-2px]" /> ระบบจะเก็บใบกำกับเดิมไว้ ออกเลขใบลดหนี้ใหม่ และลดมูลค่าทั้งบิลเป็น 0.00 บาท
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cancel-reason">
              เหตุผลยกเลิกบิล <span className="text-red-500">*</span>
            </label>
            <textarea
              id="cancel-reason"
              className="input"
              rows={3}
              placeholder="เช่น ขายผิดเครื่อง, คีย์บิลซ้ำ, ลูกค้ายกเลิกการซื้อ..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              autoFocus
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button className="btn-secondary" onClick={onClose}>ปิด</button>
          <button
            className="btn-primary bg-red-600 hover:bg-red-700"
            disabled={loading || reason.trim().length === 0 || !!battery.error}
            onClick={() => onConfirm(reason.trim(), battery.value)}>
            <Ban className="h-4 w-4" />
            {loading ? 'กำลังดำเนินการ...' : creditNote ? 'ออกใบลดหนี้' : 'ยืนยันยกเลิกบิล'}
          </button>
        </div>
      </div>
    </div>
  );
}
