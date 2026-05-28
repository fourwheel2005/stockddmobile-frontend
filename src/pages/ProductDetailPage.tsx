import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, X, ArrowDownToLine } from 'lucide-react';
import { productsApi } from '@/api/products';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { formatTHB } from '@/lib/format';
import type { CreateVariantRequest } from '@/types/api';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showAddVariant, setShowAddVariant] = useState(false);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-slate-500">กำลังโหลด...</div>;
  if (!product) return <div className="text-slate-500">ไม่พบสินค้า</div>;

  return (
    <div className="space-y-6">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับไปรายการสินค้า
      </Link>

      <div className="card">
        <div className="card-body space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{product.name}</h1>
              <div className="mt-1 text-sm text-slate-500">
                {product.brand} {product.modelNumber && `· ${product.modelNumber}`} · {product.category.name}
              </div>
            </div>
            <div className="flex gap-2">
              {product.serialized && <span className="badge-blue">Serialized</span>}
              {product.active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
            </div>
          </div>
          {product.description && <p className="text-sm text-slate-700">{product.description}</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span>รุ่นย่อย / Variants ({product.variants.length})</span>
          <div className="flex gap-2">
            {canEdit && product.variants.length > 0 && (
              <Link to={`/inbound?product=${product.id}`} className="btn-secondary">
                <ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้า
              </Link>
            )}
            {canEdit && (
              <button className="btn-primary" onClick={() => setShowAddVariant(true)}>
                <Plus className="h-4 w-4" /> เพิ่ม Variant
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">SKU</th>
                <th className="px-5 py-2.5">Color</th>
                <th className="px-5 py-2.5">Storage</th>
                <th className="px-5 py-2.5">Network</th>
                <th className="px-5 py-2.5">Barcode</th>
                <th className="px-5 py-2.5 text-right">Cost</th>
                <th className="px-5 py-2.5 text-right">Selling</th>
                <th className="px-5 py-2.5 text-right">Reorder</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {product.variants.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-mono text-xs">{v.sku}</div>
                    <div className="mt-1"><BarcodeDisplay value={v.sku} height={24} width={1} fontSize={8} displayValue={false} /></div>
                  </td>
                  <td className="px-5 py-3">{v.color ?? '-'}</td>
                  <td className="px-5 py-3">{v.storage ?? '-'}</td>
                  <td className="px-5 py-3">{v.network ?? '-'}</td>
                  <td className="px-5 py-3 font-mono text-xs">{v.barcode ?? '-'}</td>
                  <td className="px-5 py-3 text-right">
                    {v.costPrice != null
                      ? formatTHB(v.costPrice)
                      : <span className="font-mono font-semibold tracking-wider text-slate-500"
                              title="รหัสต้นทุน (เฉพาะผู้จัดการเห็นตัวเลขจริง)">{v.costCode ?? '-'}</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{formatTHB(v.sellingPrice)}</td>
                  <td className="px-5 py-3 text-right">{v.reorderPoint}</td>
                  <td className="px-5 py-3 text-right">
                    {canEdit && (
                      <Link to={`/inbound?product=${product.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                            title="รับสินค้าเข้าสต็อกสำหรับรุ่นย่อยนี้">
                        <ArrowDownToLine className="h-3.5 w-3.5" /> รับเข้า
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {product.variants.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center">
                  <div className="mx-auto max-w-md space-y-2">
                    <div className="text-base font-medium text-slate-700">ยังไม่มีรุ่นย่อย (Variant)</div>
                    <p className="text-sm text-slate-500">
                      รุ่นนี้ <strong>ยังขายและรับเข้าสต็อกไม่ได้</strong> — ราคา บาร์โค้ด และสต็อก
                      จะอยู่ที่ระดับรุ่นย่อย ต้องเพิ่มอย่างน้อย 1 รุ่นย่อย (สี/ความจุ) ก่อน
                    </p>
                    {canEdit && (
                      <button className="btn-primary" onClick={() => setShowAddVariant(true)}>
                        <Plus className="h-4 w-4" /> เพิ่มรุ่นย่อยตอนนี้
                      </button>
                    )}
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddVariant && (
        <AddVariantModal productId={product.id} onClose={() => setShowAddVariant(false)} />
      )}
    </div>
  );
}

function AddVariantModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CreateVariantRequest>({
    defaultValues: { reorderPoint: 5, costPrice: 0, sellingPrice: 0 },
  });

  // Live profit calculation
  const cost = Number(watch('costPrice')) || 0;
  const sell = Number(watch('sellingPrice')) || 0;
  const profit = sell - cost;
  const margin = cost > 0 ? ((profit / cost) * 100) : 0;

  const create = useMutation({
    mutationFn: (req: CreateVariantRequest) => productsApi.addVariant(productId, req),
    onSuccess: () => {
      toast.success('เพิ่มรุ่นย่อยสำเร็จ');
      qc.invalidateQueries({ queryKey: ['product', productId] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">เพิ่มรุ่นย่อย (Variant)</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit((d) => {
          const blank = (s?: string) => (s && s.trim()) ? s.trim() : undefined;
          create.mutate({
            sku: d.sku.trim(),
            color: blank(d.color),
            storage: blank(d.storage),
            network: blank(d.network),
            barcode: blank(d.barcode),
            imageUrl: blank(d.imageUrl),
            costPrice: Number(d.costPrice),
            sellingPrice: Number(d.sellingPrice),
            reorderPoint: Number(d.reorderPoint),
          });
        })} className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">
              รหัสสินค้า / SKU <span className="text-red-500">*</span>
            </label>
            <input className="input" placeholder="เช่น IPH16PRO-DT-256-TH / -DS / -DN"
                   {...register('sku', { required: 'จำเป็น' })} />
            <p className="mt-1 text-xs text-slate-500">
              รหัสไม่ซ้ำกับ variant อื่น — แนะนำใช้รูปแบบ {`{รุ่น}-{สี}-{ความจุ}-{เครือข่าย}`}
            </p>
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              💡 <strong>ตัวอย่างคำต่อท้ายเครือข่าย/เวอร์ชัน:</strong>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                <span><strong>TH</strong> — เครื่องศูนย์ไทย</span>
                <span><strong>DS</strong> — Dual SIM (2 ซิมจริง)</span>
                <span><strong>DN</strong> — Demo / เครื่องโชว์</span>
                <span><strong>HK</strong> — เครื่องนอก ฮ่องกง</span>
                <span><strong>JP</strong> — เครื่องนอก ญี่ปุ่น</span>
                <span><strong>KH</strong> — เครื่องนอก กัมพูชา</span>
              </div>
            </div>
            {errors.sku && <p className="mt-1 text-xs text-red-600">{errors.sku.message}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">สี (Color)</label>
              <input className="input" placeholder="เช่น Desert Titanium" {...register('color')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">ความจุ (Storage)</label>
              <input className="input" placeholder="เช่น 256GB" {...register('storage')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">เครือข่าย (Network)</label>
              <input className="input" placeholder="เช่น TH / Intl" {...register('network')} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              บาร์โค้ด <span className="text-xs font-normal text-slate-500">(ถ้ามี — ส่วนใหญ่บนกล่องสินค้า)</span>
            </label>
            <input className="input" placeholder="เว้นว่างได้ถ้าไม่มี" {...register('barcode')} />
            <div className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              💡 <strong>ไม่มีเครื่องยิงบาร์โค้ด / กล่องไม่มีบาร์โค้ด?</strong> เว้นว่างได้
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li><strong>มือถือ (IMEI):</strong> ใช้เลข IMEI เป็นบาร์โค้ดในตัว — พิมพ์ Label จากเมนู “พิมพ์ Label” ได้เลย</li>
                <li><strong>อุปกรณ์เสริม:</strong> ที่ POS พิมพ์ <strong>SKU</strong> มือแทนการยิงได้ (ระบบค้นเจอทั้ง SKU และบาร์โค้ด)</li>
              </ul>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                ราคาทุน (Cost) <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.01" className="input" placeholder="35000"
                     {...register('costPrice', { required: 'จำเป็น', min: 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                ราคาขาย (Selling) <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.01" className="input" placeholder="39900"
                     {...register('sellingPrice', { required: 'จำเป็น', min: 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                จุดสั่งใหม่ <span className="text-xs font-normal text-slate-500">(แจ้งเตือน)</span>
              </label>
              <input type="number" className="input" placeholder="5" {...register('reorderPoint', { min: 0 })} />
            </div>
          </div>

          {/* Live profit calculation */}
          {cost > 0 && sell > 0 && (
            <div className={`rounded-md border px-3 py-2 text-sm ${
              profit > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : profit < 0 ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}>
              💰 กำไรคาดการณ์ต่อชิ้น: <strong>{profit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</strong>
              {profit > 0 && <> ({margin.toFixed(1)}% margin)</>}
              {profit < 0 && <> ⚠️ ราคาขายต่ำกว่าทุน!</>}
            </div>
          )}

          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
            💡 <strong>จุดสั่งใหม่ (Reorder Point):</strong> ถ้าสต็อกเหลือ ≤ จำนวนนี้ ระบบจะแจ้งเตือน Manager
            ตัวอย่าง: ตั้ง 3 = พอเหลือ 3 ชิ้น จะมี toast แดง "Low Stock"
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
