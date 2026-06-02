import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Search, Plus, X, UserCircle2, UserPlus, Users } from 'lucide-react';
import { customersApi } from '@/api/customers';
import { extractErrorMessage } from '@/api/client';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { Customer, CustomerRequest } from '@/types/api';

interface Props {
  onSelect: (c: Customer | null) => void;
  onClose: () => void;
}

export function CustomerPickerModal({ onSelect, onClose }: Props) {
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useModalChrome(onClose);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => customersApi.list({ q, size: 30 }),
  });

  const list = data?.content ?? [];
  const total = data?.totalElements ?? 0;

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[10vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">

        {/* Header (sticky) */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <UserCircle2 className="h-5 w-5 text-brand-600" />
            เลือกลูกค้า
            {total > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {total} ราย
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิด"
            title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                className="input pl-9"
                placeholder="ค้นหาด้วย ชื่อ หรือ เบอร์โทร"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button className="btn-primary shrink-0" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-4 w-4" />
              เพิ่มลูกค้าใหม่
            </button>
          </div>

          {/* Walk-in option */}
          <button
            onClick={() => { onSelect(null); onClose(); }}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2.5 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50/40">
            <span className="text-base">👤</span>
            <span className="font-medium text-slate-700">ลูกค้า Walk-in</span>
            <span className="text-xs text-slate-500">(ไม่ระบุชื่อ — ใช้ได้สำหรับซื้อหน้าร้านสด)</span>
          </button>

          {/* List */}
          <div className="flex min-h-[20rem] flex-1 flex-col overflow-hidden rounded-md border border-slate-200">
            {isLoading && (
              <div className="flex flex-1 items-center justify-center p-8">
                <p className="text-sm text-slate-400">กำลังโหลด...</p>
              </div>
            )}

            {!isLoading && list.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <Users className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  {q ? `ไม่พบลูกค้าที่ตรงกับ "${q}"` : 'ยังไม่มีลูกค้าในระบบ'}
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-1 text-sm font-medium text-brand-600 hover:underline">
                  + เพิ่มลูกค้าใหม่
                </button>
              </div>
            )}

            {!isLoading && list.length > 0 && (
              <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => { onSelect(c); onClose(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-brand-50/60">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                        {c.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{c.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          📞 {c.phone ?? '-'}{c.email && ` · ✉️ ${c.email}`}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer (สั้นๆ บอกคีย์ลัด) */}
        <div className="flex shrink-0 items-center justify-between border-t bg-slate-50/50 px-5 py-2.5 text-xs text-slate-500 rounded-b-xl">
          <span>กด <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd> เพื่อปิด</span>
          <span>คลิกชื่อลูกค้าเพื่อเลือก</span>
        </div>
      </div>

      {showCreate && (
        <QuickCreateCustomer
          onCreated={(c) => { onSelect(c); onClose(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function QuickCreateCustomer({ onCreated, onCancel }: {
  onCreated: (c: Customer) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerRequest>();
  useModalChrome(onCancel);

  const create = useMutation({
    mutationFn: customersApi.create,
    onSuccess: (c) => {
      toast.success(`เพิ่ม ${c.name} แล้ว`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      onCreated(c);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div
      onClick={backdropCloseHandler(onCancel)}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Plus className="h-4 w-4 text-brand-600" /> เพิ่มลูกค้าใหม่
          </h3>
          <button onClick={onCancel} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อ-นามสกุล *</label>
            <input autoFocus className="input" {...register('name', { required: 'จำเป็น' })} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">เบอร์โทร</label>
            <input className="input" placeholder="08X-XXX-XXXX" {...register('phone')} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={onCancel}>ยกเลิก</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'กำลังบันทึก...' : 'บันทึก + เลือก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
