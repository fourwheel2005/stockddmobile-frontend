import { useMemo, useState } from 'react';
import { ArrowLeftRight, Banknote, Info, PackageOpen, Repeat, X } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { ReturnBatteryField, parseBattery } from '@/components/sales/ReturnBatteryField';
import {
  defaultRefund, defaultSelection, deviceLines, refundCap, remainingQty, returnFormError, selectionValue,
  singleSelectedDevice, type ReturnSelection,
} from '@/lib/pos/billRefund';
import type { RefundMethod, ReturnItemLine, SalesOrderResponse } from '@/types/api';

export interface ReturnItemsResult {
  lines: ReturnItemLine[];
  /** RETURN = เงินที่คืน · EXCHANGE = เครดิตที่ใช้หักบิลใหม่ */
  amount: number;
  refundMethod: RefundMethod;
  reason: string;
  batteryHealth?: number;
}

/**
 * รับคืนสินค้า / เปลี่ยนเครื่อง (FIX-230) — เลือกรายการที่ลูกค้าคืน (เครื่องทีละเครื่อง · อุปกรณ์ตามจำนวน)
 * แล้วกรอกเงินที่ตกลงคืน (RETURN) หรือเครดิตที่ใช้ซื้อเครื่องใหม่ (EXCHANGE — ไม่มีเงินออกเก๊ะ)
 * · บิลผ่อน: เลือกทุกเครื่องให้ก่อน คืนเงินเริ่มที่ 0 (ร้านเก็บงวดที่จ่ายแล้ว)
 */
