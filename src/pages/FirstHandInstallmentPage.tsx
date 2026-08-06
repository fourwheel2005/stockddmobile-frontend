import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CreditCard, Plus, Save } from 'lucide-react';
import {
  firstHandInstallmentApi,
} from '@/api/firstHandInstallment';
import { productsApi } from '@/api/products';
import type { FirstHandInstallmentRow } from '@/types/api';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';

/**
 * ตารางผ่อน "มือ 1" ต่อ รุ่น×ความจุ (FIX-138) — แก้ที่นี่ที่เดียว, เขียนลง SKU มือ 1 ทุกสีที่ตรง.
 * ต่างจากมือ 2: มือ 1 เก็บผ่อนที่ระดับ SKU (ProductVariant) ที่เว็บหน้าร้านอ่านอยู่แล้ว (ไม่มี preset แยก).
 * แถวมาจาก SKU มือ 1 ที่มีอยู่จริง (ไม่ต้องเพิ่มแถวเอง) · SKU สีใหม่ที่สร้างทีหลัง inherit ค่าผ่อนอัตโนมัติ.
 */

const MONTH_COLS = [10, 12, 15, 18] as const;

function parseTerms(json: string | null): Record<number, string> {
  if (!json) return {};
  try {
    const arr = JSON.parse(json) as { months?: number; monthly?: number }[];
    const out: Record<number, string> = {};
    for (const t of arr ?? []) {
      if (t.months != null && t.monthly != null) out[t.months] = String(t.monthly);
    }
    return out;
  } catch { return {}; }
}

function buildTerms(vals: Record<number, string>): string {
  const arr = MONTH_COLS
    .filter((m) => (vals[m] ?? '').trim() !== '' && Number(vals[m]) > 0)
    .map((m) => ({ months: m, monthly: Number(vals[m]) }));
  return JSON.stringify(arr);
}

interface RowDraft {
  down: string;
  monthly: Record<number, string>;
  dirty: boolean;
}

const rowKey = (r: FirstHandInstallmentRow) => `${r.productId}|${r.storage}`;

