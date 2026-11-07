import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CreditCard, Plus, Save, Info, History, Undo2 } from 'lucide-react';
import {
  firstHandInstallmentApi,
} from '@/api/firstHandInstallment';
import { productsApi } from '@/api/products';
import type { FirstHandInstallmentRow } from '@/types/api';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { buildTermTable, monthColumns, parseTermTable, type TermTable } from '@/lib/installmentTable';
import { AddMonthColumn, TermCellInput } from '@/components/products/InstallmentTermCells';
import { PriceHistoryModal } from '@/components/products/PriceHistoryModal';
import { RunningPromoBadge, promotionsFor, useRunningPromotions } from '@/components/promotions/RunningPromoBadge';
import { FirstHandBulkPanel } from '@/components/products/FirstHandBulkPanel';
import { FirstHandBulkConfirm, type BulkChange } from '@/components/products/FirstHandBulkConfirm';
import { applyBulkAdjust, draftFromRow, isChanged, rowRequest, type BulkAdjust, type RowDraft } from '@/lib/firstHandBulk';

/**
 * ตารางผ่อน "มือ 1" ต่อ รุ่น×ความจุ (FIX-138) — แก้ที่นี่ที่เดียว, เขียนลง SKU มือ 1 ทุกสีที่ตรง.
 * ต่างจากมือ 2: มือ 1 เก็บผ่อนที่ระดับ SKU (ProductVariant) ที่เว็บหน้าร้านอ่านอยู่แล้ว (ไม่มี preset แยก).
 * แถวมาจาก SKU มือ 1 ที่มีอยู่จริง (ไม่ต้องเพิ่มแถวเอง) · SKU สีใหม่ที่สร้างทีหลัง inherit ค่าผ่อนอัตโนมัติ.
 */



const rowKey = (r: FirstHandInstallmentRow) => `${r.productId}|${r.storage}`;

