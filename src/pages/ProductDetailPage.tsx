import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, X, ArrowDownToLine, Copy, PackageOpen, Pencil } from 'lucide-react';
import { productsApi, categoriesApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { ImageEditor } from '@/components/MultiImageUpload';
import { formatTHB } from '@/lib/format';
import type { CreateVariantRequest, VariantResponse, ProductDetail } from '@/types/api';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<VariantResponse | null>(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });

  /* คงเหลือต่อ SKU — ดึงจาก inventory เพื่อให้เห็นชัดว่ามีสต็อกหรือยัง
     (hooks ต้องอยู่ก่อน early return ตามกฎ React) */
  const variants = product?.variants ?? [];
  const stockQueries = useQueries({
    queries: variants.map((v) => ({
      queryKey: ['inventory', v.id],
      queryFn: () => inventoryApi.get(v.id),
      enabled: !!v.id,
    })),
  });
  const qtyByVariant = new Map<string, number>();
  stockQueries.forEach((q, i) => {
    if (q.data) qtyByVariant.set(variants[i].id, q.data.quantity);
  });
  const stockResolved = variants.length > 0 && stockQueries.every((q) => q.isSuccess || q.isError);
  const totalQty = [...qtyByVariant.values()].reduce((sum, n) => sum + n, 0);
  const hasNoStock = stockResolved && totalQty === 0;

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
              <h1 className="page-title">{product.name}</h1>
              <div className="mt-1 text-sm text-slate-500">
                {product.brand} {product.modelNumber && `· ${product.modelNumber}`} · {product.category.name}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {product.serialized && <span className="badge-blue">Serialized</span>}
              {product.active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
              {canEdit && (
                <button type="button" onClick={() => setEditingProduct(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        title="แก้ไขข้อมูลรุ่น (ชื่อ/ยี่ห้อ/หมายเลขรุ่น/หมวด)">
                  <Pencil className="h-3.5 w-3.5" /> แก้ไข
                </button>
              )}
            </div>
          </div>
          {product.description && <p className="text-sm text-slate-700">{product.description}</p>}
        </div>
      </div>

      {/* แจ้งเตือนชัด: สร้างสินค้าแล้ว = แคตตาล็อก · ต้อง "รับสินค้าเข้า" ก่อนถึงมีของขาย */}
      {hasNoStock && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <PackageOpen className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold text-amber-900">ยังไม่มีสต็อกในระบบ — ขายไม่ได้</div>
              <p className="text-sm text-amber-800">
                สร้างสินค้าแล้วเป็นแค่ <strong>ข้อมูลรุ่น/ราคา</strong> · ต้องกด
                <strong> "รับสินค้าเข้า" </strong>เพื่อเพิ่มเครื่อง (IMEI) เข้าสต็อก ระบบถึงจะขายได้
              </p>
            </div>
          </div>
          {canEdit && (
            <Link to={`/products?q=${encodeURIComponent(product.name)}`}
                  className="btn-primary shrink-0 animate-pulse self-start sm:self-center">
              <ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้าเลย
            </Link>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-2">
          <span>สี / ความจุ ที่มี <span className="font-normal text-slate-500">({product.variants.length} SKU)</span></span>
          <div className="flex flex-wrap gap-2">
            {canEdit && product.variants.length > 0 && (
              <Link to={`/products?q=${encodeURIComponent(product.name)}`} className="btn-secondary"
                    title="เพิ่มสต็อกให้ SKU ที่มีอยู่">
                <ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้า
              </Link>
            )}
            {canEdit && product.variants.length > 0 && (
              <Link to={`/products/new?cloneProduct=${product.id}`}
                    className="btn-primary"
                    title="คัดลอกข้อมูลรุ่นนี้ → เปิดหน้าลงทะเบียนสินค้า แก้สี/ความจุ + ใส่ IMEI → สร้างสินค้าใหม่ 1 รายการ">
                <Copy className="h-4 w-4" /> คัดลอกสร้างสินค้าใหม่
              </Link>
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
                <th className="px-5 py-2.5 text-right">คงเหลือ</th>
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
                    {(() => {
                      const qty = qtyByVariant.get(v.id);
                      if (qty === undefined) return <span className="text-slate-400">{stockResolved ? '–' : '…'}</span>;
                      return qty > 0
                        ? <span className="font-semibold text-slate-800">{qty}</span>
                        : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">0 · ยังไม่รับเข้า</span>;
                    })()}
                  </td>
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
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditingVariant(v)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                              title="แก้ไข SKU นี้ (สี/ความจุ/ราคา/barcode)">
                          <Pencil className="h-3.5 w-3.5" /> แก้ไข
                        </button>
                        <Link to={`/products/new?cloneProduct=${product.id}&cloneFrom=${v.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                              title="คัดลอก SKU นี้ → สร้างสินค้าใหม่ที่มีข้อมูลเหมือนกัน (แก้ IMEI/สี/ความจุได้)">
                          <Copy className="h-3.5 w-3.5" /> คัดลอก
                        </Link>
                        <Link to={`/products?q=${encodeURIComponent(product.name)}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                              title="รับเครื่องเข้าสต็อกของ SKU นี้">
                          <ArrowDownToLine className="h-3.5 w-3.5" /> รับเข้า
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {product.variants.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-10 text-center">
                  <div className="mx-auto max-w-md space-y-2">
                    <div className="text-base font-medium text-slate-700">ยังไม่มี SKU สำหรับขาย</div>
                    <p className="text-sm text-slate-500">
                      รุ่นนี้ <strong>ยังขายและรับเข้าสต็อกไม่ได้</strong> — ราคา บาร์โค้ด และสต็อก
                      จะอยู่ที่ระดับ SKU (เช่น "iPhone 11 สีดำ 256GB" = 1 SKU)
                      <br />ต้องเพิ่มอย่างน้อย 1 สี/ความจุก่อน
                    </p>
                    {canEdit && (
                      <Link to={`/products/new?cloneProduct=${product.id}`} className="btn-primary inline-flex">
                        <Plus className="h-4 w-4" /> สร้างสินค้าใหม่จากรุ่นนี้
                      </Link>
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
      {editingVariant && (
        <AddVariantModal productId={product.id} editVariant={editingVariant}
                         onClose={() => setEditingVariant(null)} />
      )}
      {editingProduct && (
        <EditProductModal product={product} onClose={() => setEditingProduct(false)} />
      )}
    </div>
  );
}

function AddVariantModal({ productId, editVariant, onClose }: {
  productId: string; editVariant?: VariantResponse; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editVariant;
  // รูป variant (หลายรูป) — มือ 1 เว็บอ่านรูปจาก variant (FIX-046)
  const [variantImages, setVariantImages] = useState<string[]>(
    editVariant?.imageUrls?.length ? editVariant.imageUrls
      : (editVariant?.imageUrl ? [editVariant.imageUrl] : []));
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CreateVariantRequest>({
    defaultValues: isEdit ? {
      sku: editVariant!.sku,
      color: editVariant!.color ?? '', storage: editVariant!.storage ?? '',
      network: editVariant!.network ?? '', barcode: editVariant!.barcode ?? '',
      costPrice: editVariant!.costPrice ?? 0, sellingPrice: editVariant!.sellingPrice,
      reorderPoint: editVariant!.reorderPoint, imageUrl: editVariant!.imageUrl ?? '',
    } : { reorderPoint: 5, costPrice: 0, sellingPrice: 0 },
  });

  // Live profit calculation
  const cost = Number(watch('costPrice')) || 0;
  const sell = Number(watch('sellingPrice')) || 0;
  const profit = sell - cost;
  const margin = cost > 0 ? ((profit / cost) * 100) : 0;

  const create = useMutation({
    mutationFn: (req: CreateVariantRequest) => isEdit
      ? productsApi.updateVariant(productId, editVariant!.id, {
          color: req.color, storage: req.storage, network: req.network, barcode: req.barcode,
          imageUrl: variantImages[0], imageUrls: variantImages,
          costPrice: req.costPrice, sellingPrice: req.sellingPrice,
          reorderPoint: req.reorderPoint, active: editVariant!.active,
        })
      : productsApi.addVariant(productId, { ...req, imageUrl: variantImages[0], imageUrls: variantImages }),
    onSuccess: () => {
      toast.success(isEdit ? 'แก้ไขรุ่นย่อยสำเร็จ' : 'เพิ่มรุ่นย่อยสำเร็จ');
      qc.invalidateQueries({ queryKey: ['product', productId] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{isEdit ? 'แก้ไขรุ่นย่อย (Variant)' : 'เพิ่มรุ่นย่อย (Variant)'}</h2>
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
        })} className="flex-1 space-y-3 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">
              รหัสสินค้า / SKU <span className="text-red-500">*</span>
            </label>
            <input className={`input ${isEdit ? 'bg-slate-100 text-slate-500' : ''}`}
                   readOnly={isEdit} title={isEdit ? 'SKU แก้ไม่ได้ — ถ้าผิดมากให้คัดลอกสร้างใหม่' : ''}
                   placeholder="เช่น IPH16PRO-DT-256-TH / -DS / -DN"
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

          <div>
            <label className="mb-1 block text-sm font-medium">
              รูปสีนี้ <span className="text-xs font-normal text-slate-500">(หลายรูปได้ · รูปแรก = ปก · เว็บหน้าร้านมือ 1 ดึงจากตรงนี้)</span>
            </label>
            <ImageEditor value={variantImages} onChange={setVariantImages} />
          </div>

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

/* ─── แก้ไขข้อมูลรุ่น (Product) ──────────────────────────────────────── */
function EditProductModal({ product, onClose }: { product: ProductDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand);
  const [modelNumber, setModelNumber] = useState(product.modelNumber ?? '');
  const [categoryId, setCategoryId] = useState(product.category.id);
  const [active, setActive] = useState(product.active);

  const flatCats = (categories ?? []).flatMap((c) => [
    { id: c.id, label: c.name },
    ...(c.children ?? []).map((sub) => ({ id: sub.id, label: `${c.name} / ${sub.name}` })),
  ]);

  const save = useMutation({
    mutationFn: () => productsApi.update(product.id, {
      categoryId,
      name: name.trim(),
      brand: brand.trim() || undefined,
      modelNumber: modelNumber.trim() || undefined,
      description: product.description ?? undefined,
      serialized: product.serialized,
      active,
    }),
    onSuccess: () => {
      toast.success('แก้ไขข้อมูลรุ่นแล้ว');
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('ชื่อรุ่นห้ามว่าง'); return; }
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">แก้ไขข้อมูลรุ่น</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อรุ่น <span className="text-red-500">*</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">ยี่ห้อ</label>
              <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">หมายเลขรุ่น</label>
              <input className="input font-mono" value={modelNumber}
                     onChange={(e) => setModelNumber(e.target.value)} placeholder="เช่น A3293" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">หมวดหมู่</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {flatCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            เปิดใช้งาน (Active)
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
