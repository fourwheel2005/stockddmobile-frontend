import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, X, ArrowDownToLine, Copy, FolderOpen, PackageOpen, Pencil, Trash2, Smartphone, BatteryMedium } from 'lucide-react';
import { productsApi, categoriesApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { ImageEditor } from '@/components/MultiImageUpload';
import { SerialsModal } from '@/components/SerialsModal';
import { FastInboundModal } from '@/components/receive/FastInboundModal';
import { ProductFastInboundModal } from '@/components/receive/ProductFastInboundModal';
import { formatDate, formatNumber, formatTHB } from '@/lib/format';
import { InstallmentPlansEditor } from '@/components/products/InstallmentPlansEditor';
import { parsePlans, serializePlans, type InstallmentPlan } from '@/lib/installment';
import type { CreateVariantRequest, VariantResponse, ProductDetail } from '@/types/api';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<VariantResponse | null>(null);
  const [serialsVariant, setSerialsVariant] = useState<VariantResponse | null>(null);
  const [receiveVariant, setReceiveVariant] = useState<VariantResponse | null>(null);  // รับเข้าในหน้านี้เลย (FIX-087)
  const [receiveProduct, setReceiveProduct] = useState(false);   // รับเข้าระดับรุ่น — หลายสี/มือ ครั้งเดียว (FIX-112)
  const [editingProduct, setEditingProduct] = useState(false);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'));
  const qc = useQueryClient();

  // รวม SKU ซ้ำในรุ่น (มือ+สี+ความจุ ตรงกัน) — dry-run พรีวิวก่อน แล้วค่อยลงมือจริง (FIX-115)
  const dedupVariants = useMutation({
    mutationFn: async () => {
      const preview = await productsApi.dedupVariants(id!, false);
      if (preview.duplicateGroups === 0) { toast('ไม่พบ SKU ซ้ำ — เรียบร้อยอยู่แล้ว'); return null; }
      const lines = preview.groups.map((g) =>
        `• ${g.color} ${g.storage} (${g.condition === 'NEW' ? 'มือ 1' : 'มือ 2'}): เก็บ ${g.keptSku} ← ปิด ${g.mergedSkus.join(', ')}`
        + (g.devicesMoved > 0 ? ` (ย้าย ${g.devicesMoved} เครื่อง)` : '')
        + (g.skippedSkus.length > 0 ? ` · ข้าม ${g.skippedSkus.join(', ')} (มีเครื่องติดจอง)` : ''));
      const ok = confirm(
        `พบ SKU ซ้ำ ${preview.duplicateGroups} กลุ่ม:\n\n${lines.join('\n')}\n\n`
        + `เครื่องพร้อมขายจะย้ายไป SKU หลัก · ประวัติขายไม่หาย · SKU ซ้ำถูกปิด (กู้คืนได้)\nยืนยันรวมเลยไหม?`);
      if (!ok) return null;
      return productsApi.dedupVariants(id!, true);
    },
    onSuccess: (res) => {
      if (!res) return;
      toast.success(`รวมสำเร็จ ${res.duplicateGroups} กลุ่ม · ปิด ${res.variantsDeactivated} SKU · ย้าย ${res.devicesMoved} เครื่อง`);
      qc.invalidateQueries({ queryKey: ['product', id] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });

  // ?receive=1 → เปิดฟอร์มรับเข้าทันที (deep-link จากหน้าลงทะเบียน "รับเข้ารุ่นเดิมเลย" — FIX-114)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!product || searchParams.get('receive') !== '1') return;
    if (product.serialized) setReceiveProduct(true);
    else if (product.variants.length === 1) setReceiveVariant(product.variants[0]);
    setSearchParams({}, { replace: true });   // ใช้ครั้งเดียว — กัน modal เด้งซ้ำตอน refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

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
  const everReceivedByVariant = new Map<string, boolean>();                // แยก "ขายหมด" vs "ยังไม่เคยรับเข้า" (FIX-113)
  stockQueries.forEach((q, i) => {
    if (q.data) {
      qtyByVariant.set(variants[i].id, q.data.quantity);
      condByVariant.set(variants[i].id, { newQ: q.data.newInStock ?? 0, sh: q.data.secondHandInStock ?? 0 });
      everReceivedByVariant.set(variants[i].id, q.data.everReceived ?? false);
    }
  });
  const stockResolved = variants.length > 0 && stockQueries.every((q) => q.isSuccess || q.isError);
  // มี SKU ซ้ำ (มือ+สี+ความจุ ตรงกัน) ไหม — โชว์ปุ่มรวมเฉพาะตอนเจอจริง (FIX-115)
  const dupKeyCounts = new Map<string, number>();
  for (const v of variants) {
    if (!v.active || !v.condition || !(v.color ?? '').trim() || !(v.storage ?? '').trim()) continue;
    const key = `${v.condition}|${v.color!.trim().toLowerCase()}|${v.storage!.trim().toLowerCase()}`;
    dupKeyCounts.set(key, (dupKeyCounts.get(key) ?? 0) + 1);
  }
  const hasDupSkus = [...dupKeyCounts.values()].some((n) => n > 1);
  const totalQty = [...qtyByVariant.values()].reduce((sum, n) => sum + n, 0);
  const hasNoStock = stockResolved && totalQty === 0;

  if (isLoading) return <div className="text-slate-500">กำลังโหลด...</div>;
  if (!product) return <div className="text-slate-500">ไม่พบสินค้า</div>;

  /* รับเข้าโดยไม่เด้งออกจากหน้า (FIX-087 → FIX-114):
     serialized → ฟอร์มรับเข้าหนึ่งเดียว (หลายสี/มือ ครั้งเดียว · สร้างสี/SKU ใหม่ได้ในตัว — 0 SKU ก็ใช้ได้)
     ไม่ serialized (bulk) → 0 SKU ต้องเพิ่มรุ่นย่อยก่อน · 1 SKU เปิด modal เลย · หลาย SKU เลือกจากตาราง */
  const handleReceive = () => {
    if (product.serialized) { setReceiveProduct(true); return; }
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="page-title">{product.name}</h1>
              <div className="mt-1 text-sm text-slate-500">
                {product.brand} {product.modelNumber && `· ${product.modelNumber}`} · {product.category.name}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
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
            {/* รวม SKU ซ้ำ (มือ+สี+ความจุ ตรงกัน) — ซากจากยุคก่อน FIX-113 (FIX-115) */}
            {isAdmin && hasDupSkus && (
              <button type="button" onClick={() => dedupVariants.mutate()} disabled={dedupVariants.isPending}
                      className="btn-secondary border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                      title="รวม SKU ที่ มือ+สี+ความจุ ตรงกันให้เหลือตัวเดียว (ย้ายเครื่องไปตัวเก่าสุด · ประวัติไม่หาย)">
                <FolderOpen className="h-4 w-4" /> {dedupVariants.isPending ? 'กำลังรวม…' : 'รวม SKU ซ้ำ'}
              </button>
            )}
            {/* FIX-114: มือถือเหลือปุ่มเดียว "รับสินค้าเข้า" — ฟอร์มเดียวรับหลายสี/มือ + สร้างสี/SKU ใหม่ได้ในตัว
                (แทนที่ "เพิ่มสี + เครื่อง" เดิมที่ทำงานซ้ำกันแต่ field ไม่เท่ากัน) */}
            {canEdit && !product.serialized && (
              <button type="button" onClick={() => setShowAddVariant(true)} className="btn-secondary"
                      title="เพิ่ม SKU/รุ่นย่อยใหม่ของอุปกรณ์เสริมชิ้นนี้">
                <Plus className="h-4 w-4" /> เพิ่มรุ่นย่อย
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={handleReceive} className="btn-primary bg-emerald-600 hover:bg-emerald-700"
                      title="รับของเข้าสต็อก — หลายสี/หลายมือได้ในครั้งเดียว ระบบจับเข้า SKU ให้ (สีใหม่ = สร้าง SKU ให้เอง)">
                <ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้า
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
                      // มือของ SKU (FIX-113) — โชว์ได้แม้ qty 0 (เดิมป้ายหายตอนขายหมด)
                      const skuHandBadge = v.condition === 'NEW' ? <span className="badge-blue">มือ 1</span>
                        : v.condition === 'SECOND_HAND' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">มือ 2</span>
                        : null;
                      if (qty <= 0) {
                        // แยก "ขายหมด" (เคยมีเครื่อง) ออกจาก "ยังไม่เคยรับเข้า" — ป้ายเดิมโกหกว่าไม่รับเข้าทั้งที่ขายหมด (FIX-113)
                        const sold = everReceivedByVariant.get(v.id) ?? false;
                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            {skuHandBadge}
                            {sold
                              ? <button type="button" onClick={() => setSerialsVariant(v)}
                                        className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 underline decoration-dotted underline-offset-2"
                                        title="เคยมีเครื่องแต่ขายหมดแล้ว — กดดูประวัติเครื่อง">0 · ขายหมด</button>
                              : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">0 · ยังไม่เคยรับเข้า</span>}
                          </div>
                        );
                      }
                      const c = condByVariant.get(v.id);
                      const badge = c && c.newQ > 0 && c.sh > 0
                        ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700"
                                title="มีเครื่องปนมือใน SKU เดียว — ใช้ปุ่มย้าย SKU แยกออก">ผสม 1+2</span>
                        : skuHandBadge ?? (!c ? null
                          : c.newQ > 0 ? <span className="badge-blue">มือ 1</span>
                          : c.sh > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">มือ 2</span>
                          : null);
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
                              title="สร้าง 'รุ่นใหม่แยกต่างหาก' โดยคัดลอกข้อมูล SKU นี้เป็นต้นแบบ — ไม่ใช่การรับของเข้า (รับเข้าใช้ปุ่ม 📥)">
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
                      // FIX-114: มือถือ → ฟอร์มรับเข้าหนึ่งเดียว (สร้างสี/SKU ให้เอง) · อุปกรณ์เสริม → เพิ่มรุ่นย่อยก่อน
                      <button type="button" onClick={handleReceive} className="btn-primary inline-flex">
                        {product.serialized
                          ? <><ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้า (ระบบสร้างสี/SKU ให้)</>
                          : <><Plus className="h-4 w-4" /> เพิ่มรุ่นย่อย</>}
                      </button>
                    )}
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* รายเครื่องทั้งหมดของรุ่นนี้ (ทุก SKU/สี รวมมือ 1 + มือ 2) — ไม่ต้องกด "รายเครื่อง" ทีละ SKU */}
      {product.serialized && (
        <ProductSerialsSection product={product} />
      )}

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
      {/* รับเข้าระดับรุ่น — หลายสี/หลายมือ lot เดียว (FIX-112) */}
      {receiveProduct && (
        <ProductFastInboundModal product={product}
                                 onClose={() => setReceiveProduct(false)}
                                 onDone={onReceiveDone} />
      )}
    </div>
  );
}

/* ─── รายเครื่องทั้งหมดของรุ่นนี้ (ทุก SKU รวมมือ 1 + มือ 2) ─────────────
   เดิมต้องกดปุ่ม "รายเครื่อง" ทีละ SKU — ตารางนี้ดึง flat ผ่าน /inventory/serials?productId=
   กดแถวไหนเปิด SerialsModal ของ SKU นั้น (แก้ไข/ส่งซ่อม/ย้าย SKU ได้ครบเหมือนเดิม) */
const SERIAL_STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  IN_STOCK: { text: 'พร้อมขาย', cls: 'badge-green' },
  RESERVED: { text: 'จองแล้ว', cls: 'badge-blue' },
  SOLD: { text: 'ขายแล้ว', cls: 'badge-slate' },
  DEFECTIVE: { text: 'ชำรุด/บริการ', cls: 'badge-red' },
  RETURNED: { text: 'คืน', cls: 'badge-amber' },
  TRANSFERRED: { text: 'ย้ายสาขา', cls: 'badge-slate' },
};
const SERIAL_CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก', REFURBISHED: 'ปรับสภาพ', DEFECTIVE: 'ชำรุด',
};
type SerialConditionFilter = '' | 'NEW' | 'SECOND_HAND';