export function ReturnItemsModal({ order, mode, preselectSerialId, onClose, onConfirm }: {
  order: SalesOrderResponse;
  mode: 'RETURN' | 'EXCHANGE';
  /** เปิดจากการสแกนเครื่อง → เลือกเครื่องนั้นให้ */
  preselectSerialId?: string | null;
  onClose: () => void;
  onConfirm: (result: ReturnItemsResult) => void;
}) {
  useModalChrome(onClose);
  const exchange = mode === 'EXCHANGE';
  const installment = order.paymentMethod === 'INSTALLMENT';
  const cap = refundCap(order);
  const [sel, setSel] = useState<ReturnSelection>(() => defaultSelection(order, preselectSerialId));
  const [amountText, setAmountText] = useState(() => String(defaultRefund(order, defaultSelection(order, preselectSerialId), mode)));
  const [amountTouched, setAmountTouched] = useState(false);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');
  const [reason, setReason] = useState('');
  const [batteryText, setBatteryText] = useState('');

  const changeSelection = (next: ReturnSelection) => {
    setSel(next);
    // ยอดเงินตามรายการที่เลือก จนกว่าพนักงานจะแก้ตัวเลขเอง
    if (!amountTouched) setAmountText(String(defaultRefund(order, next, mode)));
  };
  const toggle = (id: string, max: number) => {
    const next = { ...sel };
    if (next[id]) delete next[id]; else next[id] = max;
    changeSelection(next);
  };
  const setQty = (id: string, q: number) => changeSelection({ ...sel, [id]: q });

  const value = selectionValue(order, sel);
  const device = singleSelectedDevice(order.items, sel);
  const selectedDevices = deviceLines(order.items).filter((i) => (sel[i.id] ?? 0) > 0).length;
  const battery = parseBattery(batteryText);
  const error = useMemo(() => returnFormError(order, sel, amountText, reason), [order, sel, amountText, reason]);
  const amount = Number(amountText);
  const canConfirm = !error && !battery.error;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({
      lines: Object.entries(sel).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity })),
      amount,
      refundMethod,
      reason: reason.trim(),
      batteryHealth: device ? battery.value : undefined,
    });
  };

  const title = exchange ? 'เปลี่ยนเครื่อง — เลือกสิ่งที่ลูกค้าคืน'
    : installment && deviceLines(order.items).length > 0 ? 'รับเครื่องคืน (ผ่อนไม่ไหว)' : 'รับคืนสินค้า';

  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[4vh] backdrop-blur-sm animate-modal-fade-in">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
           className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            {exchange ? <Repeat className="h-5 w-5 text-brand-600" /> : <PackageOpen className="h-5 w-5 text-amber-600" />}
            {title} — {order.billNo}
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" aria-label="ปิด"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <Row label="ลูกค้า" value={order.customerName ?? 'Walk-in'} />
            <Row label="คืนเงินได้สูงสุด (เงินที่ลูกค้าจ่ายจริง)" value={formatTHB(cap)} strong />
            {(order.returnedAmount ?? 0) > 0 && <Row label="คืนไปแล้ว" value={formatTHB(order.returnedAmount ?? 0)} />}
            {(order.tradeInValue ?? 0) > 0 && <Row label="เครดิตเทิร์น (ไม่นับเป็นเงินคืน)" value={formatTHB(order.tradeInValue ?? 0)} />}
          </div>

          {/* ─── รายการที่ลูกค้าคืน ─── */}
          <div>
            <div className="mb-1.5 text-sm font-medium">ลูกค้าคืนอะไรบ้าง <span className="text-red-500">*</span></div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {order.items.map((it) => {
                const remaining = remainingQty(it);
                const returned = it.returnedQuantity ?? 0;
                const checked = (sel[it.id] ?? 0) > 0;
                const isDevice = !it.custom && !!(it.imei || it.serialNumber);
                return (
                  <li key={it.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${remaining === 0 ? 'bg-slate-50 text-slate-400' : ''}`}>
                    <input type="checkbox" className="h-4 w-4" disabled={remaining === 0} checked={checked}
                           aria-label={`คืน ${it.productName}`} onChange={() => toggle(it.id, remaining)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.productName}{it.custom ? ' (พิมพ์เอง)' : ''}</div>
                      <div className="text-xs text-slate-500">
                        {isDevice ? <span className="font-mono">{it.imei ?? it.serialNumber}</span> : `ขาย ${it.quantity} ชิ้น`}
                        {' '}· {formatTHB(it.sellPrice)}/ชิ้น
                        {returned > 0 && <span className="ml-1 font-semibold text-amber-700">· คืนแล้ว {returned}</span>}
                      </div>
                    </div>
                    {checked && !isDevice && remaining > 1 && (
                      <label className="flex items-center gap-1 text-xs">
                        จำนวน
                        <input type="number" min={1} max={remaining} className="input w-16 py-1 text-center"
                               value={sel[it.id]} aria-label={`จำนวนที่คืน ${it.productName}`}
                               onChange={(e) => setQty(it.id, Math.max(1, Math.min(remaining, Math.floor(Number(e.target.value) || 1))))} />
                        / {remaining}
                      </label>
                    )}
                    {remaining === 0 && <span className="text-xs">คืนครบแล้ว</span>}
                  </li>
                );
              })}
            </ul>
            {installment && !exchange && (
              <p className="mt-1 text-xs text-slate-500">
                <Info className="inline h-3.5 w-3.5 align-[-2px]" /> บิลผ่อน: เครื่องกลับครบ = ยกเลิกสัญญาผ่อน · อุปกรณ์เสริมที่จ่ายแล้วไม่ต้องดึงกลับ
              </p>
            )}
          </div>

          {/* ─── จำนวนเงิน ─── */}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="return-amount">
              {exchange ? 'เครดิตที่ใช้ซื้อเครื่องใหม่ (บาท)' : 'คืนเงินให้ลูกค้า (บาท)'} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Banknote className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
              <input id="return-amount" type="number" min={0} max={cap} step="0.01" className="input pl-9 tabular-nums"
                     value={amountText}
                     onChange={(e) => { setAmountTouched(true); setAmountText(e.target.value); }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ราคารายการที่เลือก {formatTHB(value)}
              <button type="button" className="ml-1 font-semibold text-brand-700 underline"
                      onClick={() => { setAmountTouched(true); setAmountText(String(Math.min(value, cap))); }}>
                ใช้ยอดนี้
              </button>
              {' '}· หักค่าเสื่อมได้ · ส่วนที่ไม่คืน = รายได้ร้าน
              {installment && !exchange && <> · ผ่อนไม่ไหว ปกติ <strong>0</strong> (ร้านเก็บงวดที่จ่ายแล้ว)</>}
            </p>
            {exchange && (
              <p className="mt-1 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs text-brand-800">
                <Repeat className="inline h-3.5 w-3.5 align-[-2px]" /> ไม่มีเงินออกจากเก๊ะ — ยอดนี้ไปหักบิลเครื่องใหม่ ลูกค้าจ่ายเพิ่มเฉพาะส่วนต่าง
                · ถ้าเครดิตมากกว่าเครื่องใหม่ ให้ลดเครดิตเท่าราคาเครื่องใหม่ แล้วคืนส่วนต่างด้วย "รับคืนสินค้า" ที่บิลเดิม
              </p>
            )}
          </div>

          {!exchange && amount > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium">คืนเงินให้ลูกค้าทางไหน</div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="วิธีคืนเงิน">
                <MethodButton active={refundMethod === 'CASH'} onClick={() => setRefundMethod('CASH')}
                              icon={<Banknote className="h-4 w-4" />} label="เงินสดจากเก๊ะ" />
                <MethodButton active={refundMethod === 'TRANSFER'} onClick={() => setRefundMethod('TRANSFER')}
                              icon={<ArrowLeftRight className="h-4 w-4" />} label="โอนคืนเข้าบัญชี" />
              </div>
            </div>
          )}

          <ReturnBatteryField device={device} deviceCount={selectedDevices} value={batteryText} onChange={setBatteryText} />

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="return-reason">เหตุผล <span className="text-red-500">*</span></label>
            <textarea id="return-reason" className="input" rows={2} maxLength={500} value={reason}
                      placeholder={exchange ? 'เช่น จอเสียภายใน 7 วัน เปลี่ยนเครื่องใหม่' : 'เช่น ลูกค้าคืนเครื่อง หักค่าเสื่อม 1,000'}
                      onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-xl border-t bg-slate-50/50 px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className={`btn-primary ${exchange ? '' : 'bg-amber-600 hover:bg-amber-700'}`} disabled={!canConfirm} onClick={confirm}>
            {exchange ? <Repeat className="h-4 w-4" /> : <PackageOpen className="h-4 w-4" />}
            {exchange ? 'ใช้เป็นเครดิตเปลี่ยนเครื่อง' : 'ยืนยันรับคืน'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

function MethodButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
              active ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
      {icon} {label}
    </button>
  );
}
