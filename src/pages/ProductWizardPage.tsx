import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Control, type UseFormGetValues, type UseFormRegister, type UseFormSetValue,
  useFieldArray, useForm, useWatch,
} from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Package, Boxes, ScanLine, Plus, Trash2, Sparkles, Save, Info,
  ChevronDown, ChevronUp, Check, CircleAlert, Loader2, Zap, BatteryFull, Copy,
  Upload, X, ImageIcon, Rabbit,
} from 'lucide-react';
import { categoriesApi, productsApi } from '@/api/products';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import type { AddVariantWithStockRequest, ProductWizardRequest } from '@/types/api';

/* ─── datalists ────────────────────────────────────────────────────────── */
const STORAGE_SUGGESTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];
const NETWORK_SUGGESTIONS = ['TH', 'DS', 'DN', 'HK', 'JP', 'Intl', 'KH'];
const COLOR_SUGGESTIONS = [
  'Natural Titanium', 'Blue Titanium', 'Black Titanium', 'White Titanium',
  'Desert Titanium', 'Black', 'White', 'Blue', 'Pink', 'Yellow', 'Green', 'Red',
];

type Condition = 'NEW' | 'SECOND_HAND';
type Acq =
  | 'PURCHASE' | 'TRADE_IN' | 'OUTRIGHT'
  | 'ICE' | 'BORROW' | 'P_GREEN' | 'GREETER' | 'RED_HEAT' | 'AMP_MOBILE';

interface ItemRow {
  serialNumber: string;
  imei: string;
  condition: Condition;
  batteryHealth: number | '';
  acquisitionType: Acq;
  purchasePrice: number | '';
}

interface VariantBlockForm {
  spec: {
    sku: string;
    color: string;
    storage: string;
    network: string;
    barcode: string;
    costPrice: number | '';
    sellingPrice: number | '';
    reorderPoint: number;
  };
  quantity: number | '';  // bulk
  items: ItemRow[];        // serialized
}

interface FormValues {
  categoryId: string;
  name: string;
  brand: string;
  modelNumber: string;
  description: string;
  serialized: boolean;
  variants: VariantBlockForm[];
  // shared lot info (serialized only)
  lotNo: string;
  importDate: string;
  lotNote: string;
  withInitialStock: boolean;
}

const EMPTY_ROW: ItemRow = {
  serialNumber: '', imei: '',
  condition: 'NEW',
  batteryHealth: '',
  acquisitionType: 'PURCHASE',
  purchasePrice: '',
};

const newVariant = (reorderPoint = 2): VariantBlockForm => ({
  spec: {
    sku: '', color: '', storage: '', network: '',
    barcode: '', costPrice: '', sellingPrice: '', reorderPoint,
  },
  quantity: '',
  items: [{ ...EMPTY_ROW }],
});

function todayIso() { return new Date().toISOString().slice(0, 10); }

function generateSku(name: string, color: string, storage: string, network: string): string {
  const norm = (s: string, max = 8) =>
    s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, max);
  const parts = [norm(name, 10), norm(color, 4), norm(storage, 5), norm(network, 4)].filter(Boolean);
  return parts.join('-');
}

/* ══════════════════════════════════════════════════════════════════════ */

type WizardMode = 'CREATE_NEW' | 'ADD_VARIANT' | 'CLONE_TO_NEW';

