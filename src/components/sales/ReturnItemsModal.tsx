import { useMemo, useState } from 'react';
import { Banknote, Info, PackageOpen, Repeat, X } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { ReturnBatteryField, parseBattery } from '@/components/sales/ReturnBatteryField';
import {
  buybackRequired, defaultRefund, defaultSelection, deviceLines, exchangeCreditCap, parseBuyback, remainingQty,
  returnFormError, selectionValue, singleSelectedDevice, type BuybackInput, type ReturnSelection,
} from '@/lib/pos/billRefund';
import { ACQ_INFO } from '@/lib/acquisition';
import { useBranchStore } from '@/stores/branchStore';
import type { ReturnItemLine, ReturnItemsRequest, SalesOrderResponse } from '@/types/api';

type ReturnAcquisition = NonNullable<ReturnItemsRequest['acquisitionType']>;

export interface ReturnItemsResult {
  lines: ReturnItemLine[];
  /** RETURN = 0 เสมอ (FIX-231 ไม่มีเงินออกเก๊ะ) · EXCHANGE = เครดิตที่ใช้หักบิลใหม่ */
  amount: number;
  reason: string;
  batteryHealth?: number;
  /** FIX-232 (RETURN): ที่มาของเครื่องรอบใหม่ + สาขาที่รับคืนจริง */
  acquisitionType?: ReturnAcquisition;
  branchId?: string;
}