export function FirstHandInstallmentPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['firsthand-installment'],
    queryFn: firstHandInstallmentApi.list,
  });

  // รายการรุ่น (โทรศัพท์/แท็บเล็ต serialized) สำหรับ dropdown เพิ่มรุ่น
  const { data: productPage } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 0, size: 500 }),
    staleTime: 60_000,
  });
  const phoneProducts = useMemo(
    () => (productPage?.content ?? []).filter((p) => p.serialized && p.active !== false),
    [productPage]);

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const draftOf = (r: FirstHandInstallmentRow): RowDraft =>
    drafts[rowKey(r)] ?? {
      down: r.downPayment != null ? String(r.downPayment) : '',
      monthly: parseTerms(r.installmentTerms),
      dirty: false,
    };
  const patchDraft = (r: FirstHandInstallmentRow, patch: Partial<RowDraft>) =>
    setDrafts((d) => ({ ...d, [rowKey(r)]: { ...draftOf(r), ...patch, dirty: true } }));

  const upsert = useMutation({
    mutationFn: firstHandInstallmentApi.upsert,
    onSuccess: (res, req) => {
      toast.success(`บันทึกแล้ว — มีผลกับ ${res.updated} SKU มือ 1 · เว็บหน้าร้านอัปเดต`);
      setDrafts((d) => {
        const n = { ...d };
        // key ของ draft = productId|storage(digits) — ตรงกับ req
        delete n[`${req.productId}|${(req.storage ?? '').replace(/\D/g, '')}`];
        return n;
      });
      qc.invalidateQueries({ queryKey: ['firsthand-installment'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const saveRow = (r: FirstHandInstallmentRow) => {
    const d = draftOf(r);
    const terms = buildTerms(d.monthly);
    const downEmpty = d.down.trim() === '';
    if (downEmpty && terms === '[]') {
      if (!confirm(`ล้างค่าผ่อนของ ${r.productName} ${r.storage}GB ?`)) return;
      upsert.mutate({ productId: r.productId, storage: r.storage, downPayment: null, installmentTerms: '[]' });
      return;
    }
    if (!downEmpty && Number(d.down) < 0) { toast.error('เงินดาวน์ต้องไม่ติดลบ'); return; }
    if (terms === '[]') { toast.error('กรอกค่างวดอย่างน้อย 1 ช่อง (หรือเว้นดาวน์ด้วยเพื่อล้าง)'); return; }
    upsert.mutate({
      productId: r.productId,
      storage: r.storage,
      downPayment: downEmpty ? null : Number(d.down),
      installmentTerms: terms,
    });
  };

  // ─── เพิ่ม/ตั้งราคารุ่น (เหมือนมือ 2) — ใช้กับรุ่น×ความจุที่มี SKU มือ 1 อยู่แล้ว ───
  const [newProductId, setNewProductId] = useState('');
  const [newStorage, setNewStorage] = useState('');
  const [newDown, setNewDown] = useState('');
  const [newMonthly, setNewMonthly] = useState<Record<number, string>>({});
  const addRow = () => {
    if (!newProductId) { toast.error('เลือกรุ่นก่อน'); return; }
    if (!newStorage.trim()) { toast.error('กรอกความจุ เช่น 128'); return; }
    if (newDown.trim() === '' || Number(newDown) < 0) { toast.error('กรอกเงินดาวน์'); return; }
    const terms = buildTerms(newMonthly);
    if (terms === '[]') { toast.error('กรอกค่างวดอย่างน้อย 1 ช่อง'); return; }
    upsert.mutate(
      { productId: newProductId, storage: newStorage, downPayment: Number(newDown), installmentTerms: terms },
      { onSuccess: () => { setNewProductId(''); setNewStorage(''); setNewDown(''); setNewMonthly({}); } },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-brand-600" /> ตารางผ่อนมือ 1
        </h1>
        <p className="text-sm text-slate-500">
          ดาวน์/ค่างวดต่อ รุ่น×ความจุ ของเครื่อง<strong>มือ 1</strong> — บันทึกแล้วมีผลกับ SKU มือ 1 ทุกสีที่ตรง
          และเว็บหน้าร้านทันที · SKU สีใหม่ที่สร้างทีหลังจะได้ค่าผ่อนนี้อัตโนมัติ ·
          <span className="text-amber-700">ตารางนี้ตั้งแผนมาตรฐาน 1 ชุด (ทับโปรโม/แผนหลายชั้นเดิมของ SKU)</span>
        </p>
      </div>

      {/* เพิ่ม/ตั้งราคารุ่น (เหมือนมือ 2) — ใช้กับรุ่น×ความจุที่มี SKU มือ 1 ในสต็อกแล้ว */}
      <div className="card">
        <div className="card-body flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">รุ่น</label>
            <select className="input" value={newProductId} onChange={(e) => setNewProductId(e.target.value)}>
              <option value="">— เลือกรุ่น —</option>
              {phoneProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="w-24">
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ความจุ</label>
            <input className="input" placeholder="128" value={newStorage}
                   onChange={(e) => setNewStorage(e.target.value)} />
          </div>
          <div className="w-28">
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ดาวน์ (บาท)</label>
            <input type="number" min={0} className="input" placeholder="4590" value={newDown}
                   onChange={(e) => setNewDown(e.target.value)} />
          </div>
          {MONTH_COLS.map((m) => (
            <div key={m} className="w-24">
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">{m} เดือน</label>
              <input type="number" min={0} className="input" placeholder="—" value={newMonthly[m] ?? ''}
                     onChange={(e) => setNewMonthly((v) => ({ ...v, [m]: e.target.value }))} />
            </div>
          ))}
          <button type="button" onClick={addRow} disabled={upsert.isPending}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> เพิ่ม/ตั้งราคา
          </button>
        </div>
        <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
          ℹ️ รุ่นมือ 1 จะโผล่ในตารางเองเมื่อมีสต็อก · ฟอร์มนี้ใช้ตั้ง/ทับราคาของรุ่น×ความจุที่มี SKU มือ 1 อยู่แล้ว
          (ถ้ายังไม่มีสต็อกจะแจ้งเตือน)
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">รุ่น</th>
                <th className="px-5 py-2.5">ความจุ</th>
                <th className="px-3 py-2.5 text-center">SKU</th>
                <th className="px-5 py-2.5 text-right">ดาวน์</th>
                {MONTH_COLS.map((m) => <th key={m} className="px-3 py-2.5 text-right">{m} เดือน</th>)}
                <th className="px-5 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {rows.map((r) => {
                const d = draftOf(r);
                return (
                  <tr key={rowKey(r)} className={d.dirty ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-5 py-2 font-medium">{r.productName}</td>
                    <td className="px-5 py-2">{r.storage}GB</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-400">{r.variantCount}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} className="input w-28 text-right text-sm" placeholder="—"
                             value={d.down} onChange={(e) => patchDraft(r, { down: e.target.value })} />
                    </td>
                    {MONTH_COLS.map((m) => (
                      <td key={m} className="px-2 py-2 text-right">
                        <input type="number" min={0} className="input w-24 text-right text-sm" placeholder="—"
                               value={d.monthly[m] ?? ''}
                               onChange={(e) => patchDraft(r, { monthly: { ...d.monthly, [m]: e.target.value } })} />
                      </td>
                    ))}
                    <td className="px-5 py-2 text-right">
                      {d.dirty && (
                        <button type="button" onClick={() => saveRow(r)} disabled={upsert.isPending}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                          <Save className="h-3.5 w-3.5" /> บันทึก
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                  ยังไม่มี SKU มือ 1 (condition = NEW) ในระบบ — เพิ่มสินค้ามือ 1 ก่อน
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            💡 แก้ตัวเลขในแถว → แถวเป็นสีเหลือง → กดบันทึก · เว้นดาวน์+ค่างวดทั้งหมดแล้วบันทึก = ล้างค่าผ่อนของกลุ่มนั้น
            {rows[0].downPayment != null && (
              <> · ตัวอย่าง: {rows[0].productName} {rows[0].storage}GB ดาวน์ {formatTHB(rows[0].downPayment)}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