export function FirstHandInstallmentPage() {
  const qc = useQueryClient();
  const runningPromos = useRunningPromotions();   // FIX-217 ป้ายโปร
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
  const draftOf = (r: FirstHandInstallmentRow): RowDraft => drafts[rowKey(r)] ?? draftFromRow(r);
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
    const result = rowRequest(r, draftOf(r));
    if (!result.ok) { toast.error(result.error); return; }
    if (result.clears && !confirm(`ล้างค่าผ่อนของ ${r.productName} ${r.storage}GB ?`)) return;
    upsert.mutate(result.request);
  };

  // ─── แก้หลายแถวในคำสั่งเดียว (FIX-208) ────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (key: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(rowKey)));

  const applyToSelected = (adjust: BulkAdjust) => {
    const targets = rows.filter((r) => selected.has(rowKey(r)));
    setDrafts((cur) => {
      const next = { ...cur };
      for (const r of targets) next[rowKey(r)] = applyBulkAdjust(cur[rowKey(r)] ?? draftFromRow(r), adjust);
      return next;
    });
    toast.success(`ปรับตัวเลข ${targets.length} แถวแล้ว — ตรวจแถวสีเหลือง แล้วกด "บันทึกทั้งหมด"`);
  };

  const changedRows = rows.filter((r) => drafts[rowKey(r)]?.dirty && isChanged(r, drafts[rowKey(r)]));
  const [confirmChanges, setConfirmChanges] = useState<BulkChange[] | null>(null);
  const openSaveAll = () => {
    const changes: BulkChange[] = [];
    for (const r of changedRows) {
      const result = rowRequest(r, drafts[rowKey(r)]);
      if (!result.ok) { toast.error(result.error); return; }
      changes.push({ row: r, request: result.request, clears: result.clears });
    }
    if (changes.length === 0) { toast('ยังไม่มีแถวที่ตัวเลขเปลี่ยน'); return; }
    setConfirmChanges(changes);
  };
  const discardAll = () => {
    if (changedRows.length > 0 && !confirm(`ยกเลิกการแก้ไข ${changedRows.length} แถว?`)) return;
    setDrafts({});
  };

  const upsertAll = useMutation({
    mutationFn: firstHandInstallmentApi.upsertAll,
    onSuccess: (res, sent) => {
      toast.success(`บันทึก ${res.rows} รุ่น×ความจุแล้ว — มีผลกับ ${res.updated} SKU มือ 1 · เว็บหน้าร้านอัปเดต`);
      const savedKeys = new Set(sent.map((q) => `${q.productId}|${(q.storage ?? '').replace(/\D/g, '')}`));
      setDrafts((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !savedKeys.has(k))));
      setConfirmChanges(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['firsthand-installment'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // ─── เพิ่ม/ตั้งราคารุ่น (เหมือนมือ 2) — ใช้กับรุ่น×ความจุที่มี SKU มือ 1 อยู่แล้ว ───
  const [newProductId, setNewProductId] = useState('');
  const [newStorage, setNewStorage] = useState('');
  const [newDown, setNewDown] = useState('');
  const [newCash, setNewCash] = useState('');
  const [newMonthly, setNewMonthly] = useState<TermTable>({});
  const [history, setHistory] = useState<FirstHandInstallmentRow | null>(null);
  // คอลัมน์เดือนที่ผู้ใช้เพิ่มเอง (FIX-200) — รวมกับค่าเริ่มต้นและเดือนที่มีในข้อมูล
  const [extraMonths, setExtraMonths] = useState<number[]>([]);
  const MONTH_COLS = monthColumns([...rows.map((r) => draftOf(r).monthly), newMonthly], extraMonths);
  const addRow = () => {
    if (!newProductId) { toast.error('เลือกรุ่นก่อน'); return; }
    if (!newStorage.trim()) { toast.error('กรอกความจุ เช่น 128'); return; }
    if (newDown.trim() === '' || Number(newDown) < 0) { toast.error('กรอกเงินดาวน์'); return; }
    const terms = buildTermTable(newMonthly);
    if (terms === '[]') { toast.error('กรอกค่างวดอย่างน้อย 1 ช่อง'); return; }
    if (newCash.trim() !== '' && Number(newCash) <= 0) { toast.error('ราคาซื้อสดต้องมากกว่า 0'); return; }
    upsert.mutate(
      { productId: newProductId, storage: newStorage, downPayment: Number(newDown), installmentTerms: terms,
        cashPrice: newCash.trim() === '' ? null : Number(newCash) },
      { onSuccess: () => { setNewProductId(''); setNewStorage(''); setNewDown(''); setNewCash(''); setNewMonthly({}); } },
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
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ราคาซื้อสด (บาท)</label>
            <input type="number" min={0} className="input" placeholder="เว้น=คงเดิม" value={newCash}
                   title="ราคาขายเงินสดของ SKU มือ 1 ทุกสีในรุ่น×ความจุนี้ · เว้นว่าง = ไม่เปลี่ยน"
                   onChange={(e) => setNewCash(e.target.value)} />
          </div>
          <div className="w-28">
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ดาวน์หลัก (บาท)</label>
            <input type="number" min={0} className="input" placeholder="4590" value={newDown}
                   onChange={(e) => setNewDown(e.target.value)} />
          </div>
          {MONTH_COLS.map((m) => (
            <div key={m} className="w-24">
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">{m} เดือน</label>
              <TermCellInput cell={newMonthly[m]} rowDown={newDown}
                             onChange={(cell) => setNewMonthly((v) => ({ ...v, [m]: cell }))} />
            </div>
          ))}
          <AddMonthColumn existing={MONTH_COLS} onAdd={(m) => setExtraMonths((v) => [...v, m])} />
          <button type="button" onClick={addRow} disabled={upsert.isPending}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> เพิ่ม/ตั้งราคา
          </button>
        </div>
        <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
          <Info className="inline h-3.5 w-3.5 align-[-2px]" /> รุ่นมือ 1 จะโผล่ในตารางเองเมื่อมีสต็อก · ฟอร์มนี้ใช้ตั้ง/ทับราคาของรุ่น×ความจุที่มี SKU มือ 1 อยู่แล้ว
          (ถ้ายังไม่มีสต็อกจะแจ้งเตือน)
        </div>
      </div>

      <div className="card">
        {/* FIX-208: บันทึกหลายแถวในคำสั่งเดียว */}
        {changedRows.length > 0 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm">
            <span className="font-semibold text-amber-900">แก้ไขแล้ว {changedRows.length} แถว (ยังไม่บันทึก)</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={discardAll}>
                <Undo2 className="h-4 w-4" /> ยกเลิกการแก้ไข
              </button>
              <button type="button" className="btn-primary bg-emerald-600 hover:bg-emerald-700"
                      disabled={upsertAll.isPending} onClick={openSaveAll}>
                <Save className="h-4 w-4" /> บันทึกทั้งหมด ({changedRows.length})
              </button>
            </div>
          </div>
        )}
        <FirstHandBulkPanel selectedCount={selected.size} monthColumns={MONTH_COLS}
                            onApply={applyToSelected} onClearSelection={() => setSelected(new Set())} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                         aria-label="เลือกทุกแถว" title="เลือกทุกแถวเพื่อปรับราคาพร้อมกัน" />
                </th>
                <th className="px-5 py-2.5">รุ่น</th>
                <th className="px-5 py-2.5">ความจุ</th>
                <th className="px-3 py-2.5 text-center">SKU</th>
                <th className="px-5 py-2.5 text-right">ราคาซื้อสด</th>
                <th className="px-5 py-2.5 text-right">ดาวน์หลัก<div className="text-[10px] font-normal normal-case text-slate-400">ใช้เมื่องวดไม่ระบุ</div></th>
                {MONTH_COLS.map((m) => <th key={m} className="px-3 py-2.5 text-right">{m} เดือน<div className="text-[10px] font-normal normal-case text-slate-400">ค่างวด / ดาวน์</div></th>)}
                <th className="px-5 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={MONTH_COLS.length + 7} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {rows.map((r) => {
                const d = draftOf(r);
                return (
                  <tr key={rowKey(r)} className={d.dirty ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(rowKey(r))} onChange={() => toggleSelected(rowKey(r))}
                             aria-label={`เลือก ${r.productName} ${r.storage}GB`} />
                    </td>
                    <td className="px-5 py-2 font-medium">
                      {r.productName}
                      <RunningPromoBadge promos={promotionsFor(runningPromos, 'NEW', r.productId, r.storage)} />
                    </td>
                    <td className="px-5 py-2">{r.storage}GB</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-400">{r.variantCount}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} className="input w-28 text-right text-sm" placeholder="—"
                             title="ราคาซื้อสด (ราคาขายเงินสด) — บันทึกลง SKU มือ 1 ทุกสีของรุ่น×ความจุนี้"
                             value={d.cash} onChange={(e) => patchDraft(r, { cash: e.target.value })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} className="input w-28 text-right text-sm" placeholder="—"
                             value={d.down} onChange={(e) => patchDraft(r, { down: e.target.value })} />
                    </td>
                    {MONTH_COLS.map((m) => (
                      <td key={m} className="px-2 py-2 text-right">
                        <TermCellInput compact cell={d.monthly[m]} rowDown={d.down}
                                       onChange={(cell) => patchDraft(r, { monthly: { ...d.monthly, [m]: cell } })} />
                      </td>
                    ))}
                    <td className="px-5 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {d.dirty && (
                          <button type="button" onClick={() => saveRow(r)} disabled={upsert.isPending}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                            <Save className="h-3.5 w-3.5" /> บันทึก
                          </button>
                        )}
                        <button type="button" onClick={() => setHistory(r)} title="ดูประวัติราคาย้อนหลัง"
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={MONTH_COLS.length + 7} className="px-5 py-10 text-center text-slate-400">
                  ยังไม่มี SKU มือ 1 (condition = NEW) ในระบบ — เพิ่มสินค้ามือ 1 ก่อน
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            <Info className="inline h-3.5 w-3.5 align-[-2px]" /> แก้ตัวเลขในแถว → แถวเป็นสีเหลือง → กดบันทึกรายแถว หรือ "บันทึกทั้งหมด" · ติ๊กเลือกหลายแถวเพื่อปรับราคาซื้อสด/ดาวน์/ค่างวดพร้อมกัน · ช่องล่างของแต่ละเดือน = ดาวน์เฉพาะงวดนั้น (เว้น = ใช้ดาวน์หลัก) · ปุ่ม "เพิ่มเดือน" ยืดงวดได้ เช่น 24/36 · เว้นดาวน์+ค่างวดทั้งหมดแล้วบันทึก = ล้างค่าผ่อนของกลุ่มนั้น
            {rows[0].downPayment != null && (
              <> · ตัวอย่าง: {rows[0].productName} {rows[0].storage}GB ดาวน์ {formatTHB(rows[0].downPayment)}</>
            )}
          </div>
        )}
      </div>
      {confirmChanges && (
        <FirstHandBulkConfirm changes={confirmChanges} pending={upsertAll.isPending}
                              onClose={() => setConfirmChanges(null)}
                              onConfirm={() => upsertAll.mutate(confirmChanges.map((c) => c.request))} />
      )}
      {history && (
        <PriceHistoryModal productId={history.productId} productName={history.productName}
                           storage={history.storage} condition="NEW" onClose={() => setHistory(null)} />
      )}
    </div>
  );
}
