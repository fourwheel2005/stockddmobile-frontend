import { useState } from 'react';
import { X, Undo2, Banknote, ArrowLeftRight, CreditCard, Package, Receipt, Smartphone } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { RefundMethod, SalesOrderResponse } from '@/types/api';

interface Props {
  order: SalesOrderResponse;
  onClose: () => void;
  onConfirm: (reason: string, refundMethod: RefundMethod) => void;
  loading?: boolean;
  creditNote?: boolean;
}

/**
 * V31 — Q3 / FIX-194: พนักงานเลือก "วิธีคืนเงินจริง" ได้เอง
 *
 *  - default = เงินสดถ้าบิลจ่ายสดทั้งบิล, ไม่งั้น = โอน (ตามช่องทางเดิม)
 *  - เลือก "เงินสด" → ทั้งยอดออกจากเก๊ะปัจจุบัน (ลดเงินที่ควรมี)
 *  - เลือก "โอนคืน" → ทั้งยอดเป็น audit ไม่แตะเงินสด — ใช้เมื่อโอนคืนบิลที่จ่ายสด
 *    (root cause A ของเก๊ะไม่ตรง: เดิมระบบหักเงินสดทั้งที่โอนคืนจริง)
 */
export function RefundMethodModal({ order, onClose, onConfirm, loading, creditNote = false }: Props) {
  const [reason, setReason] = useState('');
  useModalChrome(onClose);

  const cash = order.cashAmount ?? 0;
  const transfer = order.transferAmount ?? 0;
  const card = order.cardAmount ?? 0;
  const qr = order.qrAmount ?? 0;
  const total = cash + transfer + card + qr;
  const [refundMethod, setRefundMethod] = useState<RefundMethod>(defaultRefundMethod(order));
  const refundTotal = total > 0 ? total : order.paidAmount;

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
                  icon={<span className="text-violet-600"><CreditCard className="inline h-4 w-4 align-[-2px]" /></span>}
                  label="ยกเลิกบัตร" amount={card}
                  hint="ติดต่อธนาคารยกเลิก — ระบบบันทึก audit" />
              )}
              {qr > 0 && (
                <RefundLine
                  icon={<span className="text-orange-600"><Smartphone className="inline h-4 w-4 align-[-2px]" /></span>}
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

          {/* FIX-194: วิธีคืนเงินจริง — เก๊ะจะบันทึกตามที่เลือก ไม่ใช่ตามวิธีจ่ายเดิม */}
          <div>
            <div className="mb-1 text-sm font-medium">คืนเงินให้ลูกค้าทางไหน <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="วิธีคืนเงิน">
              <RefundMethodButton active={refundMethod === 'CASH'} onClick={() => setRefundMethod('CASH')}
                icon={<Banknote className="h-4 w-4" />} label="เงินสดจากเก๊ะ"
                hint={`เก๊ะลด ${formatTHB(refundTotal)}`} />
              <RefundMethodButton active={refundMethod === 'TRANSFER'} onClick={() => setRefundMethod('TRANSFER')}
                icon={<ArrowLeftRight className="h-4 w-4" />} label="โอนคืนเข้าบัญชีลูกค้า"
                hint="ไม่แตะเงินสดในเก๊ะ — บันทึก audit" />
            </div>
            {cash > 0 && refundMethod === 'TRANSFER' && (
              <p className="mt-1 text-[11px] text-amber-700">
                บิลนี้ลูกค้าจ่ายสด {formatTHB(cash)} — เลือกโอนคืนเมื่อโอนเงินกลับให้ลูกค้าจริงเท่านั้น เก๊ะจะไม่ถูกหัก
              </p>
            )}
          </div>

          {/* Stock restore notice */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <Package className="inline h-4 w-4 align-[-2px]" /> สินค้า {order.items.length} รายการจะถูกคืนกลับเข้าสต็อกอัตโนมัติ
          </div>

          {creditNote && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
              <Receipt className="inline h-4 w-4 align-[-2px]" /> ระบบจะเก็บใบกำกับเดิมไว้ ออกเลขใบลดหนี้ใหม่ และลดมูลค่าทั้งบิลเป็น 0.00 บาท
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
            onClick={() => onConfirm(reason.trim(), refundMethod)}>
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

/** เงินสดล้วน → คืนสด; มีโอน/บัตร/QR → โอนคืน (พนักงานเปลี่ยนได้) */
export function defaultRefundMethod(order: Pick<SalesOrderResponse, 'cashAmount' | 'transferAmount' | 'cardAmount' | 'qrAmount'>): RefundMethod {
  const external = (order.transferAmount ?? 0) + (order.cardAmount ?? 0) + (order.qrAmount ?? 0);
  return external > 0 ? 'TRANSFER' : 'CASH';
}

function RefundMethodButton({ active, onClick, icon, label, hint }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
        active ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
      <span className="flex items-center gap-2">{icon}{label}</span>
      <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{hint}</span>
    </button>
  );
}
