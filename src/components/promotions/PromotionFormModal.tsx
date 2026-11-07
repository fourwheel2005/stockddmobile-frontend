import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Eye, Save, X } from 'lucide-react';
import { promotionsApi, PROMOTIONS_QUERY_KEY, RUNNING_PROMOTIONS_QUERY_KEY } from '@/api/promotions';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDateTime } from '@/lib/format';
import {
  ADJUST_LABEL, ROUNDING_OPTIONS, buildPromotionRequest, emptyPromotionForm, formFromPromotion, monthsOfPlans,
  storageDigits, termDown, type PromotionForm,
} from '@/lib/promotions';
import type { PosInstallmentPlan, PromoAdjust, PromotionPreview, PromotionResponse } from '@/types/api';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';

const ADJUSTS: PromoAdjust[] = ['NONE', 'AMOUNT_OFF', 'PERCENT_OFF', 'SET'];

/**
 * สร้าง/แก้โปรโมชันราคา (FIX-217) — ราคาปกติในตารางไม่ถูกแก้ · พรีวิวคิดด้วยสูตรเดียวกับ POS/เว็บ (backend)
 * มือ 1: รุ่น × ความจุ × สี (ไม่เลือกสี = ทุกสี) · มือ 2: รุ่น × ความจุ × เครื่อง (ไม่เลือก = ทุกเครื่อง)
 */
