import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { categoriesApi, productsApi } from '@/api/products';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { formatDate } from '@/lib/format';
import type { CreateProductRequest } from '@/types/api';

export function ProductsPage() {
  const [page, setPage] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  const { data, isLoading } = useQuery({
    queryKey: ['products', { page }],
    queryFn: () => productsApi.list({ page, size: 20 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">สินค้า (Products)</h1>
          <p className="text-sm text-slate-500">จัดการสินค้าและรุ่นย่อย (Variants)</p>
        </div>
        {canEdit && (
          <Link to="/products/new" className="btn-primary">
            <Plus className="h-4 w-4" /> เพิ่มสินค้า (หน้าเดียว)
          </Link>
        )}
      </div>

      {/* ขั้นตอนการตั้งของเข้าระบบ — อธิบายให้พนักงานเข้าใจว่าทำไมต้อง 3 ขั้น */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <div className="mb-2 font-semibold">📦 ลำดับการนำสินค้าเข้าระบบ (ทำครั้งเดียวต่อรุ่น แล้วรับเข้าได้เรื่อย ๆ)</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <Step n={1} title="สร้างรุ่น (Product)" desc="เช่น iPhone 11 — รุ่นใหม่/รุ่น Pro สร้างแยกกัน" />
          <Arrow />
          <Step n={2} title="เพิ่มรุ่นย่อย (Variant)" desc="สี + ความจุ + ราคา + บาร์โค้ด (ตัวที่ขายได้จริง)" />
          <Arrow />
          <Step n={3} title="รับสินค้าเข้า (Inbound)" desc="บันทึกของจริงเข้าสต็อก / IMEI — ทำทุกล็อต" />
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">ชื่อสินค้า</th>
                <th className="px-5 py-2.5">ยี่ห้อ</th>
                <th className="px-5 py-2.5">รุ่น (Model)</th>
                <th className="px-5 py-2.5">หมวดหมู่</th>
                <th className="px-5 py-2.5">ประเภท</th>
                <th className="px-5 py-2.5">สถานะ</th>
                <th className="px-5 py-2.5">วันที่สร้าง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                  </td>
                  <td className="px-5 py-3">{p.brand}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.modelNumber ?? '-'}</td>
                  <td className="px-5 py-3">{p.categoryName}</td>
                  <td className="px-5 py-3">
                    {p.serialized
                      ? <span className="badge-blue" title="ต้องระบุ IMEI/SN ทุกเครื่อง">นับชิ้น (Serialized)</span>
                      : <span className="badge-slate" title="นับเป็นจำนวนรวม">นับจำนวน (Bulk)</span>}
                  </td>
                  <td className="px-5 py-3">
                    {p.active ? <span className="badge-green">ใช้งาน</span> : <span className="badge-red">ปิดใช้งาน</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">ยังไม่มีสินค้า</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
            <div>หน้า {data.page + 1} / {data.totalPages}</div>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              <button className="btn-secondary" disabled={data.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </div>
          </div>
        )}
      </div>

      {showModal && <CreateProductModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex-1 rounded-md bg-white px-3 py-2 ring-1 ring-blue-100">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{n}</span>
        <span className="font-medium">{title}</span>
      </div>
      <div className="mt-1 text-xs text-blue-700">{desc}</div>
    </div>
  );
}

function Arrow() {
  return <div className="hidden items-center justify-center text-blue-400 sm:flex">→</div>;
}

function CreateProductModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const { register, handleSubmit, formState: { errors } } = useForm<CreateProductRequest>({
    defaultValues: { brand: 'Apple', serialized: false },
  });

  const create = useMutation({
    mutationFn: (req: CreateProductRequest) => productsApi.create(req),
    onSuccess: () => {
      toast.success('สร้างสินค้าสำเร็จ');
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // flatten category tree
  const flatCategories = (categories ?? []).flatMap((c) => [
    { id: c.id, label: c.name },
    ...(c.children ?? []).map((sub) => ({ id: sub.id, label: `${c.name} / ${sub.name}` })),
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">เพิ่มสินค้าใหม่</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">หมวดหมู่ *</label>
            <select className="input" {...register('categoryId', { required: 'จำเป็น' })}>
              <option value="">เลือกหมวดหมู่</option>
              {flatCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อสินค้า *</label>
            <input className="input" {...register('name', { required: 'จำเป็น' })} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                แบรนด์ (Brand)
                <span className="ml-1 text-xs font-normal text-slate-500">— เลือก/พิมพ์เอง</span>
              </label>
              <input
                className="input"
                list="brand-suggestions"
                placeholder="Apple / Samsung / Xiaomi / OPPO / ..."
                {...register('brand')}
              />
              <datalist id="brand-suggestions">
                {/* Apple / iOS */}
                <option value="Apple" />
                {/* Android — top brands ที่ขายในไทย */}
                <option value="Samsung" />
                <option value="Xiaomi" />
                <option value="OPPO" />
                <option value="Vivo" />
                <option value="realme" />
                <option value="Huawei" />
                <option value="Honor" />
                <option value="OnePlus" />
                <option value="Google" />
                <option value="ASUS" />
                <option value="Nothing" />
                <option value="Infinix" />
                <option value="TECNO" />
                <option value="Sony" />
                <option value="Motorola" />
              </datalist>
              <p className="mt-1 text-xs text-slate-500">
                💡 รองรับทุกแบรนด์ — พิมพ์เพิ่มเองได้ถ้าไม่มีในรายการ
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">รุ่น (Model Number)</label>
              <input className="input" placeholder="เช่น A3293 / SM-S928B"
                     {...register('modelNumber')} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea className="input" rows={2} {...register('description')} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('serialized')} />
            สินค้านี้ต้อง track ทีละชิ้น (IMEI / Serial Number)
          </label>
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
