import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, X, ArrowDownToLine, Copy, PackageOpen, Pencil, Trash2 } from 'lucide-react';
import { productsApi, categoriesApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { useBranchStore } from '@/stores/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { ImageEditor } from '@/components/MultiImageUpload';
import { SerialsModal } from '@/components/SerialsModal';
import { FastInboundModal } from '@/components/receive/FastInboundModal';
import { formatTHB } from '@/lib/format';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import {
  WARRANTY_NEW, WARRANTY_OPTIONS, COLOR_OPTIONS, STORAGE_OPTIONS, warrantyNeedsExpire,
} from '@/lib/deviceOptions';
import { InstallmentPlansEditor } from '@/components/products/InstallmentPlansEditor';
import { parsePlans, serializePlans, type InstallmentPlan } from '@/lib/installment';
import type {
  CreateVariantRequest, VariantResponse, ProductDetail, AcquisitionType, WizardInitialItem,
} from '@/types/api';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<VariantResponse | null>(null);
  const [serialsVariant, setSerialsVariant] = useState<VariantResponse | null>(null);
  const [receiveVariant, setReceiveVariant] = useState<VariantResponse | null>(null);  // รับเข้าในหน้านี้เลย (FIX-087)
  const [editingProduct, setEditingProduct] = useState(false);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const qc = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });

  // ลบ SKU (รุ่นย่อย) จากแถวได้เลย — force-confirm ถ้ามีเครื่องพร้อมขาย (FIX-078)
  const removeVariant = useMutation({
    mutationFn: ({ variantId, force }: { variantId: string; force: boolean }) =>
      productsApi.deactivateVariant(id!, variantId, force),
    onSuccess: () => {
      toast.success('ลบรุ่นย่อยแล้ว');
      qc.invalidateQueries({ queryKey: ['product', id] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
    },
  });
  const handleDeleteVariant = async (v: VariantResponse) => {
    const label = `${v.sku} (${[v.color, v.storage].filter(Boolean).join(' ')})`;
    if (!confirm(`ลบรุ่นย่อย ${label} ?`)) return;
    try {
      await removeVariant.mutateAsync({ variantId: v.id, force: false });
    } catch (e) {
      const msg = extractErrorMessage(e);
      if (/เครื่องพร้อมขาย|ลบพร้อมเครื่อง/i.test(msg)) {
        if (confirm(`${msg}\n\nลบรุ่นย่อยนี้ + เครื่องที่ใส่ผิด (เฉพาะที่ยังไม่เคยขาย) เลยไหม?`)) {
          try { await removeVariant.mutateAsync({ variantId: v.id, force: true }); }
          catch (e2) { toast.error(extractErrorMessage(e2)); }
        }
      } else { toast.error(msg); }
    }
  };

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
  const condByVariant = new Map<string, { newQ: number; sh: number }>();   // มือ1/มือ2 พร้อมขาย
  stockQueries.forEach((q, i) => {
    if (q.data) {
      qtyByVariant.set(variants[i].id, q.data.quantity);
      condByVariant.set(variants[i].id, { newQ: q.data.newInStock ?? 0, sh: q.data.secondHandInStock ?? 0 });
    }
  });
  const stockResolved = variants.length > 0 && stockQueries.every((q) => q.isSuccess || q.isError);
  const totalQty = [...qtyByVariant.values()].reduce((sum, n) => sum + n, 0);
  const hasNoStock = stockResolved && totalQty === 0;

  if (isLoading) return <div className="text-slate-500">กำลังโหลด...</div>;
  if (!product) return <div className="text-slate-500">ไม่พบสินค้า</div>;

  /* รับเข้าโดยไม่เด้งออกจากหน้า (FIX-087):
     0 SKU → เพิ่มสี/ความจุก่อน · 1 SKU → เปิด modal รับเข้าเลย · หลาย SKU → เลื่อนไปตารางให้เลือก */
  const handleReceive = () => {
    if (product.variants.length === 0) { setShowAddVariant(true); return; }
    if (product.variants.length === 1) { setReceiveVariant(product.variants[0]); return; }
    document.getElementById('sku-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('เลือกสีที่จะรับเข้า — กดปุ่ม 📥 ท้ายแถว', { icon: '👇', duration: 3000 });
  };
  const onReceiveDone = () => {
    qc.invalidateQueries({ queryKey: ['product', id] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['inventory-serials'] });
  };

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
            <button type="button" onClick={handleReceive}
                    className="btn-primary shrink-0 animate-pulse self-start sm:self-center">
              <ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้าเลย
            </button>
          )}
        </div>
      )}

      <div id="sku-table" className="card scroll-mt-4">
        <div className="card-header flex flex-wrap items-center justify-between gap-2">
          <span>สี / ความจุ ที่มี <span className="font-normal text-slate-500">({product.variants.length} SKU)</span></span>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              // เพิ่ม "สี/ความจุใหม่ + เครื่อง" เข้า "รุ่นนี้" (ไม่สร้าง product ซ้ำ) — เสร็จในหน้าเดียว
              <button type="button" onClick={() => setShowAddVariant(true)} className="btn-primary bg-emerald-600 hover:bg-emerald-700"
                      title="เพิ่มสี/ความจุใหม่ + ใส่ IMEI เข้ารุ่นนี้ เสร็จในหน้าเดียว">
                <Plus className="h-4 w-4" /> เพิ่มสี + เครื่อง
              </button>
            )}
            {canEdit && product.variants.length > 0 && (
              <button type="button" onClick={handleReceive} className="btn-secondary"
                      title="เพิ่มสต็อกให้ SKU/สีที่มีอยู่แล้ว — เปิดฟอร์มรับเข้าในหน้านี้เลย">
                <ArrowDownToLine className="h-4 w-4" /> รับเข้าสีเดิม
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
                      if (qty <= 0) return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">0 · ยังไม่รับเข้า</span>;
                      const c = condByVariant.get(v.id);
                      const badge = !c ? null
                        : c.newQ > 0 && c.sh === 0 ? <span className="badge-blue">มือ 1</span>
                        : c.sh > 0 && c.newQ === 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">มือ 2</span>
                        : c.newQ > 0 && c.sh > 0 ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">ผสม 1+2</span>
                        : null;
                      return (
                        <div className="flex items-center justify-end gap-1.5">
                          {badge}
                          <button type="button" onClick={() => setSerialsVariant(v)}
                                  className="font-semibold text-brand-700 underline decoration-dotted underline-offset-2 hover:text-brand-800"
                                  title="ดู/แก้ไขรายเครื่อง (IMEI/Serial/ที่มา/ราคา)">{qty}</button>
                        </div>
                      );
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
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setEditingVariant(v)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                              title="แก้ไข SKU นี้ (สี/ความจุ/ราคา/barcode)">
                          <Pencil className="h-3.5 w-3.5" /> แก้ไข
                        </button>
                        <button type="button" onClick={() => setSerialsVariant(v)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                              title="ดู/แก้ไขรายเครื่อง — IMEI/Serial/เลขรุ่น/แหล่งที่มา/ราคา/แบต/สภาพ">
                          <PackageOpen className="h-3.5 w-3.5" /> รายเครื่อง
                        </button>
                        {/* การกระทำรอง — icon-only กัน action column ล้น (hover เห็น tooltip) */}
                        <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
                        <Link to={`/products/new?cloneProduct=${product.id}&cloneFrom=${v.id}`}
                              className="rounded-md border border-slate-200 p-1.5 text-brand-700 hover:bg-brand-50"
                              title="คัดลอก SKU นี้ → สร้างสินค้าใหม่ที่มีข้อมูลเหมือนกัน (แก้ IMEI/สี/ความจุได้)">
                          <Copy className="h-3.5 w-3.5" />
                        </Link>
                        <button type="button" onClick={() => setReceiveVariant(v)}
                              className="rounded-md border border-slate-200 p-1.5 text-emerald-700 hover:bg-emerald-50"
                              title="รับเครื่องเข้าสต็อกของ SKU นี้ — เปิดฟอร์มรับเข้าเลย">
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteVariant(v)}
                              className="rounded-md border border-slate-200 p-1.5 text-red-600 hover:border-red-400 hover:bg-red-50"
                              title="ลบ SKU นี้ (มีเครื่องพร้อมขายจะถามก่อน)">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
                      // FIX-087: CTA ชี้ไป modal เพิ่มสี/ความจุ "เข้ารุ่นนี้" (เดิมพาไป clone เป็นรุ่นใหม่ — ผิดเป้า)
                      <button type="button" onClick={() => setShowAddVariant(true)} className="btn-primary inline-flex">
                        <Plus className="h-4 w-4" /> เพิ่มสี/ความจุ + เครื่อง เข้ารุ่นนี้
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
        <AddVariantModal productId={product.id} serialized={product.serialized}
                         productModelNumber={product.modelNumber ?? undefined}
                         onClose={() => setShowAddVariant(false)} />
      )}
      {editingVariant && (
        <AddVariantModal productId={product.id} serialized={product.serialized} editVariant={editingVariant}
                         onClose={() => setEditingVariant(null)} />
      )}
      {editingProduct && (
        <EditProductModal product={product} onClose={() => setEditingProduct(false)} />
      )}
      {serialsVariant && (
        <SerialsModal variantId={serialsVariant.id} productName={product.name} sku={serialsVariant.sku}
                      productVariants={product.variants}
                      onClose={() => setSerialsVariant(null)} />
      )}
      {/* รับเข้าในหน้านี้เลย — ไม่เด้งไปหน้าค้นหา (FIX-087) */}
      {receiveVariant && (
        <FastInboundModal variant={receiveVariant}
                          onClose={() => setReceiveVariant(null)}
                          onDone={onReceiveDone} />
      )}
    </div>
  );
}

