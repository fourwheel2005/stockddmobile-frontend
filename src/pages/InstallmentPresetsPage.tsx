import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CreditCard, Plus, Save, Trash2 } from 'lucide-react';
import {
  installmentPresetsApi, type InstallmentPresetResponse,
} from '@/api/installmentPresets';
import { productsApi } from '@/api/products';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';

/**
 * ตารางดาวน์/ผ่อน "มือ 2" ต่อ รุ่น×ความจุ (FIX-123) — แก้ที่นี่ที่เดียว
 * เครื่องมือ 2 ที่ "รับเข้าใหม่" และรุ่น+ความจุตรง จะได้ดาวน์/ค่างวดจากตารางนี้อัตโนมัติ
 * (พนักงานกรอกผ่อนรายเครื่องเองตอนรับเข้า = ค่าที่กรอกชนะ · เครื่องในสต๊อกเดิมไม่ถูกแก้ย้อน)
 */

const MONTH_COLS = [10, 12, 15, 18] as const;

/** JSON terms → map เดือน→ค่างวด (เฉพาะคอลัมน์มาตรฐาน) */
function parseTerms(json: string): Record<number, string> {
  try {
    const arr = JSON.parse(json) as { months?: number; monthly?: number }[];
    const out: Record<number, string> = {};
    for (const t of arr ?? []) {
      if (t.months != null && t.monthly != null) out[t.months] = String(t.monthly);
    }
    return out;
  } catch { return {}; }
}

/** ช่อง 4 คอลัมน์ → JSON terms (เว้นช่องไหน = ไม่มีงวดนั้น) */
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

export function InstallmentPresetsPage() {
  const qc = useQueryClient();
  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['installment-presets'],
    queryFn: installmentPresetsApi.list,
  });
  const { data: productPage } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 0, size: 500 }),
    staleTime: 60_000,
  });
  const phoneProducts = useMemo(
    () => (productPage?.content ?? []).filter((p) => p.serialized && p.active !== false),
    [productPage]);

  // draft ต่อแถว (แก้แล้วค่อยกดบันทึกทีละแถว — ชัดว่าแถวไหนยังไม่ได้เซฟ)
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const draftOf = (p: InstallmentPresetResponse): RowDraft =>
    drafts[p.id] ?? { down: String(p.downPayment), monthly: parseTerms(p.installmentTerms), dirty: false };
  const patchDraft = (p: InstallmentPresetResponse, patch: Partial<RowDraft>) =>
    setDrafts((d) => ({ ...d, [p.id]: { ...draftOf(p), ...patch, dirty: true } }));

  const upsert = useMutation({
    mutationFn: installmentPresetsApi.upsert,
    onSuccess: (row) => {
      toast.success(`บันทึก ${row.productName} ${row.storage}GB แล้ว — มีผลกับเครื่องที่รับเข้าหลังจากนี้`);
      setDrafts((d) => { const n = { ...d }; delete n[row.id]; return n; });
      qc.invalidateQueries({ queryKey: ['installment-presets'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => installmentPresetsApi.delete(id),
    onSuccess: () => {
      toast.success('ลบแถวแล้ว');
      qc.invalidateQueries({ queryKey: ['installment-presets'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const saveRow = (p: InstallmentPresetResponse) => {
    const d = draftOf(p);
    if (d.down.trim() === '' || Number(d.down) < 0) { toast.error('กรอกเงินดาวน์ให้ถูกต้อง'); return; }
    const terms = buildTerms(d.monthly);
    if (terms === '[]') { toast.error('กรอกค่างวดอย่างน้อย 1 ช่อง'); return; }
    upsert.mutate({
      productId: p.productId, storage: p.storage,
      downPayment: Number(d.down), installmentTerms: terms,
    });
  };

  // ─── เพิ่มแถวใหม่ ───
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
          <CreditCard className="h-6 w-6 text-brand-600" /> ตารางผ่อนมือ 2
        </h1>
        <p className="text-sm text-slate-500">
          ดาวน์/ค่างวดมาตรฐานต่อ รุ่น×ความจุ — เครื่องมือ 2 ที่<strong>รับเข้าใหม่</strong>และรุ่นตรง
          จะได้ราคาชุดนี้อัตโนมัติ · กรอกเองตอนรับเข้า = ค่าที่กรอกชนะ · เครื่องในสต๊อกเดิมไม่ถูกแก้ย้อน
        </p>
      </div>

      {/* เพิ่มแถวใหม่ */}
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
            <input type="number" min={0} className="input" placeholder="1490" value={newDown}
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
            <Plus className="h-4 w-4" /> เพิ่ม/ทับราคา
          </button>
        </div>
      </div>

      {/* ตาราง */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">รุ่น</th>
                <th className="px-5 py-2.5">ความจุ</th>
                <th className="px-5 py-2.5 text-right">ดาวน์</th>
                {MONTH_COLS.map((m) => <th key={m} className="px-3 py-2.5 text-right">{m} เดือน</th>)}
                <th className="px-5 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {presets.map((p) => {
                const d = draftOf(p);
                return (
                  <tr key={p.id} className={d.dirty ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-5 py-2 font-medium">{p.productName}</td>
                    <td className="px-5 py-2">{p.storage}GB</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} className="input w-28 text-right text-sm"
                             value={d.down} onChange={(e) => patchDraft(p, { down: e.target.value })} />
                    </td>
                    {MONTH_COLS.map((m) => (
                      <td key={m} className="px-2 py-2 text-right">
                        <input type="number" min={0} className="input w-24 text-right text-sm" placeholder="—"
                               value={d.monthly[m] ?? ''}
                               onChange={(e) => patchDraft(p, { monthly: { ...d.monthly, [m]: e.target.value } })} />
                      </td>
                    ))}
                    <td className="px-5 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {d.dirty && (
                          <button type="button" onClick={() => saveRow(p)} disabled={upsert.isPending}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                            <Save className="h-3.5 w-3.5" /> บันทึก
                          </button>
                        )}
                        <button type="button"
                                onClick={() => { if (confirm(`ลบราคา ${p.productName} ${p.storage}GB ?`)) del.mutate(p.id); }}
                                className="rounded-md p-1.5 text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && presets.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                  ยังไม่มีราคาในตาราง — เพิ่มแถวแรกด้านบน
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {presets.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            💡 ตัวอย่าง: {presets[0].productName} {presets[0].storage}GB ดาวน์ {formatTHB(presets[0].downPayment)} ·
            แก้ตัวเลขในแถว → แถวเป็นสีเหลือง → กดบันทึก
          </div>
        )}
      </div>
    </div>
  );
}