export function PromotionFormModal({ editing, onClose }: { editing: PromotionResponse | null; onClose: () => void }) {
  useModalChrome(onClose);
  const qc = useQueryClient();
  const [form, setForm] = useState<PromotionForm>(() => (editing ? formFromPromotion(editing) : emptyPromotionForm()));
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const set = (patch: Partial<PromotionForm>) => { setForm((f) => ({ ...f, ...patch })); setPreview(null); };

  const { data: productPage } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 0, size: 500 }),
    staleTime: 60_000,
  });
  const products = useMemo(
    () => (productPage?.content ?? []).filter((p) => p.serialized && p.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [productPage]);

  const { data: product } = useQuery({
    queryKey: ['product', form.productId],
    queryFn: () => productsApi.get(form.productId),
    enabled: !!form.productId,
  });
  const { data: serialPage } = useQuery({
    queryKey: ['promotion-devices', form.productId],
    queryFn: () => inventoryApi.listSerials({ productId: form.productId, condition: 'SECOND_HAND', status: 'IN_STOCK', size: 200 }),
    enabled: !!form.productId && form.conditionGroup === 'SECOND_HAND',
  });

  const firstHandSkus = (product?.variants ?? []).filter((v) => v.active && v.condition !== 'SECOND_HAND');
  // ความจุเทียบด้วยตัวเลข (backend เก็บ storageDigits) · ป้ายใช้ข้อความเดิมของ SKU เช่น "1TB"
  const storageLabels = new Map<string, string>();
  for (const v of product?.variants ?? []) {
    const d = storageDigits(v.storage);
    if (d && !storageLabels.has(d)) storageLabels.set(d, v.storage!);
  }
  const storages = [...storageLabels.keys()];
  const inStorage = (s: string | null | undefined) => !form.storage || storageDigits(s) === form.storage;
  const colourChoices = firstHandSkus.filter((v) => inStorage(v.storage));
  // เครื่องที่ไม่ได้กรอกความจุ → backend ใช้ความจุของ SKU · ให้เลือกได้ แล้วพรีวิวยืนยันอีกที
  const deviceChoices = (serialPage?.content ?? []).filter((s) => !s.deviceStorage || inStorage(s.deviceStorage));

  const toggle = (key: 'variantIds' | 'serialIds', id: string) =>
    set({ [key]: form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id] });
  const toggleMonth = (m: number) =>
    set({ termMonths: form.termMonths.includes(m) ? form.termMonths.filter((x) => x !== m) : [...form.termMonths, m].sort((a, b) => a - b) });

  const touchesInstallment = form.downMode !== 'NONE' || form.monthlyMode !== 'NONE';
  const monthChoices = useMemo(() => {
    const fromPreview = preview ? monthsOfPlans(preview.rows.map((r) => r.originalPlans)) : [];
    return [...new Set([...fromPreview, ...form.termMonths, 3, 6, 10, 12, 18, 24])].sort((a, b) => a - b);
  }, [preview, form.termMonths]);

  const previewMut = useMutation({
    mutationFn: () => {
      const r = buildPromotionRequest(form);
      if (!r.ok) throw new Error(r.error);
      return promotionsApi.preview(r.request, editing?.id);
    },
    onSuccess: setPreview,
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const save = useMutation({
    mutationFn: () => {
      const r = buildPromotionRequest(form);
      if (!r.ok) throw new Error(r.error);
      return editing ? promotionsApi.update(editing.id, r.request) : promotionsApi.create(r.request);
    },
    onSuccess: (p) => {
      toast.success(`บันทึกโปร "${p.name}" แล้ว — POS และเว็บหน้าร้านใช้ราคาโปรตามช่วงเวลา`);
      qc.invalidateQueries({ queryKey: PROMOTIONS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RUNNING_PROMOTIONS_QUERY_KEY });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // portal ไป body — ไม่ให้ transform ของตัวห่อหน้า (animation) ทำให้ modal ยึดกรอบหน้าแทนทั้งจอ
  return createPortal(
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="my-6 w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">{editing ? `แก้โปร: ${editing.name}` : 'สร้างโปรโมชันราคา'}</h3>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">ชื่อโปร (โชว์บนป้าย POS/เว็บ)</span>
            <input className="input" maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })}
                   placeholder="เช่น โปร 11.11" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">หมายเหตุ (ภายใน)</span>
            <input className="input" maxLength={255} value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </label>

          <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
          <div className="text-sm">
            <span className="mb-1 block font-medium">ใช้กับ</span>
            <div className="flex gap-2">
              {(['NEW', 'SECOND_HAND'] as const).map((g) => (
                <button key={g} type="button" disabled={!!editing && editing.conditionGroup !== g}
                        onClick={() => set({ conditionGroup: g, variantIds: [], serialIds: [] })}
                        className={`flex-1 rounded-lg border px-3 py-2 font-medium shadow-sm disabled:opacity-40 ${form.conditionGroup === g ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300'}`}>
                  {g === 'NEW' ? 'มือ 1' : 'มือ 2'}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">รุ่น</span>
            <select className="input" value={form.productId}
                    onChange={(e) => set({ productId: e.target.value, storage: '', variantIds: [], serialIds: [] })}>
              <option value="">— เลือกรุ่น —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">ความจุ</span>
            <select className="input" value={form.storage} disabled={!form.productId}
                    onChange={(e) => set({ storage: e.target.value, variantIds: [], serialIds: [] })}>
              <option value="">ทุกความจุ</option>
              {storages.map((s) => <option key={s} value={s}>{storageLabels.get(s)}</option>)}
            </select>
          </label>
          </div>

          <div className="text-sm md:col-span-2">
            {form.conditionGroup === 'NEW' ? (
              <>
                <span className="mb-1 block font-medium">สี <span className="font-normal text-slate-500">(ไม่เลือก = ทุกสี)</span></span>
                <div className="flex flex-wrap gap-2">
                  {colourChoices.length === 0 && <span className="text-slate-400">{form.productId ? 'ไม่มี SKU มือ 1 ของความจุนี้' : 'เลือกรุ่นก่อน'}</span>}
                  {colourChoices.map((v) => (
                    <label key={v.id} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${form.variantIds.includes(v.id) ? 'border-brand-600 bg-brand-50' : 'border-slate-300'}`}>
                      <input type="checkbox" checked={form.variantIds.includes(v.id)} onChange={() => toggle('variantIds', v.id)} />
                      {v.color ?? '-'} {v.storage ?? ''} <span className="text-xs text-slate-500">{formatTHB(v.sellingPrice)}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="mb-1 block font-medium">เครื่อง <span className="font-normal text-slate-500">(ไม่เลือก = ทุกเครื่องพร้อมขายของรุ่น×ความจุนี้ รวมเครื่องที่รับเข้าทีหลัง)</span></span>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  {deviceChoices.length === 0 && <p className="px-3 py-2 text-slate-400">{form.productId ? 'ไม่มีเครื่องมือ 2 พร้อมขาย' : 'เลือกรุ่นก่อน'}</p>}
                  {deviceChoices.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 last:border-0 hover:bg-slate-50">
                      <input type="checkbox" checked={form.serialIds.includes(s.id)} onChange={() => toggle('serialIds', s.id)} />
                      <span className="font-mono text-xs">{s.stockCode ?? s.imei ?? s.serialNumber}</span>
                      <span>{[s.deviceColor, s.deviceStorage].filter(Boolean).join(' · ')}</span>
                      {s.batteryHealth != null && <span className="text-xs text-slate-500">แบต {s.batteryHealth}%</span>}
                      <span className="ml-auto text-xs text-slate-600">{formatTHB(s.sellingPrice)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 md:col-span-2 md:grid-cols-3">
            <EffectInput label="ราคาสด" mode={form.cashMode} value={form.cashValue}
                         onChange={(mode, value) => set({ cashMode: mode, cashValue: value })} />
            <EffectInput label="ดาวน์" mode={form.downMode} value={form.downValue}
                         onChange={(mode, value) => set({ downMode: mode, downValue: value })} />
            <EffectInput label="ค่างวด/เดือน" mode={form.monthlyMode} value={form.monthlyValue}
                         onChange={(mode, value) => set({ monthlyMode: mode, monthlyValue: value })} />
            {touchesInstallment && (
              <div className="text-sm md:col-span-3">
                <span className="mb-1 block font-medium">งวดที่ร่วมโปร <span className="font-normal text-slate-500">(ไม่เลือก = ทุกงวด · ดาวน์/ค่างวดของงวดอื่นคงเดิม)</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {monthChoices.map((m) => (
                    <button key={m} type="button" onClick={() => toggleMonth(m)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${form.termMonths.includes(m) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
                      {m} ด.
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm md:col-span-3">
              <span className="font-medium">ปัดเศษผลลัพธ์</span>
              <select className="input w-44" value={form.rounding} onChange={(e) => set({ rounding: Number(e.target.value) })}>
                {ROUNDING_OPTIONS.map((r) => <option key={r} value={r}>{r === 1 ? 'ไม่ปัด (1 บาท)' : `ปัดหลัก ${r}`}</option>)}
              </select>
              <span className="text-xs text-slate-500">ใช้กับราคาสด/ดาวน์/ค่างวดที่โปรปรับ · ไม่ต่ำกว่า 0</span>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">เริ่ม (เวลาไทย)</span>
            <input type="datetime-local" className="input" value={form.startAt} onChange={(e) => set({ startAt: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">จบ (เวลาไทย)</span>
            <input type="datetime-local" className="input" value={form.endAt} onChange={(e) => set({ endAt: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">ลำดับความสำคัญ</span>
            <input type="number" step={1} className="input" value={form.priority} onChange={(e) => set({ priority: e.target.value })} />
            <span className="mt-1 block text-xs text-slate-500">เครื่องเดียวติดหลายโปร → เลขมากชนะ (เท่ากัน = โปรที่เริ่มทีหลัง)</span>
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium">สถานะ</span>
            <label className="input flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              เปิดใช้งาน
            </label>
            <span className="mt-1 block text-xs text-slate-500">ปิด = ไม่ใช้โปรแม้อยู่ในช่วงเวลา (ราคาปกติ)</span>
          </div>
        </div>

        {preview && <PreviewTable preview={preview} group={form.conditionGroup} />}

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
            <Eye className="h-4 w-4" /> พรีวิวราคา
          </button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> บันทึก
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EffectInput({ label, mode, value, onChange }: {
  label: string; mode: PromoAdjust; value: string; onChange: (mode: PromoAdjust, value: string) => void;
}) {
  return (
    <div className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <div className="flex gap-1">
        <select className="input min-w-0 flex-1" value={mode} onChange={(e) => onChange(e.target.value as PromoAdjust, value)}>
          {ADJUSTS.map((a) => <option key={a} value={a}>{ADJUST_LABEL[a]}</option>)}
        </select>
        {/* ช่องค่าโชว์ตลอด (ปิดตอน "ไม่ปรับ") — 3 คอลัมน์กว้างเท่ากันไม่กระโดดตามโหมด */}
        <input type="number" min={0} className="input w-28 shrink-0 disabled:bg-slate-50" value={mode === 'NONE' ? '' : value}
               disabled={mode === 'NONE'} aria-label={`${label} ค่า`}
               placeholder={mode === 'NONE' ? '—' : mode === 'PERCENT_OFF' ? '%' : 'บาท'}
               onChange={(e) => onChange(mode, e.target.value)} />
      </div>
    </div>
  );
}

function PlanCell({ plans, compare }: { plans: PosInstallmentPlan[]; compare?: PosInstallmentPlan[] }) {
  if (!plans || plans.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="space-y-0.5">
      {plans.map((p, i) => (
        <div key={i} className="text-xs">
          {p.label && <span className="font-medium">{p.label}: </span>}
          {p.terms.map((t) => {
            const before = compare?.[i];
            const changed = before && (termDown(before, t.months) !== termDown(p, t.months)
              || before.terms.find((x) => x.months === t.months)?.monthly !== t.monthly);
            return (
              <span key={t.months} className={`mr-2 whitespace-nowrap ${changed ? 'font-semibold text-rose-600' : ''}`}>
                {t.months}ด. ดาวน์ {formatTHB(termDown(p, t.months))} · {formatTHB(t.monthly)}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PreviewTable({ preview, group }: { preview: PromotionPreview; group: 'NEW' | 'SECOND_HAND' }) {
  return (
    <div className="border-t px-5 py-4">
      <h4 className="mb-2 font-semibold">พรีวิว: ราคาปกติ → ราคาโปร ({preview.rows.length} {group === 'NEW' ? 'SKU' : 'เครื่อง'})</h4>
      {preview.conflicts.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          ช่วงเวลาทับกับโปร: {preview.conflicts.map((c) => `${c.name} (ลำดับ ${c.priority}, ${formatDateTime(c.startAt)} – ${formatDateTime(c.endAt)})`).join(' · ')}
          {' '}— เครื่องเดียวใช้ได้โปรเดียว (ลำดับมากชนะ แล้วโปรที่เริ่มทีหลัง)
        </div>
      )}
      {preview.rows.length === 0 ? (
        <p className="text-sm text-slate-500">ไม่มี{group === 'NEW' ? ' SKU' : 'เครื่อง'}ที่เข้าเงื่อนไข</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-2 py-1">{group === 'NEW' ? 'SKU' : 'เครื่อง'}</th><th className="px-2 py-1">ราคาสด</th><th className="px-2 py-1">ผ่อนปกติ</th><th className="px-2 py-1">ผ่อนช่วงโปร</th></tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.serialItemId ?? r.variantId ?? r.sku} className="border-b align-top">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{[r.color, r.storage].filter(Boolean).join(' · ') || r.sku}</div>
                    <div className="font-mono text-xs text-slate-500">{r.stockCode ?? r.sku}</div>
                    {r.overriddenBy && <div className="text-xs text-amber-700">ใช้โปร “{r.overriddenBy}” แทน (ลำดับสูงกว่า)</div>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {r.originalPrice !== r.promoPrice ? (
                      <><span className="text-slate-400 line-through">{formatTHB(r.originalPrice)}</span><br /><span className="font-semibold text-rose-600">{formatTHB(r.promoPrice)}</span></>
                    ) : formatTHB(r.originalPrice)}
                  </td>
                  <td className="px-2 py-1.5"><PlanCell plans={r.originalPlans} /></td>
                  <td className="px-2 py-1.5"><PlanCell plans={r.promoPlans} compare={r.originalPlans} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
