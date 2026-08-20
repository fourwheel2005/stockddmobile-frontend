import { useState } from 'react';
import { X, Undo2, Banknote, ArrowLeftRight } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { SalesOrderResponse } from '@/types/api';

interface Props {
  order: SalesOrderResponse;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
  creditNote?: boolean;
}

/**
 * V31 — Q3: ให้พนักงานเลือกวิธีคืนเงินสำหรับบิลที่จ่ายแบบผสม / โอน
 *
 *  - บิลที่จ่ายสด 100% → คืนสด เท่านั้น (UI lock — ไม่ confuse)
 *  - บิลที่จ่ายโอน 100% → คืนผ่านโอน (default)
 *  - บิลผสม → แสดงสัดส่วนเดิม + ให้เลือก override
 *
 *  หมายเหตุ: backend ใช้ cashAmount และรวม transfer/card/QR เป็น external refund audit
 *  ไม่ต้องส่งฟิลด์เพิ่ม — modal นี้ทำหน้าที่ "ยืนยันความเข้าใจ"
 *  ก่อนกด refund (UX confirm)
 */
export function RefundMethodModal({ order, onClose, onConfirm, loading, creditNote = false }: Props) {
  const [reason, setReason] = useState('');
  useModalChrome(onClose);

  const cash = order.cashAmount ?? 0;
  const transfer = order.transferAmount ?? 0;
  const card = order.cardAmount ?? 0;
  const qr = order.qrAmount ?? 0;
  const total = cash + transfer + card + qr;

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Undo2 className="h-5 w-5 text-amber-600" />
            {creditNote ? 'ออกใบลดหนี้และคืนเงิน' : 'คืนเงิน'} — {order.billNo}
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 p-5">
          {/* Breakdown of what was paid */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">
              ยอดที่จะคืน <span className="text-slate-400">({order.customerName ?? 'Walk-in'})</span>
            </div>
            <div className="space-y-1.5 text-sm">
              {cash > 0 && (
                <RefundLine
                  icon={<Banknote className="h-4 w-4 text-emerald-600" />}
                  label="คืนเป็นเงินสด" amount={cash}
                  hint="ออกจากเก๊ะปัจจุบัน" />
              )}
              {transfer > 0 && (
                <RefundLine
                  icon={<ArrowLeftRight className="h-4 w-4 text-sky-600" />}
                  label="คืนผ่านโอน" amount={transfer}
                  hint="โอนกลับเข้าบัญชีลูกค้าเอง — บันทึก audit เท่านั้น" />
              )}
              {card > 0 && (
                <RefundLine
                  icon={<span className="text-violet-600">💳</span>}
                  label="ยกเลิกบัตร" amount={card}
                  hint="ติดต่อธนาคารยกเลิก — ระบบบันทึก audit" />
              )}
              {qr > 0 && (
                <RefundLine
                  icon={<span className="text-orange-600">📱</span>}
                  label="คืนผ่าน QR" amount={qr}
                  hint="โอนกลับเข้าบัญชี/พร้อมเพย์ลูกค้า" />
              )}
              {total <= 0 && (
                <div className="text-center text-xs text-slate-400 py-2">
                  ไม่พบรายละเอียดการจ่าย — fallback คืนเป็นเงินสด
                  ({formatTHB(order.paidAmount)})
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold">
              <span>รวมที่คืน</span>
              <span className="tabular-nums">{formatTHB(total > 0 ? total : order.paidAmount)}</span>
            </div>
          </div>

          {/* Stock restore notice */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            📦 สินค้า {order.items.length} รายการจะถูกคืนกลับเข้าสต็อกอัตโนมัติ
          </div>

          {creditNote && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
              🧾 ระบบจะเก็บใบกำกับเดิมไว้ ออกเลขใบลดหนี้ใหม่ และลดมูลค่าทั้งบิลเป็น 0.00 บาท
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">เหตุผลคืนเงิน <span className="text-red-500">*</span></label>
            <textarea
              className="input"
              rows={3}
              placeholder="เช่น เครื่องเสียระหว่างประกัน, ลูกค้าเปลี่ยนใจ..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              autoFocus
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary bg-amber-600 hover:bg-amber-700"
            disabled={loading || reason.trim().length === 0}
            onClick={() => onConfirm(reason.trim())}>
            <Undo2 className="h-4 w-4" />
            {loading ? 'กำลังดำเนินการ...' : creditNote ? 'ออกใบลดหนี้และคืนเงิน' : 'ยืนยันคืนเงิน'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundLine({ icon, label, amount, hint }: {
  icon: React.ReactNode; label: string; amount: number; hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-white p-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">{icon}</span>
        <div>
          <div className="font-medium">{label}</div>
          {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
        </div>
      </div>
      <span className="font-bold tabular-nums">{formatTHB(amount)}</span>
    </div>
  );
}