/* ─── เครื่อง 1 ตัว (per-device) — ข้อมูลครบเท่าหน้ารับสต๊อก ─────────────── */
type PhoneDevice = {
  imei: string; serialNumber: string;
  condition: 'NEW' | 'SECOND_HAND'; batteryHealth: string;
  color: string; storage: string; modelNumber: string;
  warrantyTerms: string; warrantyExpire: string;
  acquisitionType: AcquisitionType; sourceCustomer: string;
  costPrice: string; sellingPrice: string;
  imageUrls: string[];
};
const emptyDevice = (): PhoneDevice => ({
  imei: '', serialNumber: '', condition: 'NEW', batteryHealth: '',
  color: '', storage: '', modelNumber: '', warrantyTerms: WARRANTY_NEW, warrantyExpire: '',
  acquisitionType: 'PURCHASE', sourceCustomer: '', costPrice: '', sellingPrice: '', imageUrls: [],
});
/** เครื่องใหม่ลอก สภาพ/สี/ความจุ/ที่มา/ราคา/ประกัน จากเครื่องล่าสุด (เคลียร์ IMEI/Serial/รูป) */
const cloneDevice = (last: PhoneDevice): PhoneDevice => ({
  ...emptyDevice(),
  condition: last.condition, color: last.color, storage: last.storage,
  acquisitionType: last.acquisitionType, costPrice: last.costPrice, sellingPrice: last.sellingPrice,
  warrantyTerms: last.warrantyTerms,
});