export function ProductWizardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── Mode detection from URL ──────────────────────────────────────── */
  const params = useParams<{ productId?: string }>();
  const [searchParams] = useSearchParams();
  const addVariantProductId = params.productId;
  const cloneProductId = searchParams.get('cloneProduct') ?? undefined;
  const cloneFromVariantId = searchParams.get('cloneFrom') ?? undefined;

  const mode: WizardMode =
    addVariantProductId ? 'ADD_VARIANT' :
    cloneProductId ? 'CLONE_TO_NEW' : 'CREATE_NEW';

  /* ─── Fetch source product (สำหรับ ADD_VARIANT หรือ CLONE_TO_NEW) ─── */
  const sourceProductId = addVariantProductId ?? cloneProductId;
  const sourceProductQuery = useQuery({
    queryKey: ['product', sourceProductId],
    queryFn: () => productsApi.get(sourceProductId!),
    enabled: !!sourceProductId,
  });
  const sourceProduct = sourceProductQuery.data;

  const { register, control, handleSubmit, watch, setValue, getValues, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      categoryId: '', name: '', brand: 'Apple', modelNumber: '', description: '',
      serialized: true,
      variants: [newVariant(2)],
      lotNo: '', importDate: todayIso(), lotNote: '',
      withInitialStock: true,
    },
  });

  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({
    control, name: 'variants',
  });

  const serialized = watch('serialized');
  const withStock = watch('withInitialStock');
  const productName = useWatch({ control, name: 'name' });
  const variantsWatch = useWatch({ control, name: 'variants' });

  /* ─── default condition/acquisition (shared) ──────────────────────── */
  const [defaultCondition, setDefaultCondition] = useState<Condition>('NEW');
  const [defaultAcq, setDefaultAcq] = useState<Acq>('PURCHASE');

  /* ─── UI state ─────────────────────────────────────────────────────── */
  const [collapsedVariants, setCollapsedVariants] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvancedLot, setShowAdvancedLot] = useState(false);

  /* ─── Express mode ─────────────────────────────────────────────────── */
  const [expressMode, setExpressMode] = useState(false);
  const toggleExpress = () => {
    setExpressMode((prev) => {
      const next = !prev;
      if (next) {
        // express → ใช้กับมือถือเท่านั้น + รุ่นย่อยเดียว
        setValue('serialized', true);
        setValue('withInitialStock', true);
        while (variantFields.length > 1) removeVariant(variantFields.length - 1);
        setCollapsedVariants(new Set());
        toast.success('โหมดด่วนเปิด — ฟอร์มย่อแล้ว', { duration: 1500 });
      }
      return next;
    });
  };

  /* ─── Product image upload (ใช้กับทุกรุ่นย่อย) ─────────────────────── */
  const [productImageUrl, setProductImageUrl] = useState<string>('');   // server-side URL
  const [imagePreview, setImagePreview] = useState<string>('');         // local blob URL
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ (jpg / png / webp / heic)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('ขนาดรูปต้องไม่เกิน 10MB');
      return;
    }
    // preview ทันทีจากไฟล์ local
    const localPreview = URL.createObjectURL(file);
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return localPreview; });
    setUploadingImage(true);
    try {
      const uploaded = await filesApi.upload(file);
      setProductImageUrl(uploaded.url);
      toast.success('อัปโหลดรูปสำเร็จ', { duration: 1200 });
    } catch (e) {
      toast.error(extractErrorMessage(e));
      setProductImageUrl('');
    } finally {
      setUploadingImage(false);
    }
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview('');
    setProductImageUrl('');
  };

  /* ─── Pre-fill form when source product loads (ADD_VARIANT / CLONE) ─ */
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!sourceProduct || prefilledRef.current) return;
    prefilledRef.current = true;

    // หา source variant (สำหรับ ADD_VARIANT + cloneFrom หรือ CLONE_TO_NEW = variant แรก)
    const sourceVariant = cloneFromVariantId
      ? sourceProduct.variants.find((v) => v.id === cloneFromVariantId)
      : sourceProduct.variants[0];

    const baseVariant: VariantBlockForm = {
      spec: {
        sku: '',                                              // clear (auto-gen ใหม่)
        color: sourceVariant?.color ?? '',
        storage: sourceVariant?.storage ?? '',
        network: sourceVariant?.network ?? '',
        barcode: '',                                          // clear (unique)
        costPrice: sourceVariant?.costPrice ?? '',
        sellingPrice: sourceVariant?.sellingPrice ?? '',
        reorderPoint: sourceVariant?.reorderPoint ?? (sourceProduct.serialized ? 2 : 5),
      },
      quantity: '',                                           // reset stock
      items: [{ ...EMPTY_ROW }],                              // reset IMEIs
    };

    reset({
      categoryId: sourceProduct.category.id,
      // CLONE_TO_NEW: ให้ user ตั้งชื่อใหม่ (ห้ามชื่อซ้ำ Product)
      // ADD_VARIANT: ชื่อใช้ของเดิม (read-only summary)
      name: mode === 'ADD_VARIANT' ? sourceProduct.name : '',
      brand: sourceProduct.brand,
      modelNumber: sourceProduct.modelNumber ?? '',
      description: sourceProduct.description ?? '',
      serialized: sourceProduct.serialized,
      variants: [baseVariant],
      lotNo: '',
      importDate: todayIso(),
      lotNote: '',
      withInitialStock: true,
    });

    if (sourceVariant?.imageUrl) {
      setProductImageUrl(sourceVariant.imageUrl);
      setImagePreview(sourceVariant.imageUrl);   // server URL ใช้แสดง preview ได้ (ผ่าน proxy)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProduct]);

  /* ─── Smart reorder default when serialized toggles ────────────────── */
  useEffect(() => {
    variantFields.forEach((_, idx) => {
      const rp = getValues(`variants.${idx}.spec.reorderPoint`);
      if (rp === 2 || rp === 5) setValue(`variants.${idx}.spec.reorderPoint`, serialized ? 2 : 5);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  /* ─── Apply defaults to ALL items across ALL variants ──────────────── */
  const applyDefaultsToAll = (which: 'condition' | 'acq') => {
    let count = 0;
    variantFields.forEach((_, vIdx) => {
      const items = getValues(`variants.${vIdx}.items`);
      items.forEach((_it, iIdx) => {
        if (which === 'condition') {
          setValue(`variants.${vIdx}.items.${iIdx}.condition`, defaultCondition);
        } else {
          setValue(`variants.${vIdx}.items.${iIdx}.acquisitionType`, defaultAcq);
        }
        count++;
      });
    });
    toast.success(`ตั้งให้ ${count} เครื่อง`, { duration: 1200 });
  };

  /* ─── Summary across all variants ──────────────────────────────────── */
  const summary = useMemo(() => {
    let count = 0;
    let totalCost = 0;
    let totalSell = 0;
    (variantsWatch ?? []).forEach((vb) => {
      const cost = Number(vb.spec?.costPrice) || 0;
      const sell = Number(vb.spec?.sellingPrice) || 0;
      if (serialized) {
        const valid = (vb.items ?? []).filter((it) => (it?.imei || it?.serialNumber || '').trim());
        count += valid.length;
        totalCost += valid.reduce((s, it) => s + (Number(it.purchasePrice) || cost || 0), 0);
        totalSell += valid.length * sell;
      } else {
        const qty = Number(vb.quantity) || 0;
        count += qty;
        totalCost += qty * cost;
        totalSell += qty * sell;
      }
    });
    return { count, totalCost, profit: totalSell - totalCost };
  }, [variantsWatch, serialized]);

  /* ─── Categories ───────────────────────────────────────────────────── */
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const flatCategories = useMemo(() =>
    (categories ?? []).flatMap((c) => [
      { id: c.id, label: c.name },
      ...(c.children ?? []).map((sub) => ({ id: sub.id, label: `${c.name} / ${sub.name}` })),
    ]), [categories]);

  /* ─── Submit ───────────────────────────────────────────────────────── */
  const submit = useMutation({
    mutationFn: (req: ProductWizardRequest) => productsApi.createWizard(req),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      toast.success(
        (t) => (
          <div className="flex items-center gap-3">
            <div>
              <div className="font-semibold">สร้างสินค้าสำเร็จ</div>
              <div className="text-xs text-slate-500">
                {product.name} · {product.variants?.length ?? 0} รายการ
              </div>
            </div>
            <button onClick={() => { toast.dismiss(t.id); resetForNew(); }}
                    className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white">
              สร้างต่อ
            </button>
          </div>
        ),
        { duration: 5000 }
      );
      navigate(`/products/${product.id}`);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  /** Submit สำหรับ ADD_VARIANT mode — เพิ่ม SKU ใหม่ใน Product ที่มีอยู่ + รับสต็อก. */
  const submitAddVariant = useMutation({
    mutationFn: (req: AddVariantWithStockRequest) =>
      productsApi.addVariantWithStock(addVariantProductId!, req),
    onSuccess: (variant) => {
      qc.invalidateQueries({ queryKey: ['product', addVariantProductId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      toast.success(`เพิ่ม SKU ${variant.sku} แล้ว`, { duration: 2500 });
      navigate(`/products/${addVariantProductId}`);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const resetForNew = () => {
    reset({
      categoryId: getValues('categoryId'),
      name: '', brand: getValues('brand'), modelNumber: '', description: '',
      serialized: getValues('serialized'),
      variants: [newVariant(getValues('serialized') ? 2 : 5)],
      lotNo: '', importDate: todayIso(), lotNote: '',
      withInitialStock: true,
    });
    setCollapsedVariants(new Set());
    setShowConfirm(false);
    navigate('/products/new');
  };

  const buildPayload = (d: FormValues): ProductWizardRequest | null => {
    const blank = (s?: string) => (s && s.trim()) ? s.trim() : undefined;

    const variants = d.variants.map((vb) => {
      const spec = {
        sku: vb.spec.sku.trim(),
        color: blank(vb.spec.color),
        storage: blank(vb.spec.storage),
        network: blank(vb.spec.network),
        barcode: blank(vb.spec.barcode),
        costPrice: Number(vb.spec.costPrice),
        sellingPrice: Number(vb.spec.sellingPrice),
        reorderPoint: Number(vb.spec.reorderPoint),
        // ใช้รูปสินค้าเดียวกันทุก variant
        ...(productImageUrl ? { imageUrl: productImageUrl } : {}),
      };

      if (!d.withInitialStock) return { spec };

      if (d.serialized) {
        const items = vb.items
          .filter((it) => (it.imei || it.serialNumber || '').trim())
          .map((it) => ({
            serialNumber: (it.serialNumber || it.imei).trim(),
            imei: blank(it.imei),
            condition: it.condition,
            batteryHealth: it.condition === 'NEW'
              ? (it.batteryHealth === '' ? 100 : Number(it.batteryHealth))
              : (it.batteryHealth === '' ? undefined : Number(it.batteryHealth)),
            acquisitionType: it.acquisitionType,
            purchasePrice: it.purchasePrice === '' ? undefined : Number(it.purchasePrice),
          }));
        return { spec, items: items.length > 0 ? items : undefined };
      } else {
        const qty = Number(vb.quantity) || 0;
        return { spec, quantity: qty > 0 ? qty : undefined };
      }
    });

    // Validation: SKU ต้องไม่ซ้ำใน payload
    const skus = new Set<string>();
    for (const v of variants) {
      if (skus.has(v.spec.sku)) {
        toast.error(`SKU "${v.spec.sku}" ซ้ำในรายการ — กรุณาเปลี่ยน`);
        return null;
      }
      skus.add(v.spec.sku);
    }

    if (d.withInitialStock) {
      if (d.serialized) {
        const totalItems = variants.reduce((s, v) => s + (v.items?.length ?? 0), 0);
        if (totalItems === 0) {
          toast.error('ใส่อย่างน้อย 1 IMEI ในรุ่นย่อยใดก็ได้ (หรือปิดการรับสต็อกเริ่มต้น)');
          return null;
        }
        // serial/IMEI ซ้ำข้าม variants
        const ser = new Set<string>();
        const imeis = new Set<string>();
        for (const v of variants) {
          for (const it of v.items ?? []) {
            if (ser.has(it.serialNumber)) { toast.error(`Serial ${it.serialNumber} ซ้ำ`); return null; }
            ser.add(it.serialNumber);
            if (it.imei) {
              if (imeis.has(it.imei)) { toast.error(`IMEI ${it.imei} ซ้ำ`); return null; }
              imeis.add(it.imei);
            }
          }
        }
      } else {
        const totalQty = variants.reduce((s, v) => s + (v.quantity ?? 0), 0);
        if (totalQty === 0) {
          toast.error('ใส่จำนวนรับเข้าอย่างน้อย 1 รุ่นย่อย (หรือปิดการรับสต็อกเริ่มต้น)');
          return null;
        }
      }
    }

    return {
      categoryId: d.categoryId,
      name: d.name.trim(),
      brand: blank(d.brand),
      modelNumber: blank(d.modelNumber),
      description: blank(d.description),
      serialized: d.serialized,
      variants,
      ...(d.serialized ? {
        lotNo: blank(d.lotNo),
        importDate: d.importDate,
        note: blank(d.lotNote),
      } : {}),
    };
  };

  /** แปลง wizard payload → AddVariantWithStockRequest (single variant). */
  const buildAddVariantPayload = (req: ProductWizardRequest): AddVariantWithStockRequest => ({
    variant: req.variants[0],
    lotNo: req.lotNo,
    importDate: req.importDate,
    note: req.note,
  });

  const onSubmit = (d: FormValues) => {
    const req = buildPayload(d);
    if (!req) return;

    if (mode === 'ADD_VARIANT') {
      // SKU เดียว → ส่งไป endpoint /products/{id}/variants-with-stock
      if (summary.count > 5) { setShowConfirm(true); return; }
      submitAddVariant.mutate(buildAddVariantPayload(req));
      return;
    }

    // CREATE_NEW / CLONE_TO_NEW → wizard endpoint
    if (summary.count > 5 || req.variants.length > 1) {
      setShowConfirm(true);
      return;
    }
    submit.mutate(req);
  };

  const performConfirmedSubmit = () => {
    const d = getValues();
    const req = buildPayload(d);
    if (!req) return;
    setShowConfirm(false);
    if (mode === 'ADD_VARIANT') {
      submitAddVariant.mutate(buildAddVariantPayload(req));
    } else {
      submit.mutate(req);
    }
  };

  /* ─── Progress steps ──────────────────────────────────────────────── */
  const steps = useMemo(() => {
    const s1 = !!(productName && getValues('categoryId'));
    const s2 = (variantsWatch ?? []).every((v) =>
      !!(v.spec?.sku && Number(v.spec?.costPrice) > 0 && Number(v.spec?.sellingPrice) > 0));
    const s3 = !withStock || summary.count > 0;
    return [s1, s2, s3];
  }, [productName, variantsWatch, withStock, summary.count, getValues]);

  /* ─── Toggle collapse for a variant ───────────────────────────────── */
  const toggleCollapse = (idx: number) => {
    setCollapsedVariants((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  /* ─── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 pb-32">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับไปรายการสินค้า
      </Link>

      <header className="space-y-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-600" />
            {mode === 'ADD_VARIANT' ? 'เพิ่มสี/ความจุของรุ่นนี้'
             : mode === 'CLONE_TO_NEW' ? 'สร้างสินค้าใหม่ (คัดลอกจากรุ่นเดิม)'
             : 'สร้างสินค้าใหม่'}
          </h1>
          <p className="page-subtitle">
            {mode === 'ADD_VARIANT'
              ? 'เพิ่ม SKU ใหม่ของรุ่นเดิม (เช่น สีอื่น/ความจุอื่น) + รับเข้าสต็อก ครั้งเดียวจบ'
              : mode === 'CLONE_TO_NEW'
              ? 'คัดลอกข้อมูลจากรุ่นเดิมเป็นเทมเพลต — ตั้งชื่อใหม่และแก้ตามต้องการ'
              : 'กรอกข้อมูลสินค้า + ราคา + รับสต็อก ในฟอร์มเดียว กดบันทึกครั้งเดียวจบ'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ol className="flex flex-wrap items-center gap-2 text-xs">
            {['ข้อมูลสินค้า', 'ราคา & SKU', 'รับเข้าสต็อก'].map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-all ${
                  steps[i] ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {steps[i] ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={steps[i] ? 'font-semibold text-slate-700' : 'text-slate-400'}>{label}</span>
                {i < 2 && <span className="mx-1 text-slate-300">→</span>}
              </li>
            ))}
          </ol>
          {/* Express toggle — โหมดด่วน */}
          <button
            type="button"
            onClick={toggleExpress}
            title="โหมดด่วน: ใส่แค่ชื่อ + IMEI + ราคา ส่วนที่เหลือใช้ค่าเริ่มต้น"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${
              expressMode
                ? 'border-amber-300 bg-amber-100 text-amber-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Rabbit className="h-4 w-4" />
            {expressMode ? 'โหมดด่วน เปิดอยู่' : 'โหมดด่วน'}
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ─── 1. ข้อมูลรุ่น ─────────────────────────────────────────── */}
        {mode === 'ADD_VARIANT' && sourceProduct ? (
          <section className="card border-brand-200 bg-brand-50/40">
            <div className="card-body flex flex-wrap items-start gap-4">
              {(imagePreview || productImageUrl) && (
                <img src={imagePreview || productImageUrl} alt={sourceProduct.name}
                     className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  กำลังเพิ่ม SKU ในรุ่นนี้
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">{sourceProduct.name}</div>
                <div className="text-sm text-slate-500">
                  {sourceProduct.brand}
                  {sourceProduct.modelNumber && ` · ${sourceProduct.modelNumber}`}
                  {' · '}{sourceProduct.category.name}
                  {' · '}{sourceProduct.serialized ? 'นับชิ้น (IMEI)' : 'นับจำนวน (Bulk)'}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  มี {sourceProduct.variants.length} SKU อยู่แล้ว — กรอกด้านล่างเพื่อเพิ่ม SKU ที่ {sourceProduct.variants.length + 1}
                </div>
              </div>
              <Link to={`/products/${sourceProduct.id}`} className="btn-ghost text-xs">
                <ArrowLeft className="h-3.5 w-3.5" /> กลับไปดูรุ่น
              </Link>
            </div>
          </section>
        ) : (
        <section className="card">
          <div className="card-header flex items-center gap-2">
            <Package className="h-4 w-4 text-brand-600" />
            {mode === 'CLONE_TO_NEW'
              ? '1. ข้อมูลสินค้า (คัดลอกแล้ว — ตั้งชื่อใหม่)'
              : variantFields.length === 1
              ? '1. ข้อมูลสินค้า'
              : '1. ข้อมูลรุ่น (ใช้ร่วมกันทุก SKU)'}
          </div>
          <div className="card-body grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold">ประเภทสินค้า *</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all
                                    ${serialized ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" className="mt-1" checked={serialized} onChange={() => setValue('serialized', true)} />
                  <div>
                    <div className="flex items-center gap-1 font-semibold"><ScanLine className="h-4 w-4" /> นับชิ้น (IMEI)</div>
                    <div className="text-xs text-slate-500">มือถือ — แต่ละเครื่องระบุ IMEI · มือ 1/มือ 2</div>
                  </div>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all
                                    ${!serialized ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" className="mt-1" checked={!serialized} onChange={() => setValue('serialized', false)} />
                  <div>
                    <div className="flex items-center gap-1 font-semibold"><Boxes className="h-4 w-4" /> นับจำนวน (Bulk)</div>
                    <div className="text-xs text-slate-500">อุปกรณ์เสริม — นับเป็นจำนวนรวม</div>
                  </div>
                </label>
              </div>
            </div>

            {/* ── รูปสินค้า (drop image) — ใช้กับทุกรุ่นย่อย ─────────────── */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold">
                รูปสินค้า <span className="font-normal text-slate-400">(ใช้กับทุกรุ่นย่อย · ไม่บังคับ)</span>
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleImageFile(file);
                }}
                className={`flex items-stretch gap-3 rounded-xl border-2 border-dashed p-3 transition-all
                            ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}
              >
                {imagePreview ? (
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                    <img src={imagePreview} alt="product" className="h-full w-full object-cover" />
                    {uploadingImage && (
                      <div className="absolute inset-0 grid place-items-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                    {!uploadingImage && productImageUrl && (
                      <span className="absolute bottom-1 left-1 rounded bg-emerald-500/90 px-1 text-[10px] font-semibold text-white">
                        อัปแล้ว
                      </span>
                    )}
                    <button type="button" onClick={clearImage}
                            className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
                            title="ลบรูป">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="grid h-24 w-24 shrink-0 cursor-pointer place-items-center rounded-lg bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600">
                    <input type="file" accept="image/*" className="hidden"
                           onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
                    <ImageIcon className="h-7 w-7" />
                  </label>
                )}
                <div className="flex flex-1 flex-col justify-center text-sm">
                  <div className="flex items-center gap-1 font-semibold text-slate-700">
                    <Upload className="h-4 w-4" /> ลาก-วาง หรือคลิกเลือกรูป
                  </div>
                  <div className="text-xs text-slate-500">รองรับ JPG / PNG / WebP / HEIC · ขนาดไม่เกิน 10MB</div>
                  {uploadingImage && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-brand-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> กำลังอัปโหลด...
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">หมวดหมู่ *</label>
              <select className="input" {...register('categoryId', { required: 'จำเป็น' })}>
                <option value="">เลือกหมวดหมู่</option>
                {flatCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">ชื่อสินค้า *</label>
              <input className="input" placeholder="เช่น iPhone 15 Pro"
                     {...register('name', { required: 'จำเป็น' })} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            {!expressMode && (<>
              <div>
                <label className="mb-1 block text-sm font-semibold">ยี่ห้อ</label>
                <input className="input" list="brand-list" {...register('brand')} />
                <datalist id="brand-list">
                  <option value="Apple" /><option value="Samsung" /><option value="Xiaomi" />
                  <option value="OPPO" /><option value="Vivo" /><option value="Google" />
                  <option value="Huawei" /><option value="OnePlus" /><option value="realme" />
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">รุ่น (Model Number)</label>
                <input className="input" placeholder="เช่น A3293" {...register('modelNumber')} />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold">รายละเอียดเพิ่มเติม</label>
                <textarea className="input" rows={2} {...register('description')} />
              </div>
            </>)}
          </div>
        </section>
        )}

        {/* ─── 2. Variants list ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-800">
                {expressMode
                  ? 'ข้อมูลเครื่อง + ราคา'
                  : mode === 'ADD_VARIANT'
                  ? 'SKU ใหม่ + ราคา + รับสต็อก'
                  : variantFields.length === 1
                  ? '2. ราคา + รับเข้าสต็อก'
                  : <>2. สี/ความจุที่มี <span className="text-sm font-normal text-slate-500">({variantFields.length} SKU)</span></>}
              </h2>
              {!expressMode && mode === 'CREATE_NEW' && variantFields.length === 1 && (
                <p className="mt-0.5 text-xs text-slate-500">
                  💡 ขายสี/ความจุเดียว → กรอกแค่นี้พอ · มีหลายแบบ กด <strong>"+ เพิ่มสี/ความจุอื่น"</strong> ด้านล่าง
                </p>
              )}
            </div>
            {!expressMode && mode !== 'ADD_VARIANT' && (
              <div className="flex gap-2">
                <button type="button"
                        onClick={() => {
                          const last = getValues(`variants.${variantFields.length - 1}.spec`);
                          appendVariant({
                            spec: { ...last, sku: '' /* re-gen */ },
                            quantity: '',
                            items: [{ ...EMPTY_ROW, condition: defaultCondition, acquisitionType: defaultAcq }],
                          });
                        }}
                        title="คัดลอกราคา/reorder จากรุ่นย่อยล่าสุด — ประหยัดเวลาเมื่อเพิ่มหลายสี/ความจุ"
                        className="btn-secondary">
                  <Copy className="h-4 w-4" /> คัดลอกจากตัวล่าสุด
                </button>
                <button type="button"
                        onClick={() => appendVariant(newVariant(serialized ? 2 : 5))}
                        className="btn-primary">
                  <Plus className="h-4 w-4" /> เพิ่มสี/ความจุอื่น
                </button>
              </div>
            )}
          </div>

          {variantFields.map((f, idx) => (
            <VariantCard
              key={f.id}
              varIdx={idx}
              total={variantFields.length}
              productName={productName}
              serialized={serialized}
              expressMode={expressMode}
              defaultCondition={defaultCondition}
              defaultAcq={defaultAcq}
              register={register}
              control={control}
              setValue={setValue}
              getValues={getValues}
              collapsed={collapsedVariants.has(idx)}
              onToggleCollapse={() => toggleCollapse(idx)}
              onRemove={() => removeVariant(idx)}
              removable={!expressMode && variantFields.length > 1}
            />
          ))}
        </section>

        {/* ─── 3. Stock toggle + shared lot info ─────────────────────── */}
        {!expressMode && (
        <section className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-brand-600" /> 3. รับเข้าสต็อกเริ่มต้น
              <span className="ml-2 text-xs font-normal text-slate-400">(ข้ามได้ ค่อยรับเข้าทีหลัง)</span>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded" {...register('withInitialStock')} />
              เปิดรับสต็อกเริ่มต้น
            </label>
          </div>

          {withStock && (
            <div className="card-body space-y-3">
              {/* shared default condition/acquisition apply-to-all */}
              {serialized && (
                <div className="space-y-2 rounded-lg bg-slate-50/60 p-3">
                  <div className="text-xs font-semibold text-slate-500">ใช้กับเครื่องทั้งหมดในทุกรุ่นย่อย:</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">สภาพ:</span>
                      <label className="inline-flex items-center gap-1">
                        <input type="radio" checked={defaultCondition === 'NEW'} onChange={() => setDefaultCondition('NEW')} />
                        มือ 1
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input type="radio" checked={defaultCondition === 'SECOND_HAND'} onChange={() => setDefaultCondition('SECOND_HAND')} />
                        มือ 2
                      </label>
                      <button type="button" onClick={() => applyDefaultsToAll('condition')} className="btn-secondary py-1 text-xs">ปรับทุกเครื่อง</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">ที่มา:</span>
                      <select className="input w-auto py-1 text-sm" value={defaultAcq} onChange={(e) => setDefaultAcq(e.target.value as Acq)}>
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
                      <button type="button" onClick={() => applyDefaultsToAll('acq')} className="btn-secondary py-1 text-xs">ปรับทุกเครื่อง</button>
                    </div>
                  </div>
                </div>
              )}

              {/* advanced lot — only for serialized */}
              {serialized && (
                <details className="group rounded-lg border border-slate-200"
                         open={showAdvancedLot}
                         onToggle={(e) => setShowAdvancedLot((e.target as HTMLDetailsElement).open)}>
                  <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold text-slate-700">
                    <span>ตั้งค่าล็อต (ขั้นสูง) — ใช้ล็อตเดียวกันสำหรับทุกรุ่นย่อยข้างบน</span>
                    {showAdvancedLot ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </summary>
                  <div className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold">เลขล็อต <span className="font-normal text-slate-400">(ว่าง = สร้างให้)</span></label>
                      <input className="input" placeholder="LOT-AUTO" {...register('lotNo')} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold">วันที่รับเข้า</label>
                      <input type="date" className="input" {...register('importDate')} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold">หมายเหตุล็อต</label>
                      <input className="input" {...register('lotNote')} />
                    </div>
                  </div>
                </details>
              )}

              <p className="text-xs text-slate-500">
                {serialized
                  ? '💡 ใส่ IMEI แยกในแต่ละรุ่นย่อยข้างบน — ระบบจะรวมทุกเครื่องเป็นล็อตเดียว'
                  : '💡 ใส่จำนวนรับเข้าในแต่ละรุ่นย่อยข้างบน'}
              </p>
            </div>
          )}
        </section>
        )}

        {/* ─── Sticky summary footer ───────────────────────────────────── */}
        <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">สรุป:</span>
            <span className="font-semibold">{variantFields.length} รุ่นย่อย</span>
            <span>· {summary.count} {serialized ? 'เครื่อง' : 'ชิ้น'}</span>
            {summary.totalCost > 0 && (
              <span className="text-slate-600">· ต้นทุนรวม <span className="font-semibold">{formatTHB(summary.totalCost)}</span></span>
            )}
            {summary.profit > 0 && (
              <span className="hidden text-emerald-700 sm:inline">· กำไรคาดการณ์ <strong>{formatTHB(summary.profit)}</strong></span>
            )}
          </div>
          <div className="flex gap-2">
            <Link to={mode === 'ADD_VARIANT' ? `/products/${addVariantProductId}` : '/products'}
                  className="btn-secondary">ยกเลิก</Link>
            <button type="submit"
                    disabled={submit.isPending || submitAddVariant.isPending}
                    className="btn-primary">
              <Save className="h-4 w-4" />
              {(submit.isPending || submitAddVariant.isPending)
                ? 'กำลังบันทึก...'
                : mode === 'ADD_VARIANT' ? 'เพิ่ม SKU นี้'
                : 'สร้างสินค้า'}
            </button>
          </div>
        </div>
      </form>

      {showConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md animate-fade-up">
            <div className="card-body space-y-3">
              <h2 className="font-display text-xl font-bold">ยืนยันการบันทึก</h2>
              <p className="text-sm text-slate-600">
                กำลังจะสร้าง <strong>{getValues('name')}</strong>
                {' '}+ {variantFields.length} รุ่นย่อย
                {' '}+ รับเข้า <strong>{summary.count} {serialized ? 'เครื่อง' : 'ชิ้น'}</strong>
                {summary.totalCost > 0 && <> · ต้นทุนรวม <strong>{formatTHB(summary.totalCost)}</strong></>}
              </p>
              <p className="text-xs text-slate-500">
                ระบบจะรันในธุรกรรมเดียว — ถ้ามี SKU/IMEI ซ้ำจะ rollback ทั้งหมด
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowConfirm(false)} className="btn-secondary">ตรวจอีกครั้ง</button>
                <button type="button" onClick={performConfirmedSubmit} className="btn-primary">
                  <Save className="h-4 w-4" /> ยืนยัน บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ─── Variant Card ─────────────────────────────────────────────────────── */

interface VariantCardProps {
  varIdx: number;
  total: number;
  productName: string;
  serialized: boolean;
  expressMode: boolean;
  defaultCondition: Condition;
  defaultAcq: Acq;
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemove: () => void;
  removable: boolean;
}

function VariantCard({
  varIdx, total, productName, serialized, expressMode, defaultCondition, defaultAcq,
  register, control, setValue, getValues, collapsed, onToggleCollapse, onRemove, removable,
}: VariantCardProps) {
  void total;

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control, name: `variants.${varIdx}.items`,
  });

  const color = useWatch({ control, name: `variants.${varIdx}.spec.color` });
  const storage = useWatch({ control, name: `variants.${varIdx}.spec.storage` });
  const network = useWatch({ control, name: `variants.${varIdx}.spec.network` });
  const sku = useWatch({ control, name: `variants.${varIdx}.spec.sku` });
  const costPriceW = useWatch({ control, name: `variants.${varIdx}.spec.costPrice` });
  const sellingPriceW = useWatch({ control, name: `variants.${varIdx}.spec.sellingPrice` });

  const cost = Number(costPriceW) || 0;
  const sell = Number(sellingPriceW) || 0;
  const profit = sell - cost;
  const margin = cost > 0 ? (profit / cost) * 100 : 0;

  /* SKU auto-gen */
  const lastAutoSkuRef = useRef('');
  useEffect(() => {
    const suggested = generateSku(productName || '', color || '', storage || '', network || '');
    const current = getValues(`variants.${varIdx}.spec.sku`);
    if (current === '' || current === lastAutoSkuRef.current) {
      setValue(`variants.${varIdx}.spec.sku`, suggested);
      lastAutoSkuRef.current = suggested;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, color, storage, network]);

  /* Live SKU check */
  const [skuStatus, setSkuStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  useEffect(() => {
    if (!sku || sku.length < 3) { setSkuStatus('idle'); return; }
    setSkuStatus('checking');
    const t = setTimeout(async () => {
      try {
        await productsApi.lookupVariant(sku);
        setSkuStatus('taken');
      } catch {
        setSkuStatus('available');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [sku]);

  /* Markup presets */
  const applyMarkup = (pct: number) => {
    if (cost <= 0) return;
    const newPrice = Math.round(cost * (1 + pct / 100) / 10) * 10;
    setValue(`variants.${varIdx}.spec.sellingPrice`, newPrice);
  };

  /* Scanner mode */
  const [scannerMode, setScannerMode] = useState(false);
  const [scanText, setScanText] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (scannerMode) scannerRef.current?.focus(); }, [scannerMode]);

  const ingestImeis = (raw: string) => {
    const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return 0;
    const existing = getValues(`variants.${varIdx}.items`);
    const firstEmpty = existing.findIndex((it) => !it.imei && !it.serialNumber);
    let cursor = 0;
    if (firstEmpty >= 0) {
      setValue(`variants.${varIdx}.items.${firstEmpty}.imei`, tokens[cursor]);
      setValue(`variants.${varIdx}.items.${firstEmpty}.condition`, defaultCondition);
      setValue(`variants.${varIdx}.items.${firstEmpty}.acquisitionType`, defaultAcq);
      cursor++;
    }
    for (; cursor < tokens.length; cursor++) {
      appendItem({ ...EMPTY_ROW, imei: tokens[cursor], condition: defaultCondition, acquisitionType: defaultAcq });
    }
    return tokens.length;
  };
  const handleScannerKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const n = ingestImeis(scanText);
    if (n > 0) toast.success(`เพิ่ม ${n} เครื่อง`, { duration: 1200 });
    setScanText('');
  };
  const handleScannerPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const txt = e.clipboardData.getData('text');
    if (!/[\s,;]/.test(txt)) return;
    e.preventDefault();
    const n = ingestImeis(txt);
    if (n > 0) toast.success(`วาง ${n} เครื่อง`, { duration: 1200 });
    setScanText('');
  };

  const title = [color, storage].filter(Boolean).join(' ') || `รุ่นย่อย ${varIdx + 1}`;

  return (
    <div className="card overflow-hidden">
      {/* Header — clickable to collapse (ปิด click ในโหมดด่วน) */}
      <button type="button"
              onClick={expressMode ? undefined : onToggleCollapse}
              disabled={expressMode}
              className={`flex w-full items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 text-left transition-colors ${
                expressMode ? 'cursor-default' : 'hover:bg-slate-50'
              }`}>
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">
            {varIdx + 1}
          </span>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="font-mono text-[11px] text-slate-500">
              {sku || '— ยังไม่มี SKU'} {skuStatus === 'taken' && <span className="text-red-600">· ซ้ำ!</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {removable && (
            <button type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                    title="ลบรุ่นย่อยนี้">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {!expressMode && (
            collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Body — hidden when collapsed (but fields stay registered) */}
      <div className={collapsed ? 'hidden' : 'card-body space-y-4'}>
        <div className={`grid grid-cols-1 gap-3 ${expressMode ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <div>
            <label className="mb-1 block text-sm font-semibold">สี</label>
            <input className="input" list={`color-list-${varIdx}`} placeholder="Natural Titanium"
                   {...register(`variants.${varIdx}.spec.color`)} />
            <datalist id={`color-list-${varIdx}`}>{COLOR_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">ความจุ</label>
            <input className="input" list={`storage-list-${varIdx}`} placeholder="256GB"
                   {...register(`variants.${varIdx}.spec.storage`)} />
            <datalist id={`storage-list-${varIdx}`}>{STORAGE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          {!expressMode && (
            <div>
              <label className="mb-1 block text-sm font-semibold">เครือข่าย</label>
              <input className="input" list={`network-list-${varIdx}`} placeholder="TH"
                     {...register(`variants.${varIdx}.spec.network`)} />
              <datalist id={`network-list-${varIdx}`}>{NETWORK_SUGGESTIONS.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-semibold">
            SKU * <span className="text-xs font-normal text-slate-400">(ระบบสร้างให้, แก้ได้)</span>
          </label>
          <div className="relative">
            <input className={`input pr-10 font-mono ${
              skuStatus === 'taken' ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' :
              skuStatus === 'available' ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/15' : ''}`}
                   placeholder="auto"
                   {...register(`variants.${varIdx}.spec.sku`, { required: true })} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {skuStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              {skuStatus === 'available' && <Check className="h-4 w-4 text-emerald-500" />}
              {skuStatus === 'taken' && <CircleAlert className="h-4 w-4 text-red-500" />}
            </span>
          </div>
          {skuStatus === 'taken' && <p className="mt-1 text-xs font-medium text-red-600">SKU นี้มีในระบบแล้ว</p>}
        </div>

        {!expressMode && (
          <details className="group rounded-lg border border-slate-200">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>บาร์โค้ด <span className="font-normal text-slate-400">(ส่วนใหญ่ไม่ต้องใส่)</span></span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-200 p-3">
              <input className="input" placeholder="เว้นว่างได้" {...register(`variants.${varIdx}.spec.barcode`)} />
              <p className="mt-1 text-xs text-slate-500">💡 มือถือใช้ IMEI · อุปกรณ์เสริมใช้ SKU แทนได้</p>
            </div>
          </details>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-semibold">ราคาทุน *</label>
            <input type="number" step="0.01" className="input" placeholder="35000"
                   {...register(`variants.${varIdx}.spec.costPrice`, { required: true, min: 0 })} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-semibold">ราคาขาย *</label>
            <div className="flex gap-2">
              <input type="number" step="0.01" className="input flex-1" placeholder="39900"
                     {...register(`variants.${varIdx}.spec.sellingPrice`, { required: true, min: 0 })} />
              <div className="flex gap-1">
                {[10, 15, 20].map((p) => (
                  <button key={p} type="button" onClick={() => applyMarkup(p)} disabled={cost <= 0}
                          className="btn-secondary px-2 py-2 text-xs disabled:opacity-50">
                    <Zap className="h-3.5 w-3.5" />+{p}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {cost > 0 && sell > 0 && (
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            profit > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : profit < 0 ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              กำไรต่อชิ้น: <strong>{formatTHB(profit)}</strong>
              {profit > 0 && <> ({margin.toFixed(1)}%)</>}
              {profit < 0 && <> ⚠️ ขายต่ำกว่าทุน</>}
            </div>
          </div>
        )}

        {!expressMode && (
          <details className="group rounded-lg border border-slate-200">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>จุดสั่งใหม่ <span className="font-normal text-slate-400">(แนะนำ {serialized ? 2 : 5})</span></span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-200 p-3">
              <input type="number" className="input" {...register(`variants.${varIdx}.spec.reorderPoint`, { min: 0 })} />
            </div>
          </details>
        )}

        {/* ─── Stock part — bulk qty OR serialized items ──────────── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">
            สต็อกของรุ่นย่อยนี้
            {!serialized && <span className="ml-2 text-xs font-normal text-slate-500">(เว้นว่าง = ไม่รับเข้ารุ่นนี้)</span>}
          </div>

          {!serialized ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold">จำนวนรับเข้า</label>
                <input type="number" className="input" placeholder="0 = ข้าม"
                       {...register(`variants.${varIdx}.quantity`)} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setScannerMode((v) => !v)}
                        className={`btn ${scannerMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'btn-secondary'} text-sm`}>
                  <ScanLine className="h-4 w-4" />
                  {scannerMode ? 'โหมดสแกนเปิด' : 'ยิงสแกนเนอร์ / วาง IMEI'}
                </button>
                <span className="text-xs text-slate-500">ตอนนี้ {itemFields.length} เครื่อง</span>
              </div>

              {scannerMode && (
                <div className="rounded-lg border-2 border-emerald-400 bg-white p-3">
                  <label className="mb-1 block text-xs font-semibold text-emerald-700">
                    ยิงสแกนเนอร์หรือวางหลาย IMEI (กด Enter เพื่อเพิ่ม)
                  </label>
                  <input ref={scannerRef} type="text" value={scanText}
                         onChange={(e) => setScanText(e.target.value)}
                         onKeyDown={handleScannerKey}
                         onPaste={handleScannerPaste}
                         placeholder="35xxxxxxxxxxxxx"
                         className="input font-mono" />
                </div>
              )}

              {/* Header (desktop) */}
              {expressMode ? (
                <div className="hidden gap-2 rounded-md bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500 md:grid md:grid-cols-[1fr_140px_32px]">
                  <span>IMEI *</span><span>สภาพ</span><span></span>
                </div>
              ) : (
                <div className="hidden gap-2 rounded-md bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500 md:grid md:grid-cols-[1.3fr_1.3fr_110px_85px_120px_110px_32px]">
                  <span>IMEI *</span>
                  <span>Serial <span className="text-slate-400">(ไม่ใส่ = ใช้ IMEI)</span></span>
                  <span>สภาพ</span><span>แบต %</span><span>ที่มา</span><span>ราคาซื้อ</span><span></span>
                </div>
              )}

              {itemFields.map((f, iIdx) => (
                <ItemRowInputs key={f.id}
                               varIdx={varIdx} itemIdx={iIdx}
                               simplified={expressMode}
                               register={register} control={control}
                               onRemove={() => itemFields.length > 1 ? removeItem(iIdx) : null}
                               disableRemove={itemFields.length === 1} />
              ))}

              <button type="button"
                      onClick={() => appendItem({ ...EMPTY_ROW, condition: defaultCondition, acquisitionType: defaultAcq })}
                      className="btn-secondary text-sm">
                <Plus className="h-4 w-4" /> เพิ่มเครื่อง
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Item row ──────────────────────────────────────────────────────── */

interface ItemRowProps {
  varIdx: number;
  itemIdx: number;
  simplified?: boolean;
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  onRemove: () => void;
  disableRemove: boolean;
}

function ItemRowInputs({ varIdx, itemIdx, simplified, register, control, onRemove, disableRemove }: ItemRowProps) {
  const condition = useWatch({ control, name: `variants.${varIdx}.items.${itemIdx}.condition` }) ?? 'NEW';

  if (simplified) {
    // โหมดด่วน: IMEI + สภาพ + ลบ — ที่เหลือใช้ default (Serial=IMEI, batt=100, acq=PURCHASE)
    return (
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm md:grid-cols-[1fr_140px_32px] md:items-center md:gap-2 md:border-slate-100 md:p-2">
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">IMEI</label>
          <input className="input font-mono text-sm" placeholder="35xxxxxxxxxxxxx" autoFocus
                 {...register(`variants.${varIdx}.items.${itemIdx}.imei`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">สภาพ</label>
          <div className="flex gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="radio" value="NEW" {...register(`variants.${varIdx}.items.${itemIdx}.condition`)} />
              มือ 1
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" value="SECOND_HAND" {...register(`variants.${varIdx}.items.${itemIdx}.condition`)} />
              มือ 2
            </label>
          </div>
        </div>
        <div className="flex justify-end md:justify-center">
          <button type="button" disabled={disableRemove} onClick={onRemove}
                  className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-30"
                  title="ลบ">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm md:grid-cols-[1.3fr_1.3fr_110px_85px_120px_110px_32px] md:items-center md:gap-2 md:border-slate-100 md:p-2">
      <div>
        <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">IMEI</label>
        <input className="input font-mono text-sm" placeholder="35xxxxxxxxxxxxx"
               {...register(`variants.${varIdx}.items.${itemIdx}.imei`)} />
      </div>
      <div>
        <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">Serial (ไม่ใส่ = ใช้ IMEI)</label>
        <input className="input font-mono text-sm" placeholder="ปล่อยว่างได้"
               {...register(`variants.${varIdx}.items.${itemIdx}.serialNumber`)} />
      </div>
      <div>
        <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">สภาพ</label>
        <div className="flex gap-3 text-sm">
          <label className="inline-flex items-center gap-1">
            <input type="radio" value="NEW" {...register(`variants.${varIdx}.items.${itemIdx}.condition`)} />
            มือ 1
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" value="SECOND_HAND" {...register(`variants.${varIdx}.items.${itemIdx}.condition`)} />
            มือ 2
          </label>
        </div>
      </div>
      <div>
        <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">แบต %</label>
        {condition === 'NEW' ? (
          <div className="flex h-9 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-medium text-emerald-700"
               title="มือ 1 ใช้ 100%">
            <BatteryFull className="h-3.5 w-3.5" /> 100%
          </div>
        ) : (
          <input type="number" min={0} max={100} className="input text-sm" placeholder="87"
                 {...register(`variants.${varIdx}.items.${itemIdx}.batteryHealth`)} />
        )}
      </div>
      <div>
        <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">ที่มา</label>
        <select className="input text-sm" {...register(`variants.${varIdx}.items.${itemIdx}.acquisitionType`)}>
          <optgroup label="ประเภทธุรกรรม">
            {ACQ_ORDER.filter((k) => ACQ_INFO[k].group === 'TXN').map((k) => (
              <option key={k} value={k} title={ACQ_INFO[k].help}>{ACQ_INFO[k].th}</option>
            ))}
          </optgroup>
          <optgroup label="ซัพพลายเออร์">
            {ACQ_ORDER.filter((k) => ACQ_INFO[k].group === 'SUPPLIER').map((k) => (
              <option key={k} value={k} title={ACQ_INFO[k].help}>{ACQ_INFO[k].th}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div>
        <label className="mb-0.5 block text-xs font-semibold text-slate-500 md:hidden">ราคาซื้อ</label>
        <input type="number" step="0.01" className="input text-sm" placeholder="0"
               {...register(`variants.${varIdx}.items.${itemIdx}.purchasePrice`)} />
      </div>
      <div className="flex justify-end md:justify-center">
        <button type="button" disabled={disableRemove} onClick={onRemove}
                className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-30"
                title="ลบ">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
