import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Search, Plus, X, UserCircle2 } from 'lucide-react';
import { customersApi } from '@/api/customers';
import { extractErrorMessage } from '@/api/client';
import type { Customer, CustomerRequest } from '@/types/api';

interface Props {
  onSelect: (c: Customer | null) => void;
  onClose: () => void;
}

export function CustomerPickerModal({ onSelect, onClose }: Props) {
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => customersApi.list({ q, size: 30 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <UserCircle2 className="h-5 w-5 text-brand-600" /> เลือกลูกค้า
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                className="input pl-9"
                placeholder="ค้นหาด้วย ชื่อ หรือ เบอร์โทร"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> เพิ่มลูกค้าใหม่
            </button>
          </div>

          {/* Walk-in option (no customer) */}
          <button
            onClick={() => { onSelect(null); onClose(); }}
            className="w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50">
            <span className="text-slate-600">👤 ลูกค้า Walk-in (ไม่ระบุ)</span>
          </button>

          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
            {isLoading && <p className="p-4 text-center text-sm text-slate-400">กำลังโหลด...</p>}
            {data && data.content.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-400">ไม่พบลูกค้า — กด "เพิ่มลูกค้าใหม่"</p>
            )}
            <ul className="divide-y divide-slate-100">
              {data?.content.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => { onSelect(c); onClose(); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      📞 {c.phone ?? '-'} {c.email && `· ✉️ ${c.email}`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {showCreate && (
          <QuickCreateCustomer
            onCreated={(c) => { onSelect(c); onClose(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </div>
    </div>
  );
}

function QuickCreateCustomer({ onCreated, onCancel }: {
  onCreated: (c: Customer) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerRequest>();

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="border-b px-5 py-3">
          <h3 className="font-semibold">เพิ่มลูกค้าใหม่ (เร็ว)</h3>
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
          <div className="flex justify-end gap-2">
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
