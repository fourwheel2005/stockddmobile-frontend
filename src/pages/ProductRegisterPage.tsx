import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Control, type UseFormGetValues, type UseFormRegister, type UseFormSetValue,
  useFieldArray, useForm, useWatch,
} from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ScanLine, Boxes, Plus, Trash2, Save, Loader2, Check,
  CircleAlert, Upload, ImageIcon, X, BatteryFull, Zap, Sparkles, Copy, PackageOpen,
} from 'lucide-react';
import { categoriesApi, productsApi } from '@/api/products';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import type { AcquisitionType, ProductWizardRequest } from '@/types/api';
import { AccessorySerialList } from '@/components/products/AccessorySerialList';

/* ─── ตัวเลือกแนะนำ ─────────────────────────────────────────────────── */
/** ดึงสินค้าหน้าเดียวพอ (ร้านมีรุ่นหลักสิบ) มาทำ autocomplete เลขรุ่น */
const PRODUCT_SUGGESTION_PAGE_SIZE = 500;
/** ซ่อนโหมดยิงสแกน IMEI ไว้ก่อน (ลดความสับสน) — เก็บโค้ดไว้ เปลี่ยนเป็น true เพื่อเปิดใช้อนาคต */
const SHOW_SCANNER_MODE = false;
const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];
/** เครือข่าย/เครื่องศูนย์ — code ใช้ใน SKU, label โชว์ให้พนักงานเข้าใจ */
const NETWORK_OPTIONS: { code: string; label: string }[] = [
  { code: 'TH', label: 'ศูนย์ไทย' },
  { code: 'DS', label: 'Dual SIM (เครื่องนอก)' },
  { code: 'DN', label: 'เครื่องนอก ซิงเกิล' },
  { code: 'HK', label: 'ฮ่องกง' },
  { code: 'JP', label: 'ญี่ปุ่น' },
  { code: 'LL', label: 'อเมริกา' },
  { code: 'ZP', label: 'สิงคโปร์/เอเชีย' },
  { code: 'Intl', label: 'อินเตอร์ (ทั่วไป)' },
];
/** ประกัน — ติ๊ก "มือ 1" เติมค่านี้อัตโนมัติ (เลือก/แก้ได้) */
const WARRANTY_NEW = 'ประกันศูนย์ 1 ปี (Apple)';
const WARRANTY_OPTIONS = [
  WARRANTY_NEW,
  'ประกันร้าน 7 วัน',
  'ประกันร้าน 1 เดือน',
  'ประกันร้าน 3 เดือน',
  'ประกันร้าน 6 เดือน',
  'ไม่มีประกัน',
];
const COLOR_OPTIONS = [
  'Black', 'White', 'Blue', 'Pink', 'Yellow', 'Green', 'Red', 'Purple',
  'Natural Titanium', 'Blue Titanium', 'Black Titanium', 'White Titanium', 'Desert Titanium',
];
const BRAND_OPTIONS = ['Apple', 'Samsung', 'Xiaomi', 'OPPO', 'Vivo', 'Google', 'Huawei', 'realme'];
/** ชื่อรุ่น iPhone ทุกรุ่น (ใหม่→เก่า) — ใช้เป็น suggestion ให้ format ชื่อเหมือนกัน
 *  (สำคัญหลัง FIX-013: SKU = ชื่อรุ่น → ชื่อต่างกันนิดเดียว = variant ซ้ำ).
 *  datalist ไม่บังคับ — รุ่นอื่น (iPad/Mac/Android) ยังพิมพ์เองได้. เพิ่มรุ่นใหม่ที่เดียวตรงนี้ */
const IPHONE_MODELS = [
  'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17', 'iPhone Air',
  'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16', 'iPhone 16e',
  'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
  'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
  'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 mini',
  'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 mini',
  'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
  'iPhone SE (3rd gen)', 'iPhone SE (2nd gen)',
  'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
  'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7',
];

type Condition = 'NEW' | 'SECOND_HAND';
type ProductKind = 'phone' | 'accessory';

interface ItemRow {
  serialNumber: string;
  imei: string;
  condition: Condition;
  batteryHealth: number | '';
  deviceColor: string;
  modelNumber: string;
  deviceStorage: string;
  deviceNetwork: string;
  warrantyTerms: string;
  acquisitionType: AcquisitionType;
  purchasePrice: number | '';
}

interface FormValues {
  // ทั่วไป (Product + ส่วนตัวระบุของ Variant)
  categoryId: string;
  name: string;
  brand: string;
  modelNumber: string;
  description: string;
  serialized: boolean;
  sku: string;
  barcode: string;
  // ราคา
  costPrice: number | '';
  sellingPrice: number | '';
  reorderPoint: number;
  // สต็อก
  quantity: number | '';
  items: ItemRow[];
  lotNo: string;
  importDate: string;
  lotNote: string;
  // อุปกรณ์เสริม — lot info
  lotAcquisitionType: AcquisitionType;
  lotUnitCost: number | '';
  lotSupplierRef: string;
  lotInvoiceNo: string;
}

