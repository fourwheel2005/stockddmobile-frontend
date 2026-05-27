import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Users, Search } from 'lucide-react';
import { customersApi } from '@/api/customers';
import { extractErrorMessage } from '@/api/client';
import type { CustomerRequest } from '@/types/api';

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => customersApi.list({ q, size: 50 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-brand-600" /> ลูกค้า (Customers)
          </h1>
          <p className="text-sm text-slate-500">จัดการข้อมูลลูกค้า</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" /> เพิ่มลูกค้า
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="ค้นหาด้วยชื่อ หรือเบอร์โทร"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">ชื่อ</th>
                <th className="px-5 py-2.5">เบอร์โทร</th>
                <th className="px-5 py-2.5">Email</th>
                <th className="px-5 py-2.5">ที่อยู่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 font-mono text-xs">{c.phone ?? '-'}</td>
                  <td className="px-5 py-3 text-xs">{c.email ?? '-'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{c.address ?? '-'}</td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">ยังไม่มีลูกค้า</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <CreateCustomerModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function CreateCustomerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerRequest>();

  const create = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      toast.success('เพิ่มลูกค้าสำเร็จ');
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">เพิ่มลูกค้าใหม่</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อ-นามสกุล *</label>
            <input className="input" {...register('name', { required: 'จำเป็น' })} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">เบอร์โทร</label>
              <input className="input" placeholder="08X-XXX-XXXX" {...register('phone')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input className="input" type="email" {...register('email')} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ที่อยู่</label>
            <textarea className="input" rows={2} {...register('address')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
            <input className="input" {...register('note')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