/**
 * รับคืนสินค้า / เปลี่ยนเครื่อง (FIX-230) — เลือกรายการที่ลูกค้าคืน (เครื่องทีละเครื่อง · อุปกรณ์ตามจำนวน)
 * · RETURN (FIX-231): ขายคืนร้าน/คืนเครื่อง = ตีของเข้าสต็อกอย่างเดียว ไม่มีเงินออกจากเก๊ะ
 *   (เงินที่ร้านจ่ายซื้อคืนทำนอกระบบ POS · ยอดขายบิลเดิมยังเป็นรายได้)
 * · EXCHANGE: กรอกเครดิตที่ใช้ซื้อเครื่องใหม่ (ไม่เกินราคาของที่คืน) — ไม่มีเงินออกเก๊ะเช่นกัน
 * · บิลผ่อน: เลือกทุกเครื่องให้ก่อน
 * · FIX-232 (RETURN): กรอก "ราคาที่ร้านรับซื้อคืน" ต่อเครื่อง = ทุนใหม่ (บังคับบิลขายสด · บิลผ่อนว่าง = ทุนเดิม)
 *   + ที่มา เครื่องคืน (มีเครดิต) / บอลลูนซื้อคืน · เครื่องเข้าสาขาที่เลือกอยู่
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
  const [sel, setSel] = useState<ReturnSelection>(() => defaultSelection(order, preselectSerialId));
  const [amountText, setAmountText] = useState(() => String(defaultRefund(order, defaultSelection(order, preselectSerialId), mode)));
  const [amountTouched, setAmountTouched] = useState(false);
  const [reason, setReason] = useState('');
  const [batteryText, setBatteryText] = useState('');
  const [buyback, setBuyback] = useState<BuybackInput>({});
  const [acquisition, setAcquisition] = useState<ReturnAcquisition>('RETURN_CREDIT');
  const activeBranchId = useBranchStore((st) => st.activeBranchId);
  const costRequired = buybackRequired(order);

  const changeSelection = (next: ReturnSelection) => {
    setSel(next);
    // เครดิตตามรายการที่เลือก จนกว่าพนักงานจะแก้ตัวเลขเอง
    if (!amountTouched) setAmountText(String(defaultRefund(order, next, mode)));
  };
  const toggle = (id: string, max: number) => {
    const next = { ...sel };
    if (next[id]) delete next[id]; else next[id] = max;
    changeSelection(next);
  };
  const setQty = (id: string, q: number) => changeSelection({ ...sel, [id]: q });

  const value = selectionValue(order, sel);
  const cap = exchangeCreditCap(order, sel);
  const device = singleSelectedDevice(order.items, sel);
  const selectedDevices = deviceLines(order.items).filter((i) => (sel[i.id] ?? 0) > 0).length;
  const battery = parseBattery(batteryText);
  const error = useMemo(() => returnFormError(order, sel, amountText, reason, mode, buyback),
    [order, sel, amountText, reason, mode, buyback]);
  const canConfirm = !error && !battery.error;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({
      lines: Object.entries(sel).filter(([, q]) => q > 0).map(([itemId, quantity]) => {
        const cost = exchange ? undefined : parseBuyback(buyback[itemId]);
        return cost !== undefined && !Number.isNaN(cost) ? { itemId, quantity, buybackCost: cost } : { itemId, quantity };
      }),
      amount: exchange ? Number(amountText) : 0,
      reason: reason.trim(),
      batteryHealth: device ? battery.value : undefined,
      ...(exchange ? {} : { acquisitionType: acquisition, branchId: activeBranchId ?? undefined }),
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
            <Row label="วิธีชำระบิลเดิม" value={order.paymentMethod ?? '-'} />
            <Row label="ยอดบิลเดิม" value={formatTHB(order.grandTotal)} />
          </div>

          {!exchange && (
            <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                 role="note" aria-label="ไม่มีเงินออกจากเก๊ะ">
              <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">ไม่มีเงินออกจากเก๊ะ — ระบบตีของเข้าสต็อกอย่างเดียว</div>
                <div className="text-xs text-emerald-800">
                  เงินที่ร้านจ่ายซื้อคืนลูกค้า (ถ้ามี) ทำนอกระบบ POS · ยอดขายบิลเดิมยังนับเป็นรายได้ร้าน
                  {installment && ' · บิลผ่อน: ร้านเก็บดาวน์/งวดที่จ่ายแล้ว'}
                </div>
              </div>
            </div>
          )}

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
                    {checked && isDevice && !exchange && (
                      <label className="flex shrink-0 flex-col items-end text-[11px] text-slate-600">
                        <span>ราคารับซื้อคืน{costRequired ? <span className="text-red-500"> *</span> : ''}</span>
                        <input inputMode="decimal" className="input w-32 py-1 text-right tabular-nums"
                               aria-label={`ราคารับซื้อคืน ${it.imei ?? it.serialNumber}`}
                               placeholder={costRequired ? 'ทุนใหม่' : 'ว่าง = ทุนเดิม'}
                               value={buyback[it.id] ?? ''}
                               onChange={(e) => setBuyback((b) => ({ ...b, [it.id]: e.target.value }))} />
                      </label>
                    )}
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
            {!exchange && selectedDevices > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-slate-500">
                  <Info className="inline h-3.5 w-3.5 align-[-2px]" /> ราคารับซื้อคืน = <strong>ทุนใหม่ของเครื่อง</strong>
                  ตอนขายรอบหน้า (ไม่ใช่เงินออกจากเก๊ะ){costRequired ? '' : ' · บิลผ่อนเว้นว่างได้ = ใช้ทุนเดิม ณ วันขาย'}
                </p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ที่มาของเครื่อง">
                  {(['RETURN_CREDIT', 'BALLOON_BUYBACK'] as const).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={acquisition === t}
                            onClick={() => setAcquisition(t)}
                            className={`rounded-md border px-3 py-1.5 text-left text-xs ${acquisition === t
                              ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                      {ACQ_INFO[t].th}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {installment && !exchange && (
              <p className="mt-1 text-xs text-slate-500">
                <Info className="inline h-3.5 w-3.5 align-[-2px]" /> บิลผ่อน: เครื่องกลับครบ = ยกเลิกสัญญาผ่อน · อุปกรณ์เสริมที่จ่ายแล้วไม่ต้องดึงกลับ
              </p>
            )}
          </div>

          {/* ─── เครดิตเปลี่ยนเครื่อง (รับคืนธรรมดาไม่มีช่องเงิน — FIX-231) ─── */}
          {exchange && (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="return-amount">
                เครดิตที่ใช้ซื้อเครื่องใหม่ (บาท) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Repeat className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
                <input id="return-amount" type="number" min={0} max={cap} step="0.01" className="input pl-9 tabular-nums"
                       value={amountText}
                       onChange={(e) => { setAmountTouched(true); setAmountText(e.target.value); }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                ราคารายการที่เลือก {formatTHB(value)} · ใช้ได้สูงสุด {formatTHB(cap)}
                <button type="button" className="ml-1 font-semibold text-brand-700 underline"
                        onClick={() => { setAmountTouched(true); setAmountText(String(cap)); }}>
                  ใช้ยอดนี้
                </button>
                {' '}· หักค่าเสื่อมได้ · ส่วนที่ไม่ให้เป็นเครดิต = รายได้ร้าน
              </p>
              <p className="mt-1 rounded-md border border-brand-200 bg-brand-50 p-2 text-xs text-brand-800">
                <Repeat className="inline h-3.5 w-3.5 align-[-2px]" /> ไม่มีเงินออกจากเก๊ะ — ยอดนี้ไปหักบิลเครื่องใหม่ ลูกค้าจ่ายเพิ่มเฉพาะส่วนต่าง
                · ถ้าเครดิตมากกว่าเครื่องใหม่ ให้ลดเครดิตเท่าราคาเครื่องใหม่ (ส่วนต่างที่ร้านจ่ายลูกค้า ทำนอกระบบ POS)
              </p>
            </div>
          )}

          <ReturnBatteryField device={device} deviceCount={selectedDevices} value={batteryText} onChange={setBatteryText} />

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="return-reason">เหตุผล <span className="text-red-500">*</span></label>
            <textarea id="return-reason" className="input" rows={2} maxLength={500} value={reason}
                      placeholder={exchange ? 'เช่น จอเสียภายใน 7 วัน เปลี่ยนเครื่องใหม่' : 'เช่น ลูกค้าขายคืนร้าน / ผ่อนไม่ไหวคืนเครื่อง'}
                      onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-xl border-t bg-slate-50/50 px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className={`btn-primary ${exchange ? '' : 'bg-amber-600 hover:bg-amber-700'}`} disabled={!canConfirm} onClick={confirm}>
            {exchange ? <Repeat className="h-4 w-4" /> : <PackageOpen className="h-4 w-4" />}
            {exchange ? 'ใช้เป็นเครดิตเปลี่ยนเครื่อง' : 'ยืนยันรับคืนเข้าสต็อก'}
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