const EMPTY_ITEM: ItemRow = {
  serialNumber: '', imei: '',
  condition: 'NEW', batteryHealth: '', deviceColor: '', modelNumber: '',
  deviceStorage: '', deviceNetwork: '', warrantyTerms: '',
  acquisitionType: 'PURCHASE', purchasePrice: '',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* รหัสสินค้า (SKU) = running number "DDxxxxx" ออกจาก backend (/products/variants/next-sku)
   sequential ไม่ซ้ำเลย — ไม่ผูกกับชื่อรุ่นอีกต่อไป */

/* ══════════════════════════════════════════════════════════════════════ */

export function ProductRegisterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── อ่าน clone source จาก URL (?cloneProduct=&cloneFrom=) ────────── */
  const [searchParams] = useSearchParams();
  const cloneProductId = searchParams.get('cloneProduct') ?? undefined;
  const cloneVariantId = searchParams.get('cloneFrom') ?? undefined;
  const prefillName = searchParams.get('name') ?? '';
  const isClone = !!cloneProductId;

  const { register, control, handleSubmit, setValue, getValues, reset, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      categoryId: '', name: prefillName, brand: 'Apple', modelNumber: '', description: '',
      serialized: true,
      sku: '', barcode: '',
      costPrice: '', sellingPrice: '', reorderPoint: 2,
      quantity: '',
      items: [{ ...EMPTY_ITEM }],
      lotNo: '', importDate: todayIso(), lotNote: '',
      lotAcquisitionType: 'PURCHASE',
      lotUnitCost: '',
      lotSupplierRef: '',
      lotInvoiceNo: '',
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' });

  /* ─── โหลด source product (กรณีคัดลอก) ────────────────────────────── */
  const sourceProductQuery = useQuery({
    queryKey: ['product', cloneProductId],
    queryFn: () => productsApi.get(cloneProductId!),
    enabled: !!cloneProductId,
  });
  const sourceProduct = sourceProductQuery.data;

  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!sourceProduct || prefilledRef.current) return;
    prefilledRef.current = true;

    const sv = cloneVariantId
      ? sourceProduct.variants.find((v) => v.id === cloneVariantId)
      : sourceProduct.variants[0];

    reset({
      categoryId: sourceProduct.category.id,
      name: sourceProduct.name,                                  // keep — user แก้ได้
      brand: sourceProduct.brand,
      modelNumber: sourceProduct.modelNumber ?? '',
      description: sourceProduct.description ?? '',
      serialized: sourceProduct.serialized,
      sku: getValues('sku'),                                     // คงเลข running ที่ระบบออกให้ (ห้ามซ้ำ source)
      barcode: '',                                               // clear — unique constraint
      costPrice: sv?.costPrice ?? '',
      sellingPrice: sv?.sellingPrice ?? '',
      reorderPoint: sv?.reorderPoint ?? (sourceProduct.serialized ? 2 : 5),
      quantity: '',                                              // reset stock
      items: [{ ...EMPTY_ITEM }],                                // reset IMEIs
      lotNo: '', importDate: todayIso(), lotNote: '',
      lotAcquisitionType: 'PURCHASE',
      lotUnitCost: '',
      lotSupplierRef: '',
      lotInvoiceNo: '',
    });

    if (sv?.imageUrl) {
      setProductImageUrl(sv.imageUrl);
      setImagePreview(sv.imageUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProduct]);

  /** UI-only: แยกประเภทสินค้าที่เลือก (มือถือ / อุปกรณ์เสริม).
   *  - phone     → serialized=true เสมอ
   *  - accessory → toggle accessorySerialOn เพื่อสลับ serialized true/false */
  const [productKind, setProductKind] = useState<ProductKind>('phone');
  const [accessorySerialOn, setAccessorySerialOn] = useState(false);
  /** ค่าเริ่มต้นที่มา — ใช้กับอุปกรณ์เสริม (มือถือใช้ "ที่มา" รายเครื่องในแถว). */
  const [defaultAcq, setDefaultAcq] = useState<AcquisitionType>('PURCHASE');
  const [scannerMode, setScannerMode] = useState(false);
  const [scanText, setScanText] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  const [productImageUrl, setProductImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /* watchers */
  const serialized = watch('serialized');
  const name = useWatch({ control, name: 'name' });
  const skuVal = useWatch({ control, name: 'sku' });
  const costPriceW = useWatch({ control, name: 'costPrice' });
  const sellingPriceW = useWatch({ control, name: 'sellingPrice' });
  const itemsW = useWatch({ control, name: 'items' });
  const quantityW = useWatch({ control, name: 'quantity' });

  const cost = Number(costPriceW) || 0;
  const sell = Number(sellingPriceW) || 0;
  const profit = sell - cost;
  const margin = cost > 0 ? (profit / cost) * 100 : 0;

  /* รหัสสินค้า = running number "DDxxxxx" (sequential — ไม่ซ้ำเลย) จาก backend.
     โหลดเลขถัดไปมาเป็นค่าเริ่มต้น · lock เมื่อผู้ใช้พิมพ์เอง. */
  const lastAutoSkuRef = useRef('');
  const nextSkuQuery = useQuery({
    queryKey: ['next-sku'],
    queryFn: () => productsApi.nextSku(),
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    const sku = nextSkuQuery.data?.sku;
    if (!sku) return;
    const current = getValues('sku');
    if (current === '' || current === lastAutoSkuRef.current) {
      setValue('sku', sku, { shouldDirty: false });
      lastAutoSkuRef.current = sku;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextSkuQuery.data]);

  /* Live SKU check — ถ้ารหัส running ชน (race) → ขอเลขใหม่จาก backend อัตโนมัติ */
  const [skuStatus, setSkuStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  useEffect(() => {
    if (!skuVal || skuVal.length < 3) { setSkuStatus('idle'); return; }
    setSkuStatus('checking');
    const t = setTimeout(async () => {
      try {
        await productsApi.lookupVariant(skuVal);
        // ── รหัสซ้ำ ──
        if (skuVal === lastAutoSkuRef.current) {
          const fresh = await productsApi.nextSku();        // ขอเลข running ใหม่
          if (fresh.sku && fresh.sku !== skuVal) {
            lastAutoSkuRef.current = fresh.sku;
            setValue('sku', fresh.sku, { shouldDirty: false });  // → re-check → available
          } else { setSkuStatus('taken'); }
        } else {
          setSkuStatus('taken');   // user พิมพ์รหัสเอง → ให้แก้เอง
        }
      } catch { setSkuStatus('available'); }
    }, 400);
    return () => clearTimeout(t);
  }, [skuVal]);

  /* Smart reorder default when serialized toggle */
  useEffect(() => {
    const rp = getValues('reorderPoint');
    if (rp === 2 || rp === 5) setValue('reorderPoint', serialized ? 2 : 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  /* Sync serialized from UI productKind + accessorySerialOn.
   * เมื่อปิด accessorySerial: ถ้ามี items ที่มี IMEI/Serial → confirm ก่อน drop กัน data loss. */
  useEffect(() => {
    const wantSerialized = productKind === 'phone' || accessorySerialOn;
    const current = getValues('serialized');
    if (current === wantSerialized) return;

    // กำลังจะปิด serialized — ตรวจว่าผู้ใช้ใส่ข้อมูลใน items แล้วหรือยัง
    if (current && !wantSerialized) {
      const items = getValues('items') ?? [];
      const hasData = items.some((it) => (it.imei || it.serialNumber || '').trim());
      if (hasData) {
        const ok = window.confirm(
          `คุณกำลังปิดโหมด "ระบุ Serial รายชิ้น" — ข้อมูล ${items.length} แถวที่กรอกไว้จะถูกล้าง\nยืนยันหรือไม่?`,
        );
        if (!ok) {
          // ผู้ใช้ยกเลิก — กลับ checkbox เป็น on
          setAccessorySerialOn(true);
          return;
        }
      }
      // ล้าง items เหลือแถวว่าง 1 แถว
      setValue('items', [{ ...EMPTY_ITEM }], { shouldDirty: true });
    }
    setValue('serialized', wantSerialized, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKind, accessorySerialOn]);

  /* Scroll helper — แทนการสลับ tab */
  const scrollToSection = (id: string) => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /* Scanner auto-focus */
  useEffect(() => { if (scannerMode) scannerRef.current?.focus(); }, [scannerMode]);

  /* Image upload */
  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('อัปโหลดได้เฉพาะไฟล์รูป'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('ขนาดไม่เกิน 10MB'); return; }
    const localPreview = URL.createObjectURL(file);
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return localPreview; });
    setUploadingImage(true);
    try {
      const uploaded = await filesApi.upload(file);
      setProductImageUrl(uploaded.url);
      toast.success('อัปโหลดรูปสำเร็จ', { duration: 1200 });
    } catch (e) { toast.error(extractErrorMessage(e)); setProductImageUrl(''); }
    finally { setUploadingImage(false); }
  };
  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(''); setProductImageUrl('');
  };

  /** ค่าเริ่มต้นของแถวเครื่องใหม่ — ลอก สภาพ/ที่มา/สี/ความจุ/เครือข่าย จากแถวล่าสุด
   *  (รับเครื่องล็อตเดียวกันสะดวก ไม่ต้องกรอกซ้ำ) · ประกันปล่อยว่างให้ auto-fill ตามสภาพ */
  const nextItemDefaults = (): ItemRow => {
    const items = getValues('items') ?? [];
    const last = items[items.length - 1];
    if (!last) return { ...EMPTY_ITEM };
    return {
      ...EMPTY_ITEM,
      condition: last.condition ?? 'NEW',
      acquisitionType: last.acquisitionType ?? 'PURCHASE',
      deviceColor: last.deviceColor ?? '',
      deviceStorage: last.deviceStorage ?? '',
      deviceNetwork: last.deviceNetwork ?? '',
    };
  };

  /* Scanner / paste IMEIs */
  const ingestImeis = (raw: string): number => {
    const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return 0;
    const existing = getValues('items');
    const firstEmpty = existing.findIndex((it) => !it.imei && !it.serialNumber);
    let cursor = 0;
    if (firstEmpty >= 0) {
      setValue(`items.${firstEmpty}.imei`, tokens[cursor]);
      cursor++;
    }
    for (; cursor < tokens.length; cursor++) {
      append({ ...nextItemDefaults(), imei: tokens[cursor] });
    }
    return tokens.length;
  };
  const handleScannerKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const n = ingestImeis(scanText);
    if (n > 0) toast.success(`เพิ่ม ${n} เครื่อง`, { duration: 1000 });
    setScanText('');
  };
  const handleScannerPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const txt = e.clipboardData.getData('text');
    if (!/[\s,;]/.test(txt)) return;
    e.preventDefault();
    const n = ingestImeis(txt);
    if (n > 0) toast.success(`วาง ${n} เครื่อง`, { duration: 1000 });
    setScanText('');
  };

  /* Markup presets */
  const applyMarkup = (pct: number) => {
    if (cost <= 0) return;
    const newPrice = Math.round((cost * (1 + pct / 100)) / 10) * 10;
    setValue('sellingPrice', newPrice);
  };

  /* Categories */
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const flatCategories = useMemo(() =>
    (categories ?? []).flatMap((c) => [
      { id: c.id, label: c.name },
      ...(c.children ?? []).map((sub) => ({ id: sub.id, label: `${c.name} / ${sub.name}` })),
    ]), [categories]);

  /* Model-number suggestions — รวมเลขรุ่นที่เคยกรอกแล้ว มาเป็น autocomplete
     (โตเองตามการใช้งาน, ไม่ต้อง maintain list, ยังพิมพ์ค่าใหม่ได้อิสระ) */
  const { data: productPage } = useQuery({
    queryKey: ['products', 'model-number-suggestions'],
    queryFn: () => productsApi.list({ size: PRODUCT_SUGGESTION_PAGE_SIZE }),
    staleTime: 5 * 60 * 1000,
  });
  const modelNumberOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const product of productPage?.content ?? []) {
      const modelNumber = product.modelNumber?.trim();
      if (modelNumber) seen.add(modelNumber);
    }
    return [...seen].sort();
  }, [productPage]);

  /* ชื่อรุ่น suggestion: iPhone ครบทุกรุ่น (ตั้งต้น) + ชื่อรุ่นที่เคยสร้างแล้ว (เช่น iPad/Mac/Android)
     → iPhone เลือกได้เลยตั้งแต่วันแรก · รุ่นอื่นโตเองตามการใช้งาน · ยังพิมพ์ค่าใหม่ได้อิสระ */
  const modelNameOptions = useMemo(() => {
    const seen = new Set<string>(IPHONE_MODELS);
    const extras: string[] = [];
    for (const product of productPage?.content ?? []) {
      const nm = product.name?.trim();
      if (nm && !seen.has(nm)) { seen.add(nm); extras.push(nm); }
    }
    return [...IPHONE_MODELS, ...extras.sort()];
  }, [productPage]);

  /* รุ่นนี้มีในระบบแล้วไหม — match ตามชื่อรุ่น (กัน user ลงทะเบียนซ้ำรุ่นเดิม → ควร "รับสินค้าเข้า" แทน) */
  const existingProduct = useMemo(() => {
    const n = (name || '').trim().toLowerCase();
    if (!n || isClone) return null;
    return (productPage?.content ?? []).find((p) => p.name?.trim().toLowerCase() === n) ?? null;
  }, [name, productPage, isClone]);

  /* Submit */
  const submit = useMutation({
    mutationFn: (req: ProductWizardRequest) => productsApi.createWizard(req),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      toast.success(`บันทึก "${product.name}" สำเร็จ`);
      navigate(`/products/${product.id}`);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const buildPayload = (d: FormValues): ProductWizardRequest | null => {
    const blank = (s?: string) => (s && s.trim()) ? s.trim() : undefined;

    let validItems: Array<{
      serialNumber: string; imei?: string; condition?: Condition;
      batteryHealth?: number; deviceColor?: string; modelNumber?: string;
      deviceStorage?: string; deviceNetwork?: string;
      acquisitionType?: AcquisitionType; purchasePrice?: number;
      warrantyTerms?: string;
    }> | undefined;
    let qty: number | undefined;

    if (d.serialized) {
      validItems = d.items
        .filter((it) => (it.imei || it.serialNumber || '').trim())
        .map((it) => ({
          serialNumber: (it.serialNumber || it.imei).trim(),
          imei: blank(it.imei),
          condition: it.condition,
          batteryHealth: it.condition === 'NEW'
            ? 100
            : (it.batteryHealth === '' ? undefined : Number(it.batteryHealth)),
          // สี/ความจุ/เครือข่าย/เลขรุ่น/ประกัน = รายเครื่อง (รับคละในล็อตเดียวได้)
          // เลขรุ่นเว้น = ใช้ค่าระดับรุ่น (Product.modelNumber) เป็น default
          deviceColor: blank(it.deviceColor),
          modelNumber: blank(it.modelNumber) ?? blank(d.modelNumber),
          deviceStorage: blank(it.deviceStorage),
          deviceNetwork: blank(it.deviceNetwork),
          acquisitionType: it.acquisitionType,
          // เว้น = ใช้ "ราคาทุน" (ข้อ 2) เป็นทุนรายเครื่องอัตโนมัติ — ตรงตามที่ UI สัญญาไว้
          purchasePrice: it.purchasePrice === '' ? (Number(d.costPrice) || undefined) : Number(it.purchasePrice),
          warrantyTerms: blank(it.warrantyTerms),
        }));
      if (validItems.length === 0) {
        toast.error('ใส่อย่างน้อย 1 ชิ้น (IMEI หรือ Serial)');
        scrollToSection('section-stock');
        return null;
      }
    } else {
      qty = Number(d.quantity) || 0;
      if (qty <= 0) {
        toast.error('ใส่จำนวนรับเข้าให้มากกว่า 0');
        scrollToSection('section-stock');
        return null;
      }
    }

    return {
      categoryId: d.categoryId,
      name: d.name.trim(),
      brand: blank(d.brand),
      modelNumber: blank(d.modelNumber),
      description: blank(d.description),
      serialized: d.serialized,
      variants: [{
        spec: {
          // approach C: variant = ระดับรุ่น (1 รุ่น = 1 variant) — สี/ความจุ/เครือข่าย
          // อยู่รายเครื่อง จึงเว้นที่ variant (ตรงกับข้อมูล import)
          sku: d.sku.trim(),
          barcode: blank(d.barcode),
          costPrice: Number(d.costPrice),
          sellingPrice: Number(d.sellingPrice),
          reorderPoint: Number(d.reorderPoint),
          ...(productImageUrl ? { imageUrl: productImageUrl } : {}),
        },
        ...(d.serialized
          ? { items: validItems }
          : {
              quantity: qty,
              acquisitionType: d.lotAcquisitionType || 'PURCHASE',
              unitCost: d.lotUnitCost === '' ? undefined : Number(d.lotUnitCost),
              supplierRef: blank(d.lotSupplierRef),
              invoiceNo: blank(d.lotInvoiceNo),
              lotNote: blank(d.lotNote),
            }),
      }],
      ...(d.serialized ? {
        lotNo: blank(d.lotNo),
        importDate: d.importDate,
        note: blank(d.lotNote),
      } : {}),
    };
  };

  const onSubmit = (d: FormValues) => {
    if (skuStatus === 'taken') {
      toast.error('รุ่นนี้มีในระบบแล้ว — เพิ่มเครื่องด้วย "รับสินค้าเข้า" หรือเปลี่ยนรหัสถ้าเป็นรุ่นใหม่');
      scrollToSection('section-other');
      return;
    }
    const req = buildPayload(d);
    if (req) submit.mutate(req);
  };

  /* Summary */
  const summary = useMemo(() => {
    if (serialized) {
      const valid = (itemsW ?? []).filter((it) => (it?.imei || it?.serialNumber || '').trim());
      const totalCost = valid.reduce((s, it) => s + (Number(it.purchasePrice) || cost || 0), 0);
      return { count: valid.length, totalCost, totalSell: valid.length * sell };
    }
    const q = Number(quantityW) || 0;
    return { count: q, totalCost: q * cost, totalSell: q * sell };
  }, [serialized, itemsW, quantityW, cost, sell]);

  /* render */
  return (
    <div className="space-y-4 pb-32">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับไปรายการสินค้า
      </Link>

      <header>
        <h1 className="page-title flex items-center gap-2">
          {isClone ? <Copy className="h-6 w-6 text-brand-600" /> : <Sparkles className="h-6 w-6 text-brand-600" />}
          {isClone ? 'คัดลอกสินค้า' : 'ลงทะเบียนสินค้า'}
        </h1>
        <p className="page-subtitle">
          {isClone
            ? <>คัดลอกข้อมูลจาก <strong>{sourceProduct?.name ?? 'รุ่นเดิม'}</strong> มาเป็นเทมเพลต — ใส่ IMEI + สี/ความจุ รายเครื่อง แล้วบันทึก = สินค้าใหม่ 1 รายการ</>
            : '1 ครั้ง = 1 สินค้า + รับเครื่องเลย · ทุกอย่างกรอกในหน้านี้ ไม่ต้องไปไหนอีก'}
        </p>
      </header>

      {/* รุ่นนี้มีอยู่แล้ว → ไม่ต้องลงทะเบียนซ้ำ พาไป "รับสินค้าเข้า" เลย (ลด user งง) */}
      {existingProduct && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">“{existingProduct.name}” มีในระบบแล้ว</div>
              <div className="text-xs text-amber-800">
                ถ้าจะ<strong>เพิ่มเครื่องรุ่นนี้</strong> ไม่ต้องลงทะเบียนใหม่ — กดปุ่มขวาเพื่อไป “รับสินค้าเข้า” ใส่ IMEI ได้เลย
              </div>
            </div>
          </div>
          <button type="button"
                  onClick={() => navigate(`/products?q=${encodeURIComponent(existingProduct.name)}`)}
                  className="btn-primary shrink-0 whitespace-nowrap bg-amber-600 hover:bg-amber-700">
            <PackageOpen className="h-4 w-4" /> ไปรับเครื่องเข้ารุ่นนี้
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* datalist ใช้ร่วม — รายการแนะนำสำหรับช่องรายเครื่อง (สี/ความจุ/เครือข่าย/เลขรุ่น/ประกัน)
            ประกาศที่เดียว ใช้ได้ทุก ItemCard ผ่าน list="..." */}
        <datalist id="model-name-list">{modelNameOptions.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="color-list">{COLOR_OPTIONS.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="storage-list">{STORAGE_OPTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="network-list">{NETWORK_OPTIONS.map((n) => <option key={n.code} value={n.code}>{n.label}</option>)}</datalist>
        <datalist id="model-number-list">{modelNumberOptions.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="warranty-list">{WARRANTY_OPTIONS.map((w) => <option key={w} value={w} />)}</datalist>

        {/* ═════════ Section: ทั่วไป ═════════ */}
        <div id="section-general" className="card scroll-mt-4">
          <div className="card-header flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">1</span>
            <span className="font-semibold">ทั่วไป</span>
            <span className="text-xs text-slate-500">— ประเภท · ชื่อรุ่น · ยี่ห้อ · รูป</span>
          </div>
          <div className="card-body space-y-5">
              <FieldRow label="ประเภทสินค้า" required>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-all
                                     ${productKind === 'phone' ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" className="mt-1" checked={productKind === 'phone'}
                           onChange={() => { setProductKind('phone'); setAccessorySerialOn(false); }} />
                    <div>
                      <div className="flex items-center gap-1 font-semibold"><ScanLine className="h-4 w-4" /> เครื่อง (มี IMEI)</div>
                      <div className="text-xs text-slate-500">มือถือ · นับทีละเครื่อง</div>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-all
                                     ${productKind === 'accessory' ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" className="mt-1" checked={productKind === 'accessory'}
                           onChange={() => setProductKind('accessory')} />
                    <div>
                      <div className="flex items-center gap-1 font-semibold"><Boxes className="h-4 w-4" /> อุปกรณ์เสริม</div>
                      <div className="text-xs text-slate-500">เคส/สายชาร์จ · นับเป็นจำนวน หรือระบุ Serial รายชิ้น</div>
                    </div>
                  </label>
                </div>
                {productKind === 'accessory' && (
                  <label className="mt-3 flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50/50 p-3 text-sm">
                    <input type="checkbox" className="mt-0.5"
                           checked={accessorySerialOn}
                           onChange={(e) => setAccessorySerialOn(e.target.checked)} />
                    <div>
                      <div className="font-semibold text-brand-800">ระบุ Serial รายชิ้น (สำหรับอุปกรณ์เสริม)</div>
                      <div className="text-xs text-slate-600">
                        เปิดเมื่ออุปกรณ์มีเลข Serial เช่น พาวเวอร์แบงค์, หูฟัง, นาฬิกา —
                        จำนวนรับเข้า = นับจาก Serial ที่ใส่
                      </div>
                    </div>
                  </label>
                )}
              </FieldRow>

              <FieldRow label="หมวดหมู่" required>
                <select className="input" {...register('categoryId', { required: 'กรุณาเลือกหมวดหมู่' })}>
                  <option value="">— เลือกหมวดหมู่ —</option>
                  {flatCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>}
              </FieldRow>

              <FieldRow label="ชื่อรุ่น (Model)" required hint="เลือกจากรายการ iPhone หรือพิมพ์เอง (iPad/Mac/Android) · เลือกให้ตรงกันทุกครั้งจะได้รหัสสินค้าตรงกัน">
                <input className="input" list="model-name-list" placeholder="เช่น iPhone 16 Pro Max"
                       {...register('name', { required: 'กรุณาใส่ชื่อรุ่น' })} />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </FieldRow>

              <FieldRow label="ยี่ห้อ">
                <input className="input" list="brand-list" placeholder="Apple" {...register('brand')} />
                <datalist id="brand-list">{BRAND_OPTIONS.map((b) => <option key={b} value={b} />)}</datalist>
              </FieldRow>

              <FieldRow label="รูปสินค้า" hint="ลาก-วางหรือคลิกเลือก · ไม่บังคับ">
                <ImageDropZone
                  preview={imagePreview} uploaded={!!productImageUrl} uploading={uploadingImage}
                  dragOver={dragOver}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleImageFile(f); }}
                  onSelect={(f) => handleImageFile(f)} onClear={clearImage}
                />
              </FieldRow>
          </div>
        </div>

        {/* ═════════ Section: ราคา ═════════ */}
        <div id="section-price" className="card scroll-mt-4">
          <div className="card-header flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span>
            <span className="font-semibold">ราคา</span>
            <span className="text-xs text-slate-500">— ทุน · ขาย · กำไร · จุดสั่งใหม่</span>
          </div>
          <div className="card-body space-y-5">
              <FieldRow label="ราคาทุน" required hint="หน่วยเป็นบาท">
                <input type="number" step="0.01" className="input" placeholder="35000"
                       {...register('costPrice', { required: true, min: 0 })} />
              </FieldRow>

              <FieldRow label="ราคาขาย" required hint="กดปุ่ม +10/15/20% เพื่อตั้งราคาเร็วๆ">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="number" step="0.01" className="input flex-1 min-w-[140px]" placeholder="39900"
                         {...register('sellingPrice', { required: true, min: 0 })} />
                  {[10, 15, 20].map((p) => (
                    <button key={p} type="button" onClick={() => applyMarkup(p)} disabled={cost <= 0}
                            className="btn-secondary px-2 text-xs disabled:opacity-50"
                            title={`ตั้งราคาขาย = ทุน + ${p}%`}>
                      <Zap className="h-3.5 w-3.5" />+{p}%
                    </button>
                  ))}
                </div>
              </FieldRow>

              {cost > 0 && sell > 0 && (
                <FieldRow label="กำไรคาดการณ์">
                  <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    profit > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : profit < 0 ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-slate-200 bg-slate-50'}`}>
                    {profit > 0 && '💰'}{profit < 0 && '⚠️'}
                    <strong>{formatTHB(profit)}</strong>
                    {profit !== 0 && <span>({margin.toFixed(1)}%)</span>}
                    {profit < 0 && <span>ขายต่ำกว่าทุน</span>}
                  </div>
                </FieldRow>
              )}

              <FieldRow label="จุดสั่งใหม่" hint={`แนะนำ ${serialized ? 2 : 5} — เมื่อสต็อกเหลือ ≤ จำนวนนี้ ระบบเตือนผู้จัดการ`}>
                <input type="number" className="input" {...register('reorderPoint', { min: 0 })} />
              </FieldRow>
          </div>
        </div>

        {/* ═════════ Section: สต็อก ═════════ */}
        <div id="section-stock" className="card scroll-mt-4">
          <div className="card-header flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">3</span>
            <span className="font-semibold">สต็อก</span>
            <span className="text-xs text-slate-500">
              — {productKind === 'phone'
                  ? 'ใส่เครื่อง IMEI/Serial รายเครื่อง'
                  : accessorySerialOn
                    ? 'ระบุ Serial รายชิ้น (จำนวน = จำนวนแถว)'
                    : 'นับเป็นจำนวนชิ้น'}
            </span>
          </div>
          <div className="card-body space-y-5">
              {!serialized ? (<>
                <FieldRow label="จำนวนรับเข้า" required hint="หน่วย: ชิ้น · กดปุ่ม +/− หรือพิมพ์เลย">
                  <BulkQtyInput
                    value={Number(getValues('quantity')) || 0}
                    onChange={(v) => setValue('quantity', v, { shouldDirty: true, shouldValidate: true })}
                  />
                </FieldRow>

                <FieldRow label="ที่มาของ lot" hint="ระบบจะบันทึก lot history พร้อมที่มา + ทุน">
                  <select className="input" {...register('lotAcquisitionType')}>
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
                </FieldRow>

                <FieldRow label="ทุนต่อชิ้น (lot นี้)" hint="ถ้าเว้น = ใช้ราคาทุน · ระบบจะจำราคา lot นี้แยก">
                  <input type="number" step="0.01" min={0} className="input"
                         placeholder="ใช้ราคาทุนถ้าเว้น"
                         {...register('lotUnitCost')} />
                </FieldRow>

                <FieldRow label="ผู้ขาย / ใบกำกับ" hint="optional — เก็บไว้สำหรับ audit">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input className="input" placeholder="ชื่อร้าน/Supplier"
                           {...register('lotSupplierRef')} />
                    <input className="input font-mono" placeholder="เลขใบกำกับภาษี"
                           {...register('lotInvoiceNo')} />
                  </div>
                </FieldRow>
              </>) : (<>
                {/* อุปกรณ์เสริมใช้ "ที่มา" เดียวทั้งล็อต (Quick-Add ไม่มีช่องรายชิ้น).
                    มือถือ → "ที่มา" อยู่รายเครื่องในแถว (คละได้) จึงไม่โชว์ตรงนี้ */}
                {productKind === 'accessory' && (
                <FieldRow label="ที่มา" hint="แหล่งที่รับของเข้ามา (ใช้กับทุกชิ้นในล็อตนี้)">
                  <select className="input" value={defaultAcq} onChange={(e) => setDefaultAcq(e.target.value as AcquisitionType)}>
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
                </FieldRow>
                )}

                {SHOW_SCANNER_MODE && (
                <FieldRow label="โหมดสแกน" hint={`ยิงสแกนเนอร์ทีละ${productKind === 'phone' ? 'เครื่อง' : 'ชิ้น'} หรือวางหลายเลขพร้อมกัน`}>
                  <div className="space-y-2">
                    <button type="button" onClick={() => setScannerMode((v) => !v)}
                            className={`btn text-sm ${scannerMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'btn-secondary'}`}>
                      <ScanLine className="h-4 w-4" />
                      {scannerMode
                        ? `โหมดสแกนเปิด · ${fields.length} ${productKind === 'phone' ? 'เครื่อง' : 'ชิ้น'}`
                        : 'เปิดโหมดยิงสแกน'}
                    </button>
                    {scannerMode && (
                      <input ref={scannerRef} type="text" value={scanText}
                             onChange={(e) => setScanText(e.target.value)}
                             onKeyDown={handleScannerKey}
                             onPaste={handleScannerPaste}
                             placeholder={productKind === 'phone'
                               ? 'ยิงเครื่อง → กด Enter เพิ่ม หรือวางหลายบรรทัด'
                               : 'ยิง Serial → กด Enter เพิ่ม หรือวางหลายบรรทัด'}
                             className="input font-mono border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/15" />
                    )}
                  </div>
                </FieldRow>
                )}

                {productKind === 'accessory' ? (
                  /* ⚡ Bulk Quick-Add — อุปกรณ์เสริมใช้ Lot-wide defaults
                     กรอกแค่ IMEI/Serial รายตัว — ที่มา/ทุน/ประกัน ใช้ที่ตั้งใน "Lot info" ด้านบน */
                  <FieldRow
                    label="รายการ Serial (Quick-Add)"
                    hint={`${fields.filter((_, i) => getValues(`items.${i}.imei`) || getValues(`items.${i}.serialNumber`)).length} ชิ้น · ยิงสแกนได้เลย (ที่มา/ทุน/ประกัน ใช้ค่า Lot-wide)`}>
                    <AccessorySerialList
                      items={fields.map((_, i) => ({
                        imei: getValues(`items.${i}.imei`) ?? '',
                        serialNumber: getValues(`items.${i}.serialNumber`) ?? '',
                      }))}
                      onChange={(rows) => {
                        // Atomic replace — preserves React keys for stable inputs
                        const next = rows.length === 0
                          ? [{ ...EMPTY_ITEM, condition: 'NEW' as const, acquisitionType: defaultAcq }]
                          : rows.map((r) => ({
                              ...EMPTY_ITEM,
                              imei: r.imei,
                              serialNumber: r.serialNumber,
                              condition: 'NEW' as const,
                              acquisitionType: defaultAcq,
                            }));
                        replace(next);
                      }}
                    />
                  </FieldRow>
                ) : (
                  <FieldRow
                    label="รายการเครื่อง"
                    hint={`ตอนนี้ ${fields.length} เครื่อง · กรอก สี/ความจุ/เครือข่าย/ประกัน รายเครื่องได้ · แถวใหม่ลอกค่าจากแถวก่อน`}>
                    <div className="space-y-2">
                      {fields.map((f, idx) => (
                        <ItemCard key={f.id} idx={idx}
                                  register={register} control={control}
                                  setValue={setValue} getValues={getValues}
                                  onRemove={() => fields.length > 1 ? remove(idx) : null}
                                  disableRemove={fields.length === 1}
                                  unitLabel="เครื่อง" />
                      ))}
                      <button type="button"
                              onClick={() => append(nextItemDefaults())}
                              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-brand-400 bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-100">
                        <Plus className="h-5 w-5" /> เพิ่มเครื่องอีกตัว
                      </button>
                      <p className="text-center text-xs text-slate-500">
                        💡 ใส่ทุกเครื่องให้ครบก่อน แล้วกด “บันทึก” <strong>ครั้งเดียว</strong> (ไม่ต้องบันทึกทีละเครื่อง)
                      </p>
                    </div>
                  </FieldRow>
                )}
              </>)}
          </div>
        </div>

        {/* ═════════ Section: อื่นๆ ═════════ */}
        <div id="section-other" className="card scroll-mt-4">
          <div className="card-header flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">4</span>
            <span className="font-semibold">อื่นๆ</span>
            <span className="text-xs text-slate-500">— รหัสสินค้า · บาร์โค้ด · ล็อต</span>
          </div>
          <div className="card-body space-y-5">
              <FieldRow label="รหัสสินค้า" autoBadge hint="ระบบออกเลข running ให้อัตโนมัติ (DD00001, DD00002, ...) ไม่ซ้ำเลย — แก้เองได้">
                <div className="relative">
                  <input className={`input pr-10 font-mono ${
                    skuStatus === 'taken' ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
                    : skuStatus === 'available' ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/15'
                    : ''}`}
                         {...register('sku', { required: 'จำเป็น' })} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {skuStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    {skuStatus === 'available' && <Check className="h-4 w-4 text-emerald-500" />}
                    {skuStatus === 'taken' && <CircleAlert className="h-4 w-4 text-red-500" />}
                  </span>
                </div>
                {skuStatus === 'taken' && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    รุ่นนี้มีในระบบแล้ว — ถ้าจะ<strong>เพิ่มเครื่องรุ่นเดิม</strong> ให้ใช้ปุ่ม “รับสินค้าเข้า” ที่{' '}
                    <Link to="/products" className="underline">หน้าสินค้า</Link>{' '}
                    (ไม่ต้องลงทะเบียนใหม่) · หรือเปลี่ยนรหัสถ้าเป็น<strong>รุ่นใหม่จริง</strong>
                  </p>
                )}
                {skuStatus === 'available' && <p className="mt-1 text-xs font-medium text-emerald-600">รหัสนี้ใช้ได้</p>}
              </FieldRow>

              {/* บาร์โค้ด: มือถือใช้ IMEI เป็นบาร์โค้ดอยู่แล้ว → โชว์เฉพาะอุปกรณ์เสริม */}
              {productKind !== 'phone' && (
                <FieldRow label="บาร์โค้ด" hint="เว้นได้ถ้าไม่มีบาร์โค้ดเฉพาะ">
                  <input className="input" {...register('barcode')} />
                </FieldRow>
              )}

              <FieldRow label="รายละเอียด">
                <textarea className="input" rows={2} {...register('description')} />
              </FieldRow>

              {serialized && (<>
                <FieldRow label="เลขล็อต" autoBadge hint="เว้นว่าง = ระบบสร้างให้อัตโนมัติ">
                  <input className="input" placeholder="LOT-AUTO" {...register('lotNo')} />
                </FieldRow>

                <FieldRow label="วันที่นำเข้า" autoBadge hint="ค่าเริ่มต้น = วันนี้ (เปลี่ยนได้)">
                  <input type="date" className="input" {...register('importDate')} />
                </FieldRow>

                <FieldRow label="หมายเหตุล็อต">
                  <input className="input" {...register('lotNote')} />
                </FieldRow>
              </>)}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">สรุป:</span>
            <span className="font-semibold">{summary.count} {productKind === 'phone' ? 'เครื่อง' : 'ชิ้น'}</span>
            {summary.totalCost > 0 && (
              <span className="text-slate-600">ทุนรวม <span className="font-semibold">{formatTHB(summary.totalCost)}</span></span>
            )}
            {summary.totalSell > summary.totalCost && summary.count > 0 && (
              <span className="hidden text-emerald-700 sm:inline">กำไร <strong>{formatTHB(summary.totalSell - summary.totalCost)}</strong></span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/products" className="btn-secondary">ยกเลิก</Link>
            <button type="submit" disabled={submit.isPending || skuStatus === 'taken'}
                    className="btn-primary">
              <Save className="h-4 w-4" />
              {submit.isPending ? 'กำลังบันทึก...' : isClone ? 'บันทึกเป็นสินค้าใหม่' : 'บันทึก'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ─── helper components ───────────────────────────────────────────────── */

/** จำนวนรับเข้า bulk — ปุ่ม +/- + input number + quick presets */
function BulkQtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const safe = Math.max(0, Math.floor(value || 0));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, safe - 1))}
          disabled={safe <= 0}
          className="grid h-12 w-12 place-items-center rounded-lg border-2 border-slate-200 bg-white text-2xl font-bold text-slate-700 transition hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
          −
        </button>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={safe || ''}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          placeholder="0"
          className="input flex-1 text-center text-2xl font-bold"
        />
        <button
          type="button"
          onClick={() => onChange(safe + 1)}
          className="grid h-12 w-12 place-items-center rounded-lg border-2 border-slate-200 bg-white text-2xl font-bold text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700">
          +
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[5, 10, 20, 50, 100].map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => onChange(safe + v)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:border-brand-400 hover:bg-brand-50">
            + {v}
          </button>
        ))}
        {safe > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="ml-auto rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">
            ล้าง
          </button>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  label, children, required, hint, autoBadge,
}: { label: string; children: React.ReactNode; required?: boolean; hint?: string; autoBadge?: boolean }) {
  return (
    <div className="grid gap-1.5 border-b border-slate-100 pb-4 last:border-b-0 sm:grid-cols-[140px_1fr] sm:items-start sm:gap-4 sm:pb-3">
      <label className="text-sm font-semibold text-slate-700 sm:pt-2">
        {label} {required && <span className="text-red-500">*</span>}
        {autoBadge && (
          <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-slate-500">
            อัตโนมัติ
          </span>
        )}
      </label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-xs text-slate-500">💡 {hint}</p>}
      </div>
    </div>
  );
}

function ImageDropZone({
  preview, uploaded, uploading, dragOver,
  onDragOver, onDragLeave, onDrop, onSelect, onClear,
}: {
  preview: string; uploaded: boolean; uploading: boolean; dragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
         className={`flex items-stretch gap-3 rounded-xl border-2 border-dashed p-3 transition-all
                     ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}>
      {preview ? (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200">
          <img src={preview} alt="product" className="h-full w-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
          {!uploading && uploaded && (
            <span className="absolute bottom-1 left-1 rounded bg-emerald-500/90 px-1 text-[10px] font-semibold text-white">
              อัปแล้ว
            </span>
          )}
          <button type="button" onClick={onClear}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
                  title="ลบรูป">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="grid h-20 w-20 shrink-0 cursor-pointer place-items-center rounded-lg bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600">
          <input type="file" accept="image/*" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelect(f); }} />
          <ImageIcon className="h-6 w-6" />
        </label>
      )}
      <div className="flex flex-1 flex-col justify-center text-sm">
        <div className="flex items-center gap-1 font-semibold text-slate-700">
          <Upload className="h-4 w-4" /> ลาก-วาง หรือคลิกเลือก
        </div>
        <div className="text-xs text-slate-500">JPG/PNG/WebP/HEIC · ไม่เกิน 10MB</div>
      </div>
    </div>
  );
}

/* ─── card 1 เครื่อง (มือถือ-friendly) ─────────────────────────────────── */

function ItemCard({
  idx, register, control, setValue, getValues, onRemove, disableRemove, unitLabel = 'เครื่อง',
}: {
  idx: number;
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  onRemove: () => void;
  disableRemove: boolean;
  /** ป้ายหน่วยที่จะแสดงในหัว card — "เครื่อง" สำหรับมือถือ, "ชิ้น" สำหรับอุปกรณ์เสริม */
  unitLabel?: string;
}) {
  const condition = useWatch({ control, name: `items.${idx}.condition` }) ?? 'NEW';

  /* ประกันรายเครื่อง auto-fill ตามสภาพแถวนี้: มือ1 → ศูนย์ Apple, มือ2 → เว้น
     lock เมื่อผู้ใช้พิมพ์/เลือกเอง (ไม่ทับค่าที่แก้มือ) */
  const warrantyAutoRef = useRef('');
  useEffect(() => {
    const suggested = condition === 'NEW' ? WARRANTY_NEW : '';
    const cur = getValues(`items.${idx}.warrantyTerms`) ?? '';
    if (cur === '' || cur === warrantyAutoRef.current) {
      setValue(`items.${idx}.warrantyTerms`, suggested, { shouldDirty: false });
      warrantyAutoRef.current = suggested;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{unitLabel}ที่ {idx + 1}</span>
        <button type="button" disabled={disableRemove} onClick={onRemove}
                className="rounded p-1 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30"
                title={`ลบ${unitLabel}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">IMEI</label>
          <input className="input font-mono text-sm" placeholder="35xxxxxxxxxxxxx"
                 {...register(`items.${idx}.imei`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">Serial <span className="font-normal text-slate-400">(เว้น = ใช้ IMEI)</span></label>
          <input className="input font-mono text-sm" {...register(`items.${idx}.serialNumber`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">สภาพ</label>
          <div className="flex gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="radio" value="NEW" {...register(`items.${idx}.condition`)} /> มือ 1
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" value="SECOND_HAND" {...register(`items.${idx}.condition`)} /> มือ 2
            </label>
          </div>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">แบต %</label>
          {condition === 'NEW' ? (
            <div className="flex h-9 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
              <BatteryFull className="h-3.5 w-3.5" /> 100% (มือ 1)
            </div>
          ) : (
            <input type="number" min={0} max={100} className="input text-sm" placeholder="87"
                   {...register(`items.${idx}.batteryHealth`)} />
          )}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">สี</label>
          <input className="input text-sm" list="color-list" placeholder="เช่น Black"
                 {...register(`items.${idx}.deviceColor`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ความจุ</label>
          <input className="input text-sm" list="storage-list" placeholder="เช่น 256GB"
                 {...register(`items.${idx}.deviceStorage`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">เครือข่าย</label>
          <input className="input text-sm" list="network-list" placeholder="เช่น TH, DS"
                 {...register(`items.${idx}.deviceNetwork`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">เลขรุ่น</label>
          <input className="input font-mono text-sm" list="model-number-list" placeholder="เช่น MG2N4ZP/A"
                 {...register(`items.${idx}.modelNumber`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">
            ประกัน {condition === 'NEW' && <span className="font-normal text-emerald-600">(อัตโนมัติ)</span>}
          </label>
          <input className="input text-sm" list="warranty-list" placeholder="เลือก/พิมพ์ประกัน"
                 {...register(`items.${idx}.warrantyTerms`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ที่มา</label>
          <select className="input text-sm" {...register(`items.${idx}.acquisitionType`)}>
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
        {/* ราคาซื้อต่อเครื่อง: ซ่อน — auto-fill = ราคาทุน (ข้อ 2) ตอน save */}
      </div>
    </div>
  );
}
