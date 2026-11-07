import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bookmark, PackageCheck, PackagePlus, Search, Wallet, X, XCircle } from 'lucide-react';
import { deviceDepositsApi } from '@/api/deviceDeposits';
import { posApi } from '@/api/pos';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { imeiProblem } from '@/lib/imei';
import { depositRemaining } from '@/lib/pos/deposit';
import { ImeiInput } from '@/components/ImeiInput';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { useBranchStore } from '@/stores/branchStore';
import type {
  CartScanResponse, DepositMethod, DeviceDeposit, SerializedCondition, TradeInProductResponse,
} from '@/types/api';

/**
 * หน้าต่างของระบบจองเครื่อง / มัดจำสั่งเครื่อง (FIX-214) — ใช้ทั้งใน POS และหน้า "มัดจำ/จองเครื่อง"
 * เงินทุกก้อนเข้าเก๊ะของกะที่เปิดอยู่ (backend บังคับเปิดเก๊ะ)
 */

const METHODS: { value: DepositMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอน' },
  { value: 'CARD', label: 'บัตร' },
  { value: 'QR', label: 'QR' },
];

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

function useInvalidateDeposits() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['device-deposits'] });
    qc.invalidateQueries({ queryKey: ['cash-session'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };
}

function Shell({ title, icon, onClose, children, footer }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  useModalChrome(onClose);
  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div onClick={(e) => e.stopPropagation()}
           className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 rounded-b-xl border-t bg-slate-50/50 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function MethodPicker({ value, onChange, options = METHODS }: {
  value: DepositMethod; onChange: (m: DepositMethod) => void; options?: typeof METHODS;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((m) => (
        <button key={m.value} type="button" onClick={() => onChange(m.value)}
                className={`rounded-md border px-3 py-1.5 text-sm ${value === m.value
                  ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:border-slate-300'}`}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** สรุปเงิน: ราคาตกลง − มัดจำ = คงเหลือ */
function MoneySummary({ agreed, deposit }: { agreed: number; deposit: number }) {
  const ok = Number.isFinite(agreed) && Number.isFinite(deposit);
  return (
    <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex justify-between"><span>ราคาที่ตกลง</span><span className="font-semibold">{ok ? formatTHB(agreed) : '—'}</span></div>
      <div className="flex justify-between text-emerald-700"><span>มัดจำวันนี้</span><span>− {ok ? formatTHB(deposit) : '—'}</span></div>
      <div className="flex justify-between border-t border-amber-200 pt-1 font-bold text-amber-900">
        <span>คงเหลือที่ลูกค้าต้องจ่ายวันรับเครื่อง</span><span>{ok ? formatTHB(depositRemaining(agreed, deposit)) : '—'}</span>
      </div>
    </div>
  );
}

function amountError(agreed: number, amount: number): string | null {
  if (!(agreed > 0)) return 'กรอกราคาที่ตกลง';
  if (!(amount > 0)) return 'กรอกยอดมัดจำ';
  if (amount > agreed) return 'มัดจำเกินราคาที่ตกลง';
  return null;
}

// ─── จองเครื่อง (มีเครื่องในร้าน) ──────────────────────────────────────────

export function ReserveDeviceModal({ onClose, onDone }: { onClose: () => void; onDone?: (d: DeviceDeposit) => void }) {
  const invalidate = useInvalidateDeposits();
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<CartScanResponse | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [agreed, setAgreed] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DepositMethod>('CASH');
  const [note, setNote] = useState('');

  const find = useMutation({
    mutationFn: (q: string) => posApi.scan(q),
    onSuccess: (item) => {
      if (!item.serialized || !item.serialItemId) { toast.error('จองได้เฉพาะเครื่องรายเครื่อง (มี IMEI/Serial)'); return; }
      setDevice(item);
      setAgreed(String(item.sellPrice ?? ''));
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const error = !device ? 'สแกน/กรอก IMEI ของเครื่องที่จะจอง'
    : !customerName.trim() ? 'กรอกชื่อลูกค้า'
    : amountError(num(agreed), num(amount));

  const save = useMutation({
    mutationFn: () => deviceDepositsApi.reserve({
      serialItemId: device!.serialItemId!, customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined, agreedPrice: num(agreed), amount: num(amount), method,
      note: note.trim() || undefined,
    }),
    onSuccess: (d) => {
      toast.success(`จองเครื่องแล้ว ${d.depositNo} · มัดจำ ${formatTHB(d.balance)} · คงเหลือ ${formatTHB(d.remaining)}`);
      invalidate();
      onDone?.(d);
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <Shell title="จองเครื่อง (มีเครื่องในร้าน)" icon={<Bookmark className="h-5 w-5 text-sky-600" />} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!!error || save.isPending} title={error ?? undefined}
                     onClick={() => save.mutate()}>{save.isPending ? 'กำลังบันทึก...' : 'รับมัดจำ + จองเครื่อง'}</button>
           </>}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (query.trim()) find.mutate(query.trim()); }}>
        <input className="input flex-1 font-mono" autoFocus placeholder="ยิง/กรอก IMEI หรือ Serial ของเครื่อง"
               value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn-secondary" disabled={find.isPending}><Search className="h-4 w-4" /> หา</button>
      </form>
      {device && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
          <div className="font-semibold">{device.productName}</div>
          <div className="text-xs text-slate-600">{[device.color, device.storage].filter(Boolean).join(' / ')} · {device.sku}</div>
          <div className="font-mono text-xs">IMEI {device.imei ?? '-'} · SN {device.serialNumber ?? '-'}</div>
          <div className="text-xs text-slate-600">ราคาขายตอนนี้ {formatTHB(device.sellPrice)}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="ชื่อลูกค้า *"><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
        <Field label="เบอร์โทร"><input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></Field>
        <Field label="ราคาที่ตกลง *"><input type="number" min={0} className="input text-right" value={agreed} onChange={(e) => setAgreed(e.target.value)} /></Field>
        <Field label="มัดจำวันนี้ *"><input type="number" min={0} className="input text-right" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label="รับมัดจำเป็น"><MethodPicker value={method} onChange={setMethod} /></Field>
      <Field label="หมายเหตุ"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <MoneySummary agreed={num(agreed)} deposit={num(amount)} />
      <p className="text-[11px] text-slate-500">เครื่องจะเป็น "จองแล้ว" ทันที — ขายคนอื่น/สั่งผ่านเว็บไม่ได้ จนกว่าจะขายผ่านใบนี้หรือยกเลิก</p>
    </Shell>
  );
}

// ─── มัดจำสั่งเครื่อง (ยังไม่มีเครื่องในร้าน) ─────────────────────────────────

export function OrderDeviceModal({ onClose, onDone }: { onClose: () => void; onDone?: (d: DeviceDeposit) => void }) {
  const invalidate = useInvalidateDeposits();
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<TradeInProductResponse[]>([]);
  const [product, setProduct] = useState<TradeInProductResponse | null>(null);
  const [color, setColor] = useState('');
  const [storage, setStorage] = useState('');
  const [condition, setCondition] = useState<SerializedCondition>('NEW');
  const [imei, setImei] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [agreed, setAgreed] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DepositMethod>('CASH');
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const q = productQuery.trim();
    if (!q || product) { setProducts([]); return; }
    const t = setTimeout(() => {
      posApi.searchTradeInProducts(q, 0, 8).then((p) => setProducts(p.content)).catch(() => setProducts([]));
    }, 300);
    return () => clearTimeout(t);
  }, [productQuery, product]);

  const error = !product ? 'เลือกรุ่น'
    : !color.trim() ? 'กรอกสี'
    : !storage.trim() ? 'กรอกความจุ'
    : imeiProblem(imei)
    ?? (!customerName.trim() ? 'กรอกชื่อลูกค้า' : amountError(num(agreed), num(amount)));

  const save = useMutation({
    mutationFn: () => deviceDepositsApi.order({
      productId: product!.id, color: color.trim(), storage: storage.trim(), condition,
      imei: imei || undefined, serialNumber: serialNumber.trim() || undefined,
      customerName: customerName.trim(), customerPhone: customerPhone.trim() || undefined,
      agreedPrice: num(agreed), amount: num(amount), method,
      expectedDate: expectedDate || undefined, note: note.trim() || undefined,
      branchId: useBranchStore.getState().activeBranchId ?? undefined,
    }),
    onSuccess: (d) => {
      toast.success(`รับมัดจำสั่งเครื่องแล้ว ${d.depositNo} · มัดจำ ${formatTHB(d.balance)} · คงเหลือ ${formatTHB(d.remaining)}`);
      invalidate();
      onDone?.(d);
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <Shell title="มัดจำสั่งเครื่อง (ยังไม่มีในร้าน)" icon={<PackagePlus className="h-5 w-5 text-violet-600" />} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!!error || save.isPending} title={error ?? undefined}
                     onClick={() => save.mutate()}>{save.isPending ? 'กำลังบันทึก...' : 'รับมัดจำสั่งเครื่อง'}</button>
           </>}>
      <Field label="รุ่น *">
        {product ? (
          <div className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
            <span className="font-semibold">{product.name}</span>
            <button type="button" className="text-xs text-violet-700 hover:underline" onClick={() => { setProduct(null); setProductQuery(''); }}>เปลี่ยน</button>
          </div>
        ) : (
          <div className="relative">
            <input className="input" autoFocus placeholder="พิมพ์ชื่อรุ่น เช่น iPhone 17 Pro" value={productQuery}
                   onChange={(e) => setProductQuery(e.target.value)} />
            {products.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                {products.map((p) => (
                  <button key={p.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => { setProduct(p); setProducts([]); }}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="สี *"><input className="input" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        <Field label="ความจุ *"><input className="input" placeholder="256GB" value={storage} onChange={(e) => setStorage(e.target.value)} /></Field>
      </div>
      <Field label="สภาพ">
        <div className="flex gap-1.5">
          {(['NEW', 'SECOND_HAND'] as SerializedCondition[]).map((c) => (
            <button key={c} type="button" onClick={() => setCondition(c)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${condition === c ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200'}`}>
              {c === 'NEW' ? 'มือ 1' : 'มือ 2'}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="IMEI (ถ้ารู้แล้ว)" hint="ไม่รู้ตอนนี้ → กรอกตอนกด เครื่องถึงแล้ว">
          <ImeiInput value={imei} onChange={setImei} placeholder="ไม่บังคับ" />
        </Field>
        <Field label="Serial (ถ้ามี)"><input className="input font-mono" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="ชื่อลูกค้า *"><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
        <Field label="เบอร์โทร"><input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></Field>
        <Field label="ราคาที่ตกลง *"><input type="number" min={0} className="input text-right" value={agreed} onChange={(e) => setAgreed(e.target.value)} /></Field>
        <Field label="มัดจำวันนี้ *"><input type="number" min={0} className="input text-right" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="คาดว่าเครื่องถึง"><input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
      </div>
      <Field label="รับมัดจำเป็น"><MethodPicker value={method} onChange={setMethod} /></Field>
      <Field label="หมายเหตุ"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <MoneySummary agreed={num(agreed)} deposit={num(amount)} />
    </Shell>
  );
}

// ─── เครื่องถึงร้าน ──────────────────────────────────────────────────────

export function DepositArrivalModal({ deposit, onClose, onDone }: {
  deposit: DeviceDeposit; onClose: () => void; onDone?: (d: DeviceDeposit) => void;
}) {
  const invalidate = useInvalidateDeposits();
  const [imei, setImei] = useState(deposit.imei ?? '');
  const [serialNumber, setSerialNumber] = useState(deposit.serialNumber ?? '');
  const [cost, setCost] = useState('');
  const [color, setColor] = useState(deposit.deviceColor ?? '');
  const [storage, setStorage] = useState(deposit.deviceStorage ?? '');

  const error = imeiProblem(imei)
    ?? (!imei && !serialNumber.trim() ? 'กรอก IMEI (15 หลัก) หรือ Serial ของเครื่องที่ถึง' : null)
    ?? (!color.trim() || !storage.trim() ? 'กรอกสีและความจุ' : null);

  const save = useMutation({
    mutationFn: () => deviceDepositsApi.arrive(deposit.id, {
      imei: imei || undefined, serialNumber: serialNumber.trim() || undefined,
      purchasePrice: cost.trim() === '' ? undefined : Number(cost), color: color.trim(), storage: storage.trim(),
    }),
    onSuccess: (d) => {
      toast.success(`รับเครื่องเข้าสต็อกแล้ว (${d.stockCode ?? d.imei ?? ''}) — กันไว้ให้ ${d.customerName} · คงเหลือ ${formatTHB(d.remaining)}`);
      invalidate();
      onDone?.(d);
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <Shell title={`เครื่องถึงแล้ว — ${deposit.depositNo}`} icon={<PackageCheck className="h-5 w-5 text-emerald-600" />} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={!!error || save.isPending}
                     title={error ?? undefined} onClick={() => save.mutate()}>
               {save.isPending ? 'กำลังรับเข้า...' : 'รับเข้าสต็อก + กันไว้ให้ลูกค้า'}
             </button>
           </>}>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="font-semibold">{deposit.productName} · {deposit.condition === 'NEW' ? 'มือ 1' : 'มือ 2'}</div>
        <div className="text-xs text-slate-600">ลูกค้า {deposit.customerName} · มัดจำ {formatTHB(deposit.balance)} · คงเหลือ {formatTHB(deposit.remaining)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="IMEI *"><ImeiInput value={imei} onChange={setImei} autoFocus /></Field>
        <Field label="Serial" hint="เว้น = ใช้ IMEI"><input className="input font-mono" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></Field>
        <Field label="สี"><input className="input" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        <Field label="ความจุ"><input className="input" value={storage} onChange={(e) => setStorage(e.target.value)} /></Field>
        <Field label="ราคาทุน (บาท)"><input type="number" min={0} className="input text-right" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      </div>
      <p className="text-[11px] text-slate-500">เครื่องเข้าสต็อกเหมือนรับเครื่องเข้าปกติ (ใช้ SKU ที่ สี+ความจุ+มือ ตรงกัน ไม่มีระบบสร้างให้) แล้วเป็น "วางมัดจำแล้ว" รอขายให้ลูกค้าคนนี้</p>
    </Shell>
  );
}

// ─── รับมัดจำเพิ่ม ────────────────────────────────────────────────────────

export function DepositPaymentModal({ deposit, onClose }: { deposit: DeviceDeposit; onClose: () => void }) {
  const invalidate = useInvalidateDeposits();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DepositMethod>('CASH');
  const value = num(amount);
  const error = !(value > 0) ? 'กรอกยอดรับเพิ่ม' : value > deposit.remaining ? 'เกินยอดคงเหลือ' : null;
  const save = useMutation({
    mutationFn: () => deviceDepositsApi.addPayment(deposit.id, value, method),
    onSuccess: (d) => { toast.success(`รับเพิ่มแล้ว · มัดจำรวม ${formatTHB(d.balance)} · คงเหลือ ${formatTHB(d.remaining)}`); invalidate(); onClose(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  return (
    <Shell title={`รับมัดจำเพิ่ม — ${deposit.depositNo}`} icon={<Wallet className="h-5 w-5 text-emerald-600" />} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!!error || save.isPending} title={error ?? undefined} onClick={() => save.mutate()}>บันทึกรับเงิน</button>
           </>}>
      <div className="text-sm text-slate-600">มัดจำแล้ว {formatTHB(deposit.balance)} · คงเหลือ {formatTHB(deposit.remaining)}</div>
      <Field label="ยอดรับเพิ่ม"><input type="number" min={0} autoFocus className="input text-right" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="รับเป็น"><MethodPicker value={method} onChange={setMethod} /></Field>
    </Shell>
  );
}

// ─── ยกเลิก (คืน/ริบมัดจำ) ─────────────────────────────────────────────────

export function DepositCancelModal({ deposit, onClose }: { deposit: DeviceDeposit; onClose: () => void }) {
  const invalidate = useInvalidateDeposits();
  const [refund, setRefund] = useState(String(deposit.balance));
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const value = num(refund);
  const forfeited = Number.isFinite(value) ? Math.max(0, deposit.balance - value) : 0;
  const error = !(value >= 0) ? 'กรอกยอดคืน (0 = ไม่คืน)'
    : value > deposit.balance ? 'คืนเกินมัดจำที่รับไว้'
    : !code.trim() ? 'กรอกรหัสความปลอดภัยร้าน' : null;
  const save = useMutation({
    mutationFn: () => deviceDepositsApi.cancel(deposit.id, value, method, reason.trim(), code.trim()),
    onSuccess: () => {
      toast.success(`ยกเลิก ${deposit.depositNo} แล้ว · คืน ${formatTHB(value)}${forfeited > 0 ? ` · ริบ ${formatTHB(forfeited)}` : ''}`);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  return (
    <Shell title={`ยกเลิก — ${deposit.depositNo}`} icon={<XCircle className="h-5 w-5 text-rose-600" />} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ปิด</button>
             <button className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={!!error || save.isPending}
                     title={error ?? undefined} onClick={() => save.mutate()}>ยืนยันยกเลิก</button>
           </>}>
      <div className="text-sm text-slate-600">มัดจำที่รับไว้ {formatTHB(deposit.balance)} · {deposit.customerName}</div>
      <Field label="คืนเงินลูกค้า (บาท)" hint="0 = ไม่คืน (ร้านริบมัดจำ)">
        <input type="number" min={0} className="input text-right" value={refund} onChange={(e) => setRefund(e.target.value)} />
      </Field>
      {value > 0 && (
        <Field label="คืนเป็น">
          <MethodPicker value={method} onChange={(m) => setMethod(m as 'CASH' | 'TRANSFER')}
                        options={[{ value: 'CASH', label: 'เงินสด (ออกจากเก๊ะ)' }, { value: 'TRANSFER', label: 'โอนคืน' }]} />
        </Field>
      )}
      {forfeited > 0 && <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">ร้านริบมัดจำ {formatTHB(forfeited)}</div>}
      <Field label="เหตุผล"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label="รหัสความปลอดภัยร้าน *"><input type="password" className="input" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      {deposit.serialItemId && <p className="text-[11px] text-slate-500">เครื่องจะกลับเป็น "พร้อมขาย" ทันที</p>}
    </Shell>
  );
}
