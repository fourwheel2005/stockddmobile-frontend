import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Pencil, X } from 'lucide-react';
import { purchaseSourcesApi, type PurchaseSourceResponse } from '@/api/purchaseSources';
import { extractErrorMessage } from '@/api/client';
import { PURCHASE_SOURCES_QUERY_KEY, PURCHASE_SOURCE_MAX_LENGTH } from '@/components/receive/PurchaseSourcePicker';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';

/**
 * ช่อง "แหล่งที่มา" ของมัดจำสั่งเครื่อง (FIX-215) — ไม่บังคับ · พิมพ์อิสระ + เลือกจากชื่อที่เคยพิมพ์
 * ชื่อใหม่ถูกจำเข้ารายการเองตอนบันทึกใบ (backend) · ปุ่มดินสอ = แก้ชื่อในรายการ (ทุก role)
 * ใช้รายการเดียวกับ "ซื้อมาจาก" ในหน้ารับเข้า
 */
export function SourceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [managing, setManaging] = useState(false);
  const { data: sources = [] } = useQuery({
    queryKey: PURCHASE_SOURCES_QUERY_KEY,
    queryFn: purchaseSourcesApi.list,
    staleTime: 5 * 60 * 1000,
  });
  return (
    <div className="flex gap-1">
      <input className="input" list="deposit-source-list" maxLength={PURCHASE_SOURCE_MAX_LENGTH}
             placeholder="ไม่บังคับ — พิมพ์ หรือเลือกที่เคยใช้" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="deposit-source-list">
        {sources.map((s) => <option key={s.id} value={s.name} />)}
      </datalist>
      <button type="button" onClick={() => setManaging(true)} title="แก้ชื่อในรายการแหล่งที่มา"
              className="shrink-0 rounded-lg border border-slate-300 px-2 text-slate-500 hover:bg-slate-100">
        <Pencil className="h-4 w-4" />
      </button>
      {managing && <SourceManagerModal sources={sources} onClose={() => setManaging(false)} />}
    </div>
  );
}

function SourceManagerModal({ sources, onClose }: { sources: PurchaseSourceResponse[]; onClose: () => void }) {
  useModalChrome(onClose);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: PURCHASE_SOURCES_QUERY_KEY });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => purchaseSourcesApi.rename(id, name),
    onSuccess: (s) => { toast.success(`แก้ชื่อเป็น "${s.name}" แล้ว`); setEditing(null); refresh(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const create = useMutation({
    mutationFn: (name: string) => purchaseSourcesApi.create(name),
    onSuccess: (s) => { toast.success(`เพิ่ม "${s.name}" แล้ว`); setNewName(''); refresh(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/70 p-4 pt-[8vh] backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">รายการแหล่งที่มา</h3>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 border-b px-5 py-3">
          <input className="input" placeholder="เพิ่มชื่อใหม่" maxLength={PURCHASE_SOURCE_MAX_LENGTH}
                 value={newName} onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) create.mutate(newName.trim()); }} />
          <button type="button" className="btn-primary" disabled={!newName.trim() || create.isPending}
                  onClick={() => create.mutate(newName.trim())}>เพิ่ม</button>
        </div>
        <div className="flex-1 divide-y overflow-y-auto">
          {sources.length === 0 && <div className="px-5 py-6 text-center text-sm text-slate-400">ยังไม่มีรายการ</div>}
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-5 py-2 text-sm">
              {editing?.id === s.id ? (
                <>
                  <input className="input flex-1" autoFocus maxLength={PURCHASE_SOURCE_MAX_LENGTH} value={editing.name}
                         onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && editing.name.trim()) rename.mutate({ id: s.id, name: editing.name.trim() });
                           if (e.key === 'Escape') setEditing(null);
                         }} />
                  <button type="button" className="rounded bg-emerald-600 p-1.5 text-white disabled:opacity-50"
                          disabled={!editing.name.trim() || rename.isPending}
                          onClick={() => rename.mutate({ id: s.id, name: editing.name.trim() })}><Check className="h-4 w-4" /></button>
                  <button type="button" className="rounded border p-1.5" onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1">{s.name}</span>
                  <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="แก้ชื่อ"
                          onClick={() => setEditing({ id: s.id, name: s.name })}><Pencil className="h-4 w-4" /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="border-t px-5 py-2 text-[11px] text-slate-500">แก้ชื่อแล้วใบ/ล็อตเก่ายังแสดงชื่อเดิม · ใช้รายการเดียวกับ "ซื้อมาจาก" หน้ารับเข้า</p>
      </div>
    </div>
  );
}