function DeviceCard({ idx, device, onChange, onRemove, disableRemove, colorList, modelList }: {
  idx: number; device: PhoneDevice; onChange: (patch: Partial<PhoneDevice>) => void;
  onRemove: () => void; disableRemove: boolean; colorList: string[]; modelList: string[];
}) {
  const isNew = device.condition === 'NEW';
  const needsExpire = warrantyNeedsExpire(device.warrantyTerms);
  /** เปลี่ยนสภาพ → auto ประกัน (มือ1=ศูนย์ Apple, มือ2=เว้น) เฉพาะตอนยังไม่แก้เอง */
  const setCondition = (c: 'NEW' | 'SECOND_HAND') => {
    const auto = c === 'NEW' ? WARRANTY_NEW : '';
    const cur = device.warrantyTerms;
    const untouched = cur === '' || cur === WARRANTY_NEW;
    onChange({ condition: c, ...(untouched ? { warrantyTerms: auto } : {}) });
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">เครื่องที่ {idx + 1}</span>
        {!disableRemove && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-red-500 hover:bg-red-50" title="ลบเครื่องนี้">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">IMEI (15 หลัก)</label>
          <input className="input font-mono text-sm" inputMode="numeric" maxLength={15}
                 placeholder="35xxxxxxxxxxxxx" value={device.imei}
                 onChange={(e) => onChange({ imei: e.target.value.replace(/\D/g, '').slice(0, 15) })} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">Serial (เว้น = ใช้ IMEI)</label>
          <input className="input text-sm" value={device.serialNumber}
                 onChange={(e) => onChange({ serialNumber: e.target.value })} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">สภาพ</label>
          <div className="flex items-center gap-3 pt-1.5 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={isNew} onChange={() => setCondition('NEW')} /> มือ 1
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={!isNew} onChange={() => setCondition('SECOND_HAND')} /> มือ 2
            </label>
          </div>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">แบต %</label>
          {isNew ? (
            <div className="rounded-md bg-emerald-50 px-2 py-2 text-sm text-emerald-700">🔋 100% (มือ 1)</div>
          ) : (
            <input type="number" min={0} max={100} className="input text-sm" placeholder="เช่น 89"
                   value={device.batteryHealth} onChange={(e) => onChange({ batteryHealth: e.target.value })} />
          )}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">สี</label>
          <input className="input text-sm" list={`dc-color-${idx}`} placeholder="เช่น Black"
                 value={device.color} onChange={(e) => onChange({ color: e.target.value })} />
          <datalist id={`dc-color-${idx}`}>{colorList.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ความจุ</label>
          <input className="input text-sm" list={`dc-storage-${idx}`} placeholder="เช่น 256GB"
                 value={device.storage} onChange={(e) => onChange({ storage: e.target.value })} />
          <datalist id={`dc-storage-${idx}`}>{STORAGE_OPTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">เลขรุ่น</label>
          <input className="input font-mono text-sm" list={`dc-model-${idx}`} placeholder="เช่น MG2N4ZP/A"
                 value={device.modelNumber} onChange={(e) => onChange({ modelNumber: e.target.value })} />
          <datalist id={`dc-model-${idx}`}>{modelList.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ที่มา</label>
          <select className="input text-sm" value={device.acquisitionType}
                  onChange={(e) => onChange({ acquisitionType: e.target.value as AcquisitionType })}>
            <optgroup label="ประเภทธุรกรรม">
              {ACQ_ORDER.filter((k) => ACQ_INFO[k].group === 'TXN').map((k) => (
                <option key={k} value={k}>{ACQ_INFO[k].th}</option>
              ))}
            </optgroup>
            <optgroup label="ซัพพลายเออร์">
              {ACQ_ORDER.filter((k) => ACQ_INFO[k].group === 'SUPPLIER').map((k) => (
                <option key={k} value={k}>{ACQ_INFO[k].th}</option>
              ))}
            </optgroup>
          </select>
        </div>
        {device.acquisitionType === 'RETURN_CREDIT' && (
          <div className="col-span-2">
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ชื่อลูกค้าที่คืนเครื่อง</label>
            <input className="input text-sm" placeholder="เช่น คุณสมชาย (เครื่องคืน มีเครดิต)"
                   value={device.sourceCustomer} onChange={(e) => onChange({ sourceCustomer: e.target.value })} />
          </div>
        )}
        <div className={needsExpire ? '' : 'col-span-2'}>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ประกัน</label>
          <input className="input text-sm" list={`dc-warranty-${idx}`} placeholder="เช่น ประกันร้าน 1 เดือน"
                 value={device.warrantyTerms} onChange={(e) => onChange({ warrantyTerms: e.target.value })} />
          <datalist id={`dc-warranty-${idx}`}>{WARRANTY_OPTIONS.map((w) => <option key={w} value={w} />)}</datalist>
        </div>
        {needsExpire && (
          <div>
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ประกันถึงวันที่</label>
            <input type="date" className="input text-sm" value={device.warrantyExpire}
                   onChange={(e) => onChange({ warrantyExpire: e.target.value })} />
          </div>
        )}
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ราคาทุน (บาท)</label>
          <input type="number" step="0.01" min={0} className="input text-sm" placeholder="เช่น 19500"
                 value={device.costPrice} onChange={(e) => onChange({ costPrice: e.target.value })} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-emerald-700">ราคาขาย (บาท)</label>
          <input type="number" step="0.01" min={0} className="input text-sm" placeholder="เช่น 22900"
                 value={device.sellingPrice} onChange={(e) => onChange({ sellingPrice: e.target.value })} />
        </div>
      </div>
      <div className="mt-2">
        <label className="mb-0.5 block text-xs font-semibold text-slate-600">รูปเครื่องนี้ (หลายรูปได้ · รูปแรก = ปก)</label>
        <ImageEditor value={device.imageUrls} onChange={(urls) => onChange({ imageUrls: urls })} />
      </div>
    </div>
  );
}

function AddVariantModal({ productId, serialized, productModelNumber, editVariant, onClose }: {
  productId: string; serialized?: boolean; productModelNumber?: string;
  editVariant?: VariantResponse; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editVariant;
  const addingPhone = !!serialized && !isEdit;   // เพิ่มสีใหม่ + เครื่อง (มือถือ) ในหน้าเดียว
  // รูป variant (หลายรูป) — มือ 1 เว็บอ่านรูปจาก variant (FIX-046)
  const [variantImages, setVariantImages] = useState<string[]>(
    editVariant?.imageUrls?.length ? editVariant.imageUrls
      : (editVariant?.imageUrl ? [editVariant.imageUrl] : []));
  // ผ่อนดาวน์ มือ 1 (ต่อรุ่น+ความจุ) — แผนหลายแบบ (ปุ่มเลือก) · เว็บหน้าร้านดึงไปแสดง
  // bridge: ถ้ายังไม่มี installmentPlans แต่มี field เก่า → แปลงเป็น 1 แผนให้อัตโนมัติ
  const [plans, setPlans] = useState<InstallmentPlan[]>(() => parsePlans(
    editVariant?.installmentPlans,
    {
      downPayment: editVariant?.downPayment,
      installmentTerms: editVariant?.installmentTerms,
      installmentPromo: editVariant?.installmentPromo,
    },
  ));
  // เพิ่มสีมือถือ: เครื่องรายตัว ข้อมูลครบเท่าหน้ารับสต๊อก (บางเครื่องต่างกันได้)
  const [devices, setDevices] = useState<PhoneDevice[]>([emptyDevice()]);
  const patchDevice = (i: number, patch: Partial<PhoneDevice>) =>
    setDevices((arr) => arr.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDevice = () => setDevices((arr) => [...arr, cloneDevice(arr[arr.length - 1] ?? emptyDevice())]);
  const removeDevice = (i: number) => setDevices((arr) => arr.filter((_, j) => j !== i));

  // suggestion เลขรุ่น/สี (DB distinct + ที่กำลังพิมพ์) — autocomplete เหมือนหน้าสต๊อก
  const { data: serialSuggest } = useQuery({
    queryKey: ['serial-suggestions'], queryFn: () => inventoryApi.serialSuggestions(),
    staleTime: 60 * 1000, enabled: addingPhone,
  });
  const colorList = Array.from(new Set([
    ...COLOR_OPTIONS, ...(serialSuggest?.colors ?? []), ...devices.map((d) => d.color.trim()).filter(Boolean),
  ])).sort();
  const modelList = Array.from(new Set([
    ...(serialSuggest?.modelNumbers ?? []), ...(productModelNumber ? [productModelNumber] : []),
    ...devices.map((d) => d.modelNumber.trim()).filter(Boolean),
  ])).sort();
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

  // รหัสเครื่อง running จาก base "DDxxxxx" + ลำดับ (เครื่องแรก = base = SKU ของ variant)
  const deviceCode = (base: string, idx: number) => {
    const m = (base || '').match(/^DD(\d+)$/);
    if (!m) return base ? (idx === 0 ? base : `${base}-${idx + 1}`) : '';
    return 'DD' + String(parseInt(m[1], 10) + idx).padStart(5, '0');
  };

  const create = useMutation({
    mutationFn: async (req: CreateVariantRequest) => {
      if (isEdit) {
        const inst = serializePlans(plans);   // แผนหลายแบบ + mirror แผนแรกลง field เก่า (back-compat)
        return productsApi.updateVariant(productId, editVariant!.id, {
          color: req.color, storage: req.storage, network: req.network, barcode: req.barcode,
          imageUrl: variantImages[0], imageUrls: variantImages,
          costPrice: req.costPrice, sellingPrice: req.sellingPrice,
          reorderPoint: req.reorderPoint, active: editVariant!.active,
          downPayment: inst.downPayment,
          installmentTerms: inst.installmentTerms,
          installmentPromo: inst.installmentPromo,
          installmentPlans: inst.installmentPlans,
        });
      }
      // เพิ่มสีมือถือ + เครื่องรายตัว → จัดกลุ่มเป็น variant ตามสเปกเว็บ DD
      // (1 variant = สภาพ × สี × ความจุ) แล้วเพิ่มเข้า product เดิมทีละกลุ่ม
      if (addingPhone) {
        const valid = devices.filter((d) => (d.imei || d.serialNumber).trim());
        if (valid.length === 0) throw new Error('ใส่อย่างน้อย 1 เครื่อง (IMEI หรือ Serial)');

        const { sku: base } = await productsApi.nextSku();   // running DD ไม่ซ้ำ (ไล่ทั้งชุด)
        const items: WizardInitialItem[] = valid.map((d, i) => ({
          serialNumber: (d.serialNumber || d.imei).trim(),
          imei: d.imei.trim() || undefined,
          stockCode: deviceCode(base, i),
          condition: d.condition,
          batteryHealth: d.condition === 'NEW' ? 100 : (d.batteryHealth === '' ? undefined : Number(d.batteryHealth)),
          deviceColor: d.color.trim() || undefined,
          deviceStorage: d.storage.trim() || undefined,
          modelNumber: d.modelNumber.trim() || productModelNumber || undefined,
          acquisitionType: d.acquisitionType,
          sourceCustomer: d.acquisitionType === 'RETURN_CREDIT' ? (d.sourceCustomer.trim() || undefined) : undefined,
          purchasePrice: d.costPrice === '' ? undefined : Number(d.costPrice),
          sellingPrice: d.sellingPrice === '' ? undefined : Number(d.sellingPrice),
          warrantyTerms: d.warrantyTerms.trim() || undefined,
          warrantyExpire: d.warrantyExpire.trim() || undefined,
          imageUrls: d.imageUrls.length ? d.imageUrls : undefined,
        }));

        // จัดกลุ่ม (สภาพ|สี|ความจุ) — แต่ละกลุ่ม = 1 variant
        const groups = new Map<string, WizardInitialItem[]>();
        for (const it of items) {
          const key = `${it.condition}|${(it.deviceColor ?? '').toLowerCase()}|${(it.deviceStorage ?? '').toLowerCase()}`;
          const arr = groups.get(key) ?? [];
          arr.push(it);
          groups.set(key, arr);
        }
        // เตือน: มือ 1 ควรมีสี+ความจุ (variant ห้าม null บนเว็บ) — ไม่บล็อก
        if (items.some((it) => it.condition === 'NEW' && (!it.deviceColor || !it.deviceStorage)))
          toast('⚠️ มือ 1 บางเครื่องไม่ได้ใส่สี/ความจุ — แนะนำใส่ให้ครบ', { duration: 4000, icon: '📱' });

        // แผนผ่อน มือ1 (ตั้งครั้งเดียว) → แนบทุก variant มือ1 ที่เพิ่มรอบนี้ + mirror แผนแรกลง field เก่า
        const inst = serializePlans(plans);
        // เพิ่มทีละ variant (sequential — รหัส DD ไม่ชน)
        for (const grp of groups.values()) {
          const first = grp[0];
          const cover = grp.find((x) => x.imageUrls?.length)?.imageUrls;
          const isNew = first.condition === 'NEW';
          await productsApi.addVariantWithStock(productId, {
            branchId: useBranchStore.getState().activeBranchId ?? undefined,  // รับเข้าสาขาที่เลือก (Phase 2A)
            variant: {
              spec: {
                sku: first.stockCode!,               // SKU variant = รหัสเครื่องแรกในกลุ่ม
                color: first.deviceColor, storage: first.deviceStorage,
                costPrice: Number(first.purchasePrice) || 0,
                sellingPrice: Number(first.sellingPrice) || 0,
                reorderPoint: Number(req.reorderPoint) || 5,
                imageUrls: cover,
                // ผ่อน มือ1 เท่านั้น (มือ2 = per-serial ไม่ผูกกับ preset)
                ...(isNew ? {
                  downPayment: inst.downPayment ?? undefined,
                  installmentTerms: inst.installmentTerms ?? undefined,
                  installmentPromo: inst.installmentPromo ?? undefined,
                  installmentPlans: inst.installmentPlans ?? undefined,
                } : {}),
              },
              items: grp,
            },
          });
        }
        return { added: groups.size };
      }
      // ไม่มี IMEI (หรืออุปกรณ์เสริม) → สร้าง variant เปล่า
      return productsApi.addVariant(productId, { ...req, imageUrl: variantImages[0], imageUrls: variantImages });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'แก้ไขรุ่นย่อยสำเร็จ'
        : addingPhone ? 'เพิ่มสี + เครื่องเข้ารุ่นนี้สำเร็จ' : 'เพิ่มรุ่นย่อยสำเร็จ');
      qc.invalidateQueries({ queryKey: ['product', productId] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // ลบ/ปิดรุ่นย่อยที่กรอกผิด (soft-delete) · force=true ลบเครื่องที่รับผิด (ยังไม่เคยขาย) ออกด้วย
  const remove = useMutation({
    mutationFn: (force: boolean) => productsApi.deactivateVariant(productId, editVariant!.id, force),
    onSuccess: () => {
      toast.success('ลบรุ่นย่อยแล้ว');
      qc.invalidateQueries({ queryKey: ['product', productId] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
      onClose();
    },
  });

  const handleDelete = async () => {
    const label = `${editVariant!.sku} (${[editVariant!.color, editVariant!.storage].filter(Boolean).join(' ')})`;
    if (!confirm(`ลบรุ่นย่อย ${label} ?`)) return;
    try {
      await remove.mutateAsync(false);
    } catch (e) {
      const msg = extractErrorMessage(e);
      if (/เครื่องพร้อมขาย|ลบพร้อมเครื่อง/i.test(msg)) {
        // มีเครื่องในสต๊อก → ถามลบพร้อมเครื่องที่ยังไม่เคยขาย
        if (confirm(`${msg}\n\nลบรุ่นย่อยนี้ + เครื่องที่ใส่ผิด (เฉพาะที่ยังไม่เคยขาย) เลยไหม?`)) {
          try { await remove.mutateAsync(true); } catch (e2) { toast.error(extractErrorMessage(e2)); }
        }
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{isEdit ? 'แก้ไขรุ่นย่อย (Variant)' : addingPhone ? 'เพิ่มสี + เครื่อง (เข้ารุ่นนี้)' : 'เพิ่มรุ่นย่อย (Variant)'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onKeyDown={(e) => {
            // กัน Enter ในช่อง input เผลอกดบันทึก+รับของทั้งฟอร์ม (textarea/ปุ่มยังใช้ Enter ได้)
            const el = e.target as HTMLElement;
            if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault();
          }}
          onSubmit={handleSubmit((d) => {
          const blank = (s?: string) => (s && s.trim()) ? s.trim() : undefined;
          create.mutate({
            sku: (d.sku ?? '').trim(),   // มือถือเพิ่มสี: ระบบออก DD ให้ (ไม่ใช้ค่านี้)
            color: blank(d.color),
            storage: blank(d.storage),
            network: blank(d.network),
            barcode: blank(d.barcode),
            imageUrl: blank(d.imageUrl),
            costPrice: Number(d.costPrice),
            sellingPrice: Number(d.sellingPrice),
            reorderPoint: Number(d.reorderPoint),
          });
        })}>
          <div className="space-y-3 p-5">
          {addingPhone && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              📱 เพิ่ม <strong>เครื่องเข้ารุ่นนี้</strong> — กรอกข้อมูล <strong>รายเครื่องครบเหมือนหน้ารับสต๊อก</strong>
              (IMEI · สภาพ · แบต · สี · ความจุ · เลขรุ่น · ประกัน · ที่มา · ราคา · รูป)
              · แต่ละเครื่อง<strong>ต่างกันได้</strong> · ระบบแยก variant ตามสภาพ/สี/ความจุ + ออกรหัส DD ให้อัตโนมัติ
            </div>
          )}
          {/* SKU — โชว์เฉพาะอุปกรณ์เสริม/แก้ไข (มือถือใช้ DD อัตโนมัติ) */}
          {!addingPhone && (
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
            {errors.sku && <p className="mt-1 text-xs text-red-600">{errors.sku.message}</p>}
          </div>
          )}
          {!addingPhone && (
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
          )}
          {!addingPhone && (
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
          )}
          {!addingPhone ? (
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
          ) : (
          <div className="w-40">
            <label className="mb-1 block text-sm font-medium">
              จุดสั่งใหม่ <span className="text-xs font-normal text-slate-500">(แจ้งเตือนทั้งสีนี้)</span>
            </label>
            <input type="number" className="input" placeholder="5" {...register('reorderPoint', { min: 0 })} />
          </div>
          )}

          {/* Live profit calculation */}
          {!addingPhone && cost > 0 && sell > 0 && (
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

          {!addingPhone && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              รูปสีนี้ <span className="text-xs font-normal text-slate-500">(หลายรูปได้ · รูปแรก = ปก · เว็บหน้าร้านมือ 1 ดึงจากตรงนี้)</span>
            </label>
            <ImageEditor value={variantImages} onChange={setVariantImages} />
          </div>
          )}

          {/* แผนผ่อนหลายแบบ มือ 1 (ต่อรุ่น+ความจุ) — ตั้งครั้งเดียวที่รุ่น เว็บหน้าร้านดึงไปแสดงเป็นปุ่มเลือก */}
          {isEdit && (
            <InstallmentPlansEditor value={plans} onChange={setPlans} />
          )}
          {addingPhone && (
            <div className="space-y-1">
              <InstallmentPlansEditor value={plans} onChange={setPlans} />
              <p className="px-1 text-[11px] text-amber-700">
                💡 แผนผ่อนนี้ใช้กับ <strong>ทุกสี/ความจุ (มือ1)</strong> ที่เพิ่มรอบนี้ · ปรับรายรุ่นภายหลังได้ที่ปุ่ม “แก้”
              </p>
            </div>
          )}

          {/* เครื่องรายตัว — ข้อมูลครบเท่าหน้ารับสต๊อก (แต่ละเครื่องต่างกันได้) */}
          {addingPhone && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">รายการเครื่อง</span>
                <span className="text-xs text-slate-500">
                  {devices.filter((d) => (d.imei || d.serialNumber).trim()).length} เครื่อง · ระบบแยก variant ตามสภาพ/สี/ความจุให้อัตโนมัติ
                </span>
              </div>
              {devices.map((d, i) => (
                <DeviceCard key={i} idx={i} device={d}
                            onChange={(patch) => patchDevice(i, patch)}
                            onRemove={() => removeDevice(i)} disableRemove={devices.length <= 1}
                            colorList={colorList} modelList={modelList} />
              ))}
              <button type="button" onClick={addDevice}
                      className="w-full rounded-lg border-2 border-dashed border-blue-300 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50">
                + เพิ่มเครื่องอีกตัว
              </button>
            </div>
          )}

          {!addingPhone && (
          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
            💡 <strong>จุดสั่งใหม่ (Reorder Point):</strong> ถ้าสต็อกเหลือ ≤ จำนวนนี้ ระบบจะแจ้งเตือน Manager
            ตัวอย่าง: ตั้ง 3 = พอเหลือ 3 ชิ้น จะมี toast แดง "Low Stock"
          </div>
          )}

          </div>
          <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
            {isEdit ? (
              <button type="button"
                      className="rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={remove.isPending}
                      onClick={handleDelete}>
                {remove.isPending ? 'กำลังลบ...' : '🗑 ลบรุ่นย่อยนี้'}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
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
