import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, Plus, Pencil, X, Info } from 'lucide-react';
import { branchesApi } from '@/api/branches';
import { extractErrorMessage } from '@/api/client';
import type { Branch, BranchRequest } from '@/types/api';

export function BranchesPage() {
  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => branchesApi.list(true),
  });
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 page-title">
          <Building2 className="h-6 w-6 text-brand-600" /> สาขา
        </h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> เพิ่มสาขา
        </button>
      </div>

      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <Info className="inline h-3.5 w-3.5 align-[-2px]" /> แต่ละสาขามีสต๊อกแยกกัน · เลือก "สาขาที่ทำงาน" ที่แถบซ้ายเพื่อรับของ/ดูสต๊อกของสาขานั้น ·
        สาขาเริ่มต้น <strong>MAIN</strong> คือที่เก็บของเดิมทั้งหมด
      </p>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400">กำลังโหลด…</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">รหัส</th>
                <th className="px-4 py-2">ชื่อสาขา</th>
                <th className="px-4 py-2">โทร</th>
                <th className="px-4 py-2">Printer ID</th>
                <th className="px-4 py-2">สถานะ</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(branches ?? []).map((b) => (
                <tr key={b.id} className={b.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2.5 font-mono font-semibold">{b.code}</td>
                  <td className="px-4 py-2.5">{b.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{b.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{b.defaultPrinterId ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {b.active
                      ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">ใช้งาน</span>
                      : <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">ปิด</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(b)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <BranchModal branch={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

function BranchModal({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!branch;
  const [form, setForm] = useState<BranchRequest>({
    code: branch?.code ?? '',
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
    defaultPrinterId: branch?.defaultPrinterId ?? '',
    active: branch?.active ?? true,
  });
  const patch = (p: Partial<BranchRequest>) => setForm((f) => ({ ...f, ...p }));

  const save = useMutation({
    mutationFn: () => isEdit
      ? branchesApi.update(branch!.id, form)
      : branchesApi.create(form),
    onSuccess: () => {
      toast.success(isEdit ? 'บันทึกสาขาแล้ว' : 'เพิ่มสาขาแล้ว');
      qc.invalidateQueries({ queryKey: ['branches'] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{isEdit ? 'แก้ไขสาขา' : 'เพิ่มสาขา'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">รหัสสาขา <span className="text-red-500">*</span></label>
            <input
              className={`input font-mono ${isEdit ? 'bg-slate-100 text-slate-500' : ''}`}
              readOnly={isEdit} placeholder="เช่น BR2"
              value={form.code}
              onChange={(e) => patch({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
            />
            {isEdit && <p className="mt-1 text-xs text-slate-500">รหัสแก้ไม่ได้หลังสร้าง</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อสาขา <span className="text-red-500">*</span></label>
            <input className="input" placeholder="เช่น สาขาเซ็นทรัล" value={form.name}
                   onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">โทร</label>
              <input className="input" value={form.phone ?? ''} onChange={(e) => patch({ phone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Printer ID (pull-agent)</label>
              <input className="input font-mono text-sm" placeholder="เช่น BRANCH2" value={form.defaultPrinterId ?? ''}
                     onChange={(e) => patch({ defaultPrinterId: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ที่อยู่</label>
            <input className="input" value={form.address ?? ''} onChange={(e) => patch({ address: e.target.value })} />
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active ?? true} onChange={(e) => patch({ active: e.target.checked })} />
              เปิดใช้งานสาขานี้
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={save.isPending || !form.code.trim() || !form.name.trim()}
                  onClick={() => save.mutate()}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