function ProductSerialsSection({ product }: { product: ProductDetail }) {
  const [condition, setCondition] = useState<SerialConditionFilter>('');
  const [status, setStatus] = useState('IN_STOCK');   // ค่าเริ่มต้น: เครื่องพร้อมขาย
  const [page, setPage] = useState(0);
  const [serialsFor, setSerialsFor] = useState<{ variantId: string; sku: string; highlightId: string } | null>(null);

  const { data, isLoading } = useQuery({
    // prefix 'inventory-serials' เดียวกับหน้า Stock → invalidate หลังรับเข้า/แก้ไข/ขาย ครอบถึงกันอัตโนมัติ
    queryKey: ['inventory-serials', 'product', product.id, { condition, status, page }],
    queryFn: () => inventoryApi.listSerials({
      productId: product.id,
      condition: condition || undefined,
      status: status || undefined,
      page, size: 50,
    }),
  });

  const pickCondition = (c: SerialConditionFilter) => { setCondition(c); setPage(0); };
  const condChip = (c: SerialConditionFilter, label: string) => (
    <button type="button" onClick={() => pickCondition(c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              condition === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
      {label}
    </button>
  );

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <span>
          รายเครื่องในรุ่นนี้ <span className="font-normal text-slate-500">(ทุกสี/SKU · มือ 1 + มือ 2{data ? ` · ${formatNumber(data.totalElements)} เครื่อง` : ''})</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {condChip('', 'ทั้งหมด')}
            {condChip('NEW', 'มือ 1')}
            {condChip('SECOND_HAND', 'มือ 2')}
          </div>
          <select className="input w-40 py-1 text-sm" value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            <option value="IN_STOCK">พร้อมขาย</option>
            <option value="">ทุกสถานะ</option>
            <option value="RESERVED">จองแล้ว</option>
            <option value="SOLD">ขายแล้ว</option>
            <option value="DEFECTIVE">ชำรุด/บริการ</option>
            <option value="RETURNED">คืน</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-2.5">รหัสเครื่อง</th>
              <th className="px-5 py-2.5">สี / ความจุ</th>
              <th className="px-5 py-2.5">IMEI / SN</th>
              <th className="px-5 py-2.5">สภาพ</th>
              <th className="px-5 py-2.5">สถานะ</th>
              <th className="px-5 py-2.5 text-right">ราคาขาย</th>
              <th className="px-5 py-2.5">รับเข้า</th>
              <th className="px-5 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
            )}
            {data?.content.map((s) => {
              const st = SERIAL_STATUS_LABEL[s.status] ?? { text: s.status, cls: 'badge-slate' };
              // ราคาขายรายเครื่อง (มือ 2 ตั้งต่อเครื่อง) → fallback ราคา SKU
              const variant = product.variants.find((v) => v.id === s.variantId);
              const sell = s.sellingPrice ?? variant?.sellingPrice;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <span className="rounded bg-brand-100 px-1.5 font-mono text-xs font-semibold text-brand-700">
                      {s.stockCode ?? '—'}
                    </span>
                    {s.branchName && (
                      <div className="mt-0.5 text-[10px] text-slate-500">🏪 {s.branchName}</div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {[s.deviceColor, s.deviceStorage].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-mono text-xs">{s.imei ?? '-'}</div>
                    <div className="font-mono text-xs text-slate-400">{s.serialNumber}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={s.condition === 'NEW' ? 'badge-blue'
                      : 'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700'}>
                      {SERIAL_CONDITION_TH[s.condition] ?? s.condition}
                    </span>
                    {s.batteryHealth != null && (
                      <div className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-slate-500">
                        <BatteryMedium className="h-3.5 w-3.5" />{s.batteryHealth}%
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3"><span className={st.cls}>{st.text}</span></td>
                  <td className="px-5 py-3 text-right font-semibold">{sell != null ? formatTHB(sell) : '-'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDate(s.receivedAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button"
                            className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                            title="เปิดจัดการเครื่องนี้ (แก้ไข/ส่งซ่อม/ย้าย SKU)"
                            onClick={() => setSerialsFor({ variantId: s.variantId, sku: s.sku, highlightId: s.id })}>
                      <Smartphone className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {data && data.content.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                ไม่มีเครื่อง{condition && ` (${condition === 'NEW' ? 'มือ 1' : 'มือ 2'})`}ในสถานะนี้
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
          <div>หน้า {data.page + 1} / {data.totalPages} ({formatNumber(data.totalElements)} เครื่อง)</div>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
            <button className="btn-secondary" disabled={data.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
          </div>
        </div>
      )}

      {serialsFor && (
        <SerialsModal variantId={serialsFor.variantId} productName={product.name} sku={serialsFor.sku}
                      highlightId={serialsFor.highlightId} productVariants={product.variants}
                      onClose={() => setSerialsFor(null)} />
      )}
    </div>
  );
}

/* ─── เพิ่ม/แก้ไขรุ่นย่อย (SKU) — อุปกรณ์เสริม + แก้ไข SKU ทุกชนิด ────────
   FIX-114: โหมด "เพิ่มสี + เครื่อง" (มือถือ) ถูกตัดออก — งานนั้นย้ายไปฟอร์มรับเข้าหนึ่งเดียว
   (ProductFastInboundModal) ซึ่งสร้างสี/SKU ใหม่ได้ในตัวผ่าน /products/wizard */
function AddVariantModal({ productId, editVariant, onClose }: {
  productId: string;
  editVariant?: VariantResponse; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editVariant;
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
      // อุปกรณ์เสริม (ไม่มี IMEI) → สร้าง variant เปล่า
      return productsApi.addVariant(productId, { ...req, imageUrl: variantImages[0], imageUrls: variantImages });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'แก้ไขรุ่นย่อยสำเร็จ' : 'เพิ่มรุ่นย่อยสำเร็จ');
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
          <h2 className="font-semibold">{isEdit ? 'แก้ไขรุ่นย่อย (Variant)' : 'เพิ่มรุ่นย่อย (Variant)'}</h2>
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

          {/* แผนผ่อนหลายแบบ มือ 1 (ต่อรุ่น+ความจุ) — ตั้งครั้งเดียวที่รุ่น เว็บหน้าร้านดึงไปแสดงเป็นปุ่มเลือก */}
          {isEdit && (
            <InstallmentPlansEditor value={plans} onChange={setPlans} />
          )}

          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
            💡 <strong>จุดสั่งใหม่ (Reorder Point):</strong> ถ้าสต็อกเหลือ ≤ จำนวนนี้ ระบบจะแจ้งเตือน Manager
            ตัวอย่าง: ตั้ง 3 = พอเหลือ 3 ชิ้น จะมี toast แดง "Low Stock"
          </div>

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
