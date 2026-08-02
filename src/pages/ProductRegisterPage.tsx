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
import { inventoryApi } from '@/api/inventory';
import { compressImage } from '@/lib/imageCompress';
import { useBranchStore } from '@/stores/branchStore';
import { WARRANTY_NEW, WARRANTY_APPLE_ACTIVATED, WARRANTY_OPTIONS, COLOR_OPTIONS, STORAGE_OPTIONS } from '@/lib/deviceOptions';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import { shopToday } from '@/lib/datetime';
import type { AcquisitionType, ProductWizardRequest } from '@/types/api';
import { AccessorySerialList } from '@/components/products/AccessorySerialList';
import { MultiImageUpload, ImageEditor } from '@/components/MultiImageUpload';
import { InstallmentPlansEditor } from '@/components/products/InstallmentPlansEditor';
import { serializePlans, type InstallmentPlan } from '@/lib/installment';

/* ─── ตัวเลือกแนะนำ ─────────────────────────────────────────────────── */
/** ดึงสินค้าหน้าเดียวพอ (ร้านมีรุ่นหลักสิบ) มาทำ autocomplete เลขรุ่น */
const PRODUCT_SUGGESTION_PAGE_SIZE = 500;
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

/** อุปกรณ์เสริม Apple ยอดนิยม — dropdown ให้เลือกง่าย ชื่อ format ตรงกัน (รหัสสินค้าไม่เพี้ยน) */
const ACCESSORY_MODELS = [
  'Apple EarPods (3.5mm Headphone Plug)',
  'Apple EarPods (Lightning Connector)',
  'Apple Lightning to USB Cable 1m',
  'Apple USB-C to Lightning Cable 1m',
  'Apple 60W USB-C Charge Cable (1m)',
  'Apple 20W USB-C Power Adapter',
  'Apple 30W USB-C Power Adapter',
  'Apple MagSafe Charger (1 m.)',
  'Apple Watch Magnetic Woven Fast Charger',
  'Apple AirTag FineWoven Key Ring',
  'หูฟังไร้สาย Apple AirPods Max - Midnight',
];

type Condition = 'NEW' | 'SECOND_HAND';
type ProductKind = 'phone' | 'accessory';

interface ItemRow {
  serialNumber: string;
  imei: string;
  condition: Condition;
  batteryHealth: number | '';
  // อุปกรณ์เครื่องมือสอง (FIX-108) — ตัวเครื่องเปล่า = ทั้งคู่ false
  hasBox: boolean;
  hasCharger: boolean;
  deviceColor: string;
  modelNumber: string;
  deviceStorage: string;
  deviceNetwork: string;
  warrantyTerms: string;
  warrantyExpire: string;
  acquisitionType: AcquisitionType;
  purchasePrice: number | '';
  sellingPrice: number | '';
  imageUrls: string[];
  // ผ่อนดาวน์ (มือ1 = ต่อรุ่น · มือ2 = ต่อเครื่อง) — เว็บหน้าร้านดึงไปแสดง
  downPayment: number | '';
  installmentTerms: { months: string; monthly: string; down?: string }[];
  installmentPromo: string;
  // มือ1: แผนผ่อนหลายแบบ (ปุ่มเลือก) ต่อรุ่น — ตั้งที่เครื่องแรกของกลุ่มสี/ความจุ
  installmentPlans: InstallmentPlan[];
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
  condition: 'NEW', batteryHealth: '', hasBox: false, hasCharger: false, deviceColor: '', modelNumber: '',
  deviceStorage: '', deviceNetwork: '', warrantyTerms: '', warrantyExpire: '',
  acquisitionType: 'PURCHASE', purchasePrice: '', sellingPrice: '', imageUrls: [],
  downPayment: '', installmentTerms: [], installmentPromo: '', installmentPlans: [],
};

const todayIso = shopToday;

/* ─── ร่างอัตโนมัติ (FIX-088) — กันข้อมูลหายตอน refresh/เผลอปิดหน้า ─────── */
const DRAFT_KEY = 'dd-register-draft-v1';
type DraftShape = {
  values: FormValues;
  accessoryImages: string[];
  productKind: ProductKind;
  accessorySerialOn: boolean;
  savedAt: number;
};
function readDraft(): DraftShape | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftShape;
    if (!d?.values || Date.now() - (d.savedAt ?? 0) > 48 * 3_600_000) return null;  // ร่างเก่าเกิน 48 ชม. ทิ้ง
    return d;
  } catch { return null; }
}

/* รหัสสินค้า running "DDxxxxx" ออกจาก backend (/products/variants/next-sku) = base
   รหัส "รายเครื่อง" = base + ลำดับเครื่อง (เครื่อง 1 = base, เครื่อง 2 = base+1, ...)
   → เครื่องแรก = variant SKU พอดี · sequential ไม่ซ้ำ */
function deviceCode(base: string, idx: number): string {
  const m = (base || '').match(/^DD(\d+)$/);
  if (!m) return base ? (idx === 0 ? base : `${base}-${idx + 1}`) : '';
  return 'DD' + String(parseInt(m[1], 10) + idx).padStart(5, '0');
}

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProduct]);

  /** UI-only: แยกประเภทสินค้าที่เลือก (มือถือ / อุปกรณ์เสริม).
   *  - phone     → serialized=true เสมอ
   *  - accessory → toggle accessorySerialOn เพื่อสลับ serialized true/false */
  const [productKind, setProductKind] = useState<ProductKind>('phone');
  // อุปกรณ์เสริมส่วนใหญ่คือ เคส/ฟิล์ม (นับจำนวน) → default ปิดโหมด serial (FIX-087)
  // ของที่มี serial (พาวเวอร์แบงค์/หูฟัง/นาฬิกา) ค่อยติ๊กเปิดเอง 1 คลิก
  const [accessorySerialOn, setAccessorySerialOn] = useState(false);
  /** รูปสินค้า (ระดับรุ่น) — อุปกรณ์เสริมใช้รูปเดียวทั้งรุ่น · เว็บหน้าร้านดึงไปแสดง (FIX-081) */
  const [accessoryImages, setAccessoryImages] = useState<string[]>([]);
  /** ค่าเริ่มต้นที่มา — ใช้กับอุปกรณ์เสริม (มือถือใช้ "ที่มา" รายเครื่องในแถว). */
  const [defaultAcq, setDefaultAcq] = useState<AcquisitionType>('PURCHASE');
  /** submit ถูกบล็อกเพราะมือ1 ขาดสี/ความจุ → ไฮไลต์ช่องรายเครื่อง (FIX-088) */
  const [flagMissingSpec, setFlagMissingSpec] = useState(false);

  /* ─── ร่างอัตโนมัติ (FIX-088) — เซฟลง localStorage ทุก 0.8s หลังพิมพ์ · เสนอกู้ตอนเปิดหน้า ── */
  const [draft, setDraft] = useState<DraftShape | null>(() => (cloneProductId ? null : readDraft()));
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isClone) return;   // โหมด clone ไม่เซฟร่าง (เทมเพลตจากรุ่นอื่น)
    const sub = watch((values) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        const hasData = (values.name ?? '').trim()
          || (values.items ?? []).some((it) => ((it?.imei ?? '') || (it?.serialNumber ?? '')).trim());
        if (!hasData) return;
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({
            values, accessoryImages, productKind, accessorySerialOn, savedAt: Date.now(),
          }));
        } catch { /* localStorage เต็ม/ปิด — ข้ามเงียบๆ */ }
      }, 800);
    });
    return () => { sub.unsubscribe(); if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [watch, isClone, accessoryImages, productKind, accessorySerialOn]);

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setDraft(null);
  };
  const restoreDraft = () => {
    if (!draft) return;
    setProductKind(draft.productKind ?? 'phone');
    setAccessorySerialOn(draft.accessorySerialOn ?? false);
    setAccessoryImages(draft.accessoryImages ?? []);
    // ร่างจาก build เก่าอาจไม่มี field ใหม่ (installmentPlans/hasBox/...) → merge default รายแถว
    // กัน undefined ระเบิดตอน build payload (กดบันทึกแล้วเงียบ) — FIX-110
    reset({
      ...draft.values,
      items: (draft.values.items ?? []).map((it) => ({ ...EMPTY_ITEM, ...it })),
    });
    setDraft(null);
    toast.success('กู้ร่างเดิมแล้ว — เช็คข้อมูลอีกรอบก่อนบันทึก');
  };

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
  /* เลขรุ่น + สี ที่เคยกรอก (distinct จาก DB) — ระบบจำให้ user หยิบซ้ำได้ (กันพิมพ์ซ้ำ/ผิด) */
  const { data: serialSuggest } = useQuery({
    queryKey: ['serial-suggestions'],
    queryFn: () => inventoryApi.serialSuggestions(),
    staleTime: 60 * 1000,
  });
  const modelNumberOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const product of productPage?.content ?? []) {
      const m = product.modelNumber?.trim(); if (m) seen.add(m);
    }
    for (const m of serialSuggest?.modelNumbers ?? []) { const v = m?.trim(); if (v) seen.add(v); }
    for (const it of itemsW ?? []) { const v = it.modelNumber?.trim(); if (v) seen.add(v); }
    return [...seen].sort();
  }, [productPage, serialSuggest, itemsW]);

  /* สี: ค่าตั้งต้น (COLOR_OPTIONS) + ที่เคยกรอก (DB) + ที่กำลังพิมพ์รอบนี้ — มีสีใหม่เพิ่มเรื่อยๆ */
  const colorOptions = useMemo(() => {
    const seen = new Set<string>(COLOR_OPTIONS);
    for (const c of serialSuggest?.colors ?? []) { const v = c?.trim(); if (v) seen.add(v); }
    for (const it of itemsW ?? []) { const v = it.deviceColor?.trim(); if (v) seen.add(v); }
    return [...seen].sort();
  }, [serialSuggest, itemsW]);

  /* ชื่อรุ่น suggestion: iPhone ครบทุกรุ่น (ตั้งต้น) + ชื่อรุ่นที่เคยสร้างแล้ว (เช่น iPad/Mac/Android)
     → iPhone เลือกได้เลยตั้งแต่วันแรก · รุ่นอื่นโตเองตามการใช้งาน · ยังพิมพ์ค่าใหม่ได้อิสระ */
  const modelNameOptions = useMemo(() => {
    // เครื่อง → รุ่น iPhone · อุปกรณ์เสริม → รายการ Apple accessory ยอดนิยม (เลือกง่าย format ตรงกัน)
    const isAccessory = productKind === 'accessory';
    const base = isAccessory ? ACCESSORY_MODELS : IPHONE_MODELS;
    const seen = new Set<string>(base);
    // โหมดอุปกรณ์เสริม: ตัดชื่อรุ่น iPhone ที่เคยสร้างออกจาก suggestion (ไม่ให้ปนในรายการอุปกรณ์เสริม)
    const phoneNames = new Set<string>(IPHONE_MODELS);
    const extras: string[] = [];
    for (const product of productPage?.content ?? []) {
      const nm = product.name?.trim();
      if (!nm || seen.has(nm)) continue;
      if (isAccessory && (phoneNames.has(nm) || /^iphone/i.test(nm))) continue;
      seen.add(nm); extras.push(nm);
    }
    return [...base, ...extras.sort()];
  }, [productPage, productKind]);

  /* รุ่นนี้มีในระบบแล้วไหม — match ตามชื่อรุ่น → กดบันทึกจะ auto-merge เข้ารุ่นเดิม (FIX-080)
     FIX-117: เช็คในโหมด clone ด้วย — เดิม clone ข้ามตัวกันซ้ำ → กดบันทึกโดยไม่เปลี่ยนชื่อ = รุ่นซ้ำเงียบๆ
     (หลักฐานจริง: iPhone 15 ตัวซ้ำเกิด 07-04 แล้วต้องตามรวมทีหลัง) */
  const existingProduct = useMemo(() => {
    const n = (name || '').trim().toLowerCase();
    if (!n) return null;
    return (productPage?.content ?? []).find((p) => p.name?.trim().toLowerCase() === n) ?? null;
  }, [name, productPage]);

  /* FIX-119: ชื่อเพี้ยนนิดเดียว ("iPhone15", เว้นวรรคเกิน) ไม่เข้า exact-match → เคยหลุดเป็นรุ่นซ้ำ
     แนะนำรุ่นเดิมที่คล้ายกัน (เทียบแบบตัดช่องว่าง + containment) — กดชิปเดียวชื่อ snap เป็นตัวจริง
     แล้วเข้า flow "เพิ่มเข้ารุ่นเดิม" ต่อทันที */
  const similarProducts = useMemo(() => {
    if (existingProduct) return [];   // ตรงเป๊ะแล้ว — แบนเนอร์เขียวจัดการต่อ
    const canon = (name || '').trim().toLowerCase().replace(/\s+/g, '');
    if (canon.length < 4) return [];
    return (productPage?.content ?? [])
      .filter((p) => p.active !== false)
      .filter((p) => {
        const pc = (p.name ?? '').trim().toLowerCase().replace(/\s+/g, '');
        return pc.length > 0 && (pc === canon || pc.includes(canon) || canon.includes(pc));
      })
      .slice(0, 5);
  }, [name, productPage, existingProduct]);

  /* รุ่นมีอยู่แล้ว → เติมหมวดหมู่ + ยี่ห้อ จากรุ่นเดิมให้อัตโนมัติ (ถ้ายังไม่ได้เลือก) — FIX-080 */
  const categoryIdW = useWatch({ control, name: 'categoryId' });
  useEffect(() => {
    if (existingProduct && !categoryIdW) {
      setValue('categoryId', existingProduct.categoryId, { shouldDirty: false });
      if (existingProduct.brand) setValue('brand', existingProduct.brand, { shouldDirty: false });
    }
  }, [existingProduct, categoryIdW, setValue]);

  /* Submit */
  const submit = useMutation({
    mutationFn: (req: ProductWizardRequest) => productsApi.createWizard(req),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      clearDraft();   // บันทึกสำเร็จ → ทิ้งร่างอัตโนมัติ (FIX-088)
      toast.success(`บันทึก "${product.name}" สำเร็จ`);
      navigate(`/products/${product.id}`);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  /* AUTO-MERGE: รุ่นมีอยู่แล้ว → เพิ่ม variant เข้ารุ่นเดิม (backend findMatchingVariant แยกมือ1/2/สี/ความจุ) — ไม่สร้างซ้ำ */
  const merge = useMutation({
    mutationFn: async ({ productId, req }: { productId: string; req: ProductWizardRequest }) => {
      for (const vb of req.variants) {
        await productsApi.addVariantWithStock(productId, {
          variant: vb,
          branchId: req.branchId,
          lotNo: req.lotNo,
          importDate: req.importDate,
          note: req.note,
        });
      }
      return productId;
    },
    onSuccess: (productId) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      qc.invalidateQueries({ queryKey: ['product', productId] });
      clearDraft();   // บันทึกสำเร็จ → ทิ้งร่างอัตโนมัติ (FIX-088)
      toast.success('เพิ่มเข้ารุ่นเดิมแล้ว (ไม่สร้างซ้ำ · แยกมือ 1/2 ให้อัตโนมัติ)');
      navigate(`/products/${productId}`);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const buildPayload = (d: FormValues): ProductWizardRequest | null => {
    const blank = (s?: string) => (s && s.trim()) ? s.trim() : undefined;

    // ผ่อนดาวน์รายเครื่อง (มือ2) → {downPayment, installmentTerms(JSON), installmentPromo}
    const instOf = (it: ItemRow) => {
      const clean = (it.installmentTerms ?? [])
        // งวดที่เว้น "บาท/เดือน" ว่าง = ไม่ครบ → ตัดทิ้ง (กัน Number('')=0 หลุดเป็น ฿0/เดือน) FIX-110
        .filter((t) => String(t.monthly).trim() !== '')
        .map((t) => {
          const down = t.down?.trim() === '' || t.down == null ? undefined : Number(t.down);
          return { months: Number(t.months), monthly: Number(t.monthly),
                   ...(down != null && Number.isFinite(down) && down >= 0 ? { down } : {}) };
        })
        .filter((t) => Number.isFinite(t.months) && t.months > 0 && Number.isFinite(t.monthly) && t.monthly >= 0);
      return {
        downPayment: it.downPayment === '' ? undefined : Number(it.downPayment),
        installmentTerms: clean.length ? JSON.stringify(clean) : undefined,
        installmentPromo: blank(it.installmentPromo),
      };
    };

    // ผ่อนดาวน์ มือ1 (ต่อรุ่น) → แผนหลายแบบ + mirror แผนแรกลง field เก่า (back-compat เว็บหน้าร้าน)
    const planOf = (it: ItemRow) => {
      const p = serializePlans(it.installmentPlans);
      return {
        downPayment: p.downPayment ?? undefined,
        installmentTerms: p.installmentTerms ?? undefined,
        installmentPromo: p.installmentPromo ?? undefined,
        installmentPlans: p.installmentPlans ?? undefined,
      };
    };

    let validItems: Array<{
      serialNumber: string; stockCode?: string; imei?: string; condition?: Condition;
      batteryHealth?: number; hasBox?: boolean; hasCharger?: boolean; deviceColor?: string; modelNumber?: string;
      deviceStorage?: string; deviceNetwork?: string;
      acquisitionType?: AcquisitionType; purchasePrice?: number; sellingPrice?: number;
      warrantyTerms?: string; warrantyExpire?: string; imageUrls?: string[];
      downPayment?: number; installmentTerms?: string; installmentPromo?: string;
      installmentPlans?: string;
    }> | undefined;
    let qty: number | undefined;

    if (d.serialized) {
      validItems = d.items
        .filter((it) => (it.imei || it.serialNumber || '').trim())
        .map((it, j) => ({
          serialNumber: (it.serialNumber || it.imei).trim(),
          // รหัสสินค้ารายเครื่อง running = base(d.sku) + ลำดับ (เครื่อง 1 = base = variant SKU)
          stockCode: deviceCode(d.sku, j) || undefined,
          imei: blank(it.imei),
          condition: it.condition,
          batteryHealth: it.condition === 'NEW'
            ? 100
            : (it.batteryHealth === '' ? undefined : Number(it.batteryHealth)),
          // อุปกรณ์เครื่องมือสอง (FIX-108) — ส่งเฉพาะมือ 2
          hasBox: it.condition !== 'NEW' ? !!it.hasBox : undefined,
          hasCharger: it.condition !== 'NEW' ? !!it.hasCharger : undefined,
          // สี/ความจุ/เครือข่าย/เลขรุ่น/ประกัน = รายเครื่อง (รับคละในล็อตเดียวได้)
          // เลขรุ่นเว้น = ใช้ค่าระดับรุ่น (Product.modelNumber) เป็น default
          deviceColor: blank(it.deviceColor),
          modelNumber: blank(it.modelNumber) ?? blank(d.modelNumber),
          deviceStorage: blank(it.deviceStorage),
          deviceNetwork: blank(it.deviceNetwork),
          acquisitionType: it.acquisitionType,
          // ราคาทุน/ขาย รายเครื่อง (FIX-022) — เว้น = fallback ราคาระดับรุ่น (สำหรับอุปกรณ์เสริม serial)
          purchasePrice: it.purchasePrice === '' ? (Number(d.costPrice) || undefined) : Number(it.purchasePrice),
          sellingPrice: it.sellingPrice === '' ? (Number(d.sellingPrice) || undefined) : Number(it.sellingPrice),
          warrantyTerms: blank(it.warrantyTerms),
          // วันหมดประกัน (FIX-025) — กรอกเมื่อเครื่อง activate แล้ว (ประกัน Apple นับจากวัน activate)
          warrantyExpire: blank(it.warrantyExpire),
          // รูปรายเครื่อง (FIX-043) — เว็บหน้าร้านดึงไปแสดง
          imageUrls: it.imageUrls?.length ? it.imageUrls : undefined,
          // ผ่อนดาวน์: มือ1 (NEW) → แผนหลายแบบ (ไป variant spec ด้านล่าง) · มือ2 → รายเครื่องนี้ (serial)
          ...(it.condition === 'NEW' ? planOf(it) : instOf(it)),
        }));
      if (validItems.length === 0) {
        toast.error('ใส่อย่างน้อย 1 ชิ้น (IMEI หรือ Serial)');
        scrollToSection('section-stock');
        return null;
      }
      // มือ 1 ต้องมีสี+ความจุ (variant ห้าม null) — กัน SKU สีว่างหลุดขึ้นเว็บ (FIX-087: บล็อกจริง)
      // เฉพาะ "มือถือ" เท่านั้น — อุปกรณ์เสริม (Quick-Add) ไม่มีช่องสี/ความจุให้กรอก
      // และบังคับ condition = NEW เสมอ → ถ้าเช็คด้วยจะบล็อกตลอดโดยแก้ไม่ได้ (FIX-083)
      const newMissing = productKind === 'phone' && validItems.some(
        (it) => it.condition === 'NEW' && (!it.deviceColor || !it.deviceStorage));
      if (newMissing) {
        setFlagMissingSpec(true);   // ไฮไลต์ช่องที่ขาดสีแดงรายเครื่อง (FIX-088)
        toast.error('มือ 1 ต้องใส่ "สี" และ "ความจุ" ให้ครบทุกเครื่อง — ช่องที่ขาดถูกไฮไลต์สีแดง',
          { duration: 5000 });
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

    // ── สร้าง variants ตามสเปกเว็บ DD ──────────────────────────────────
    // มือถือ (serialized): 1 variant = (สภาพ × สี × ความจุ)
    //   • มือ 1 (NEW): ตั้ง variant.color/storage/sellingPrice/imageUrls ครบ (เว็บอ่านมือ1จาก variant)
    //   • มือ 2 (USED): แยก variant ตามสี/ความจุเช่นกัน · ราคา/รูปจริงอยู่ที่ serial
    //   • NEW กับ USED แยกคนละ variant เสมอ (อยู่ใน key)
    // อุปกรณ์เสริม (bulk): variant เดียวตามเดิม
    let variantBlocks;
    if (d.serialized && validItems) {
      const groups = new Map<string, typeof validItems>();
      for (const it of validItems) {
        const key = `${it.condition ?? 'NEW'}|${(it.deviceColor ?? '').trim().toLowerCase()}|${(it.deviceStorage ?? '').trim().toLowerCase()}`;
        const arr = groups.get(key) ?? [];
        arr.push(it);
        groups.set(key, arr);
      }
      variantBlocks = Array.from(groups.values()).map((items) => {
        const first = items[0];
        // รูปต่อสี = รูปของเครื่องแรกในกลุ่มที่มีรูป (เว็บมือ1เอาจาก variant)
        const coverImages = items.find((x) => x.imageUrls?.length)?.imageUrls;
        return {
          spec: {
            sku: first.stockCode ?? d.sku.trim(),   // SKU variant = รหัสเครื่องแรกในกลุ่ม
            color: first.deviceColor,                // ตั้งสีที่ variant (มือ1 ห้าม null)
            storage: first.deviceStorage,
            network: first.deviceNetwork,
            costPrice: Number(first.purchasePrice) || 0,
            sellingPrice: Number(first.sellingPrice) || 0,
            reorderPoint: Number(d.reorderPoint),
            // อุปกรณ์เสริม (serial) → รูประดับรุ่น · มือถือ → รูปจากเครื่องแรกในกลุ่ม (FIX-081)
            imageUrls: productKind === 'accessory'
              ? (accessoryImages.length ? accessoryImages : undefined)
              : coverImages,
            // มือ 1 (NEW): ผ่อนเป็นต่อรุ่น → ตั้งที่ variant (จากเครื่องแรกในกลุ่ม)
            ...(first.condition === 'NEW' ? {
              downPayment: first.downPayment,
              installmentTerms: first.installmentTerms,
              installmentPromo: first.installmentPromo,
              installmentPlans: first.installmentPlans,
            } : {}),
          },
          items,
        };
      });
    } else {
      variantBlocks = [{
        spec: {
          sku: d.sku.trim(),
          barcode: blank(d.barcode),
          costPrice: Number(d.costPrice) || 0,
          sellingPrice: Number(d.sellingPrice) || 0,
          reorderPoint: Number(d.reorderPoint),
          imageUrls: accessoryImages.length ? accessoryImages : undefined,   // รูปสินค้า (FIX-081)
        },
        quantity: qty,
        acquisitionType: d.lotAcquisitionType || 'PURCHASE',
        unitCost: d.lotUnitCost === '' ? undefined : Number(d.lotUnitCost),
        supplierRef: blank(d.lotSupplierRef),
        invoiceNo: blank(d.lotInvoiceNo),
        lotNote: blank(d.lotNote),
      }];
    }

    return {
      categoryId: d.categoryId,
      name: d.name.trim(),
      brand: blank(d.brand),
      modelNumber: blank(d.modelNumber),
      description: blank(d.description),
      serialized: d.serialized,
      branchId: useBranchStore.getState().activeBranchId ?? undefined,  // รับเข้าสาขาที่เลือก (Phase 2A)
      variants: variantBlocks,
      ...(d.serialized ? {
        lotNo: blank(d.lotNo),
        importDate: d.importDate,
        note: blank(d.lotNote),
      } : {}),
    };
  };

  const onSubmit = (d: FormValues) => {
    const req = buildPayload(d);
    if (!req) return;
    // รุ่นมีอยู่แล้ว → auto-merge เข้ารุ่นเดิม (backend แยกมือ1/2/สี/ความจุ) — ข้ามเช็ค SKU ซ้ำ เพราะ findMatchingVariant จัดการเอง
    if (existingProduct) {
      // โหมด clone: เจตนาคือ "สร้างรุ่นใหม่ที่คล้ายกัน" — ชื่อชนรุ่นเดิมต้องถามก่อน ไม่สร้างซ้ำเงียบๆ (FIX-117)
      if (isClone && !confirm(
        `ชื่อ "${existingProduct.name}" มีในระบบแล้ว\n\n` +
        `OK = เพิ่มเครื่องเข้า "รุ่นเดิม" (ไม่สร้างรุ่นซ้ำ)\n` +
        `Cancel = กลับไปตั้งชื่อรุ่นใหม่ก่อนบันทึก`)) {
        scrollToSection('section-general');
        return;
      }
      merge.mutate({ productId: existingProduct.id, req });
      return;
    }
    if (skuStatus === 'taken') {
      toast.error('รุ่นนี้มีในระบบแล้ว — เพิ่มเครื่องด้วย "รับสินค้าเข้า" หรือเปลี่ยนรหัสถ้าเป็นรุ่นใหม่');
      scrollToSection('section-other');
      return;
    }
    submit.mutate(req);
  };

  /* Summary — มือถือคิดราคารายเครื่อง · อุปกรณ์เสริมใช้ราคาระดับรุ่น */
  const summary = useMemo(() => {
    if (serialized) {
      const valid = (itemsW ?? []).filter((it) => (it?.imei || it?.serialNumber || '').trim());
      const totalCost = valid.reduce((s, it) => s + (Number(it.purchasePrice) || cost || 0), 0);
      const totalSell = valid.reduce((s, it) => s + (Number(it.sellingPrice) || sell || 0), 0);
      return { count: valid.length, totalCost, totalSell };
    }
    const q = Number(quantityW) || 0;
    return { count: q, totalCost: q * cost, totalSell: q * sell };
  }, [serialized, itemsW, quantityW, cost, sell]);

  /* render */
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-32">
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
        <div className="flex flex-col gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-emerald-900">
            <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-semibold">“{existingProduct.name}” มีในระบบแล้ว — ไม่ต้องลงทะเบียนซ้ำ</div>
              <div className="text-xs text-emerald-800">
                ทางที่แนะนำ: กด <strong>"รับเข้ารุ่นเดิมเลย"</strong> — ฟอร์มรับเข้าจับสี/มือให้อัตโนมัติ ·
                (ถ้ายังกดบันทึกในหน้านี้ ระบบจะเพิ่มเข้ารุ่นเดิมให้ ไม่สร้างซ้ำ)
              </div>
            </div>
          </div>
          {/* FIX-114: CTA หลักพาไปรับเข้าทันที (เดิม merge เงียบตอน submit — ผู้ใช้ไม่รู้ว่าเกิดอะไร) */}
          <button type="button"
                  onClick={() => navigate(`/products/${existingProduct.id}?receive=1`)}
                  className="btn-primary shrink-0 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
            <PackageOpen className="h-4 w-4" /> รับเข้ารุ่นเดิมเลย
          </button>
        </div>
      )}

      {/* กู้ร่างอัตโนมัติ (FIX-088) — มีร่างค้างจากรอบก่อน (refresh/เผลอปิด) */}
      {draft && !isClone && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
          <div className="text-sm text-sky-900">
            📝 <strong>มีร่างที่พิมพ์ค้างไว้</strong>
            {(draft.values?.name ?? '').trim() && <> — {draft.values.name}</>}
            {(() => {
              const n = (draft.values?.items ?? []).filter(
                (it) => ((it?.imei ?? '') || (it?.serialNumber ?? '')).trim()).length;
              return n > 0 ? <> · {n} เครื่อง</> : null;
            })()}
            <span className="ml-1 text-xs text-sky-700">(ระบบบันทึกให้อัตโนมัติ)</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={restoreDraft} className="btn-primary bg-sky-600 hover:bg-sky-700">
              กู้ร่างเดิม
            </button>
            <button type="button" onClick={clearDraft} className="btn-secondary">ทิ้งร่าง</button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          // กันเผลอ: กด Enter ในช่อง input แล้ว submit ทั้งฟอร์ม (บันทึก+รับของ) โดยไม่ตั้งใจ
          // → บล็อก Enter เฉพาะ <input> (textarea ขึ้นบรรทัดใหม่ได้ · ปุ่ม "บันทึก" กด Enter ได้ปกติ)
          const el = e.target as HTMLElement;
          if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault();
        }}
        className="space-y-4">

        {/* datalist ใช้ร่วม — รายการแนะนำสำหรับช่องรายเครื่อง (สี/ความจุ/เครือข่าย/เลขรุ่น/ประกัน)
            ประกาศที่เดียว ใช้ได้ทุก ItemCard ผ่าน list="..." */}
        <datalist id="model-name-list">{modelNameOptions.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="color-list">{colorOptions.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="storage-list">{STORAGE_OPTIONS.map((s) => <option key={s} value={s} />)}</datalist>
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

              <FieldRow label="ชื่อรุ่น (Model)" required hint={productKind === 'accessory'
                ? 'เลือกจากรายการอุปกรณ์เสริม Apple หรือพิมพ์เอง · เลือกให้ตรงกันทุกครั้งจะได้รหัสสินค้าตรงกัน'
                : 'เลือกจากรายการ iPhone หรือพิมพ์เอง (iPad/Mac/Android) · เลือกให้ตรงกันทุกครั้งจะได้รหัสสินค้าตรงกัน'}>
                <input className="input" list="model-name-list"
                       placeholder={productKind === 'accessory' ? 'เช่น Apple 20W USB-C Power Adapter' : 'เช่น iPhone 16 Pro Max'}
                       {...register('name', { required: 'กรุณาใส่ชื่อรุ่น' })} />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                {/* FIX-119: ชื่อคล้ายรุ่นที่มีอยู่ → กดชิปเพื่อใช้ชื่อตรงแล้วเพิ่มเข้ารุ่นเดิม (กันรุ่นซ้ำจาก typo) */}
                {similarProducts.length > 0 && (
                  <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    ⚠️ มีรุ่นชื่อคล้ายกันอยู่แล้ว — ถ้าตั้งใจเพิ่มเครื่องเข้า <strong>รุ่นเดิม</strong> กดเลือกเลย (กันสร้างรุ่นซ้ำ):
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {similarProducts.map((p) => (
                        <button key={p.id} type="button"
                                onClick={() => setValue('name', p.name, { shouldDirty: true })}
                                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </FieldRow>

              <FieldRow label="ยี่ห้อ">
                <input className="input" list="brand-list" placeholder="Apple" {...register('brand')} />
                <datalist id="brand-list">{BRAND_OPTIONS.map((b) => <option key={b} value={b} />)}</datalist>
              </FieldRow>

              {/* อุปกรณ์เสริม: รูปสินค้า (ระดับรุ่น) — เว็บหน้าร้านดึงไปแสดง · มือถือใช้รูปรายเครื่องด้านล่าง (FIX-081) */}
              {productKind === 'accessory' && (
                <FieldRow label="รูปสินค้า" hint="หลายรูปได้ · รูปแรก = ปก · เว็บหน้าร้านดึงไปแสดง">
                  <ImageEditor value={accessoryImages} onChange={setAccessoryImages} />
                </FieldRow>
              )}

          </div>
        </div>

        {/* ═════════ Section: ราคา — เฉพาะอุปกรณ์เสริม ═════════
            มือถือ: ทุน/ขายอยู่รายเครื่องใน "สต็อก" · จุดสั่งใหม่ย้ายไปท้าย Section สต็อก (FIX-087) */}
        {productKind === 'accessory' && (
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
        )}

        {/* ═════════ Section: สต็อก ═════════ */}
        <div id="section-stock" className="card scroll-mt-4">
          <div className="card-header flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{productKind === 'phone' ? 2 : 3}</span>
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
                    hint={`ตอนนี้ ${fields.length} เครื่อง · แถวใหม่ลอก สี/ความจุ/สภาพ/ที่มา อัตโนมัติ · ปุ่ม "คัดลอกจากเครื่องก่อนหน้า" ลอกครบทั้งแถว (รวมราคา/ประกัน)`}>
                    <div className="space-y-2">
                      {fields.map((f, idx) => (
                        <ItemCard key={f.id} idx={idx}
                                  register={register} control={control}
                                  setValue={setValue} getValues={getValues}
                                  onRemove={() => fields.length > 1 ? remove(idx) : null}
                                  disableRemove={fields.length === 1}
                                  unitLabel="เครื่อง" baseSku={skuVal}
                                  flagMissingSpec={flagMissingSpec} />
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

              {/* มือถือ: จุดสั่งใหม่อยู่ท้ายสต็อก (Section ราคา ซ่อนไปแล้ว — ทุน/ขายอยู่รายเครื่อง) (FIX-087) */}
              {productKind === 'phone' && (
                <FieldRow label="จุดสั่งใหม่" hint="แนะนำ 2 — เมื่อสต็อกเหลือ ≤ จำนวนนี้ ระบบเตือนผู้จัดการ">
                  <input type="number" className="input" {...register('reorderPoint', { min: 0 })} />
                </FieldRow>
              )}
          </div>
        </div>

        {/* ═════════ Section: อื่นๆ ═════════ */}
        <div id="section-other" className="card scroll-mt-4">
          <div className="card-header flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{productKind === 'phone' ? 3 : 4}</span>
            <span className="font-semibold">อื่นๆ</span>
            <span className="text-xs text-slate-500">— รายละเอียดเพิ่มเติม</span>
          </div>
          <div className="card-body space-y-5">
              {/* มือถือ: รหัสสินค้าเป็น "รายเครื่อง" (DD running) แสดงในส่วนที่ 3 แล้ว → ซ่อนที่นี่
                  อุปกรณ์เสริม: รหัสระดับรุ่น (bulk รหัสเดียว) → โชว์ */}
              {productKind === 'accessory' && (
              <FieldRow label="รหัสสินค้า" autoBadge hint="ระบบออกเลข running ให้อัตโนมัติ (DD00001, ...) ไม่ซ้ำเลย — แก้เองได้">
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
              )}

              {/* บาร์โค้ด: มือถือใช้ IMEI เป็นบาร์โค้ดอยู่แล้ว → โชว์เฉพาะอุปกรณ์เสริม */}
              {productKind !== 'phone' && (
                <FieldRow label="บาร์โค้ด" hint="เว้นได้ถ้าไม่มีบาร์โค้ดเฉพาะ">
                  <input className="input" {...register('barcode')} />
                </FieldRow>
              )}

              <FieldRow label="รายละเอียด">
                <textarea className="input" rows={2} {...register('description')} />
              </FieldRow>
              {/* เลขล็อต/วันที่นำเข้า/หมายเหตุล็อต — ตัด UI ออกให้ง่าย (FIX-044)
                  ระบบใส่ให้อัตโนมัติ: lotNo auto-gen · วันที่นำเข้า = วันนี้ */}
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
            <button type="submit"
                    disabled={submit.isPending || merge.isPending || (skuStatus === 'taken' && !existingProduct)}
                    className={`btn-primary ${existingProduct ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}>
              <Save className="h-4 w-4" />
              {submit.isPending || merge.isPending ? 'กำลังบันทึก...'
                : existingProduct ? 'เพิ่มเข้ารุ่นเดิม'
                : isClone ? 'บันทึกเป็นสินค้าใหม่' : 'บันทึก'}
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

/* ─── card 1 เครื่อง (มือถือ-friendly) ─────────────────────────────────── */

function ItemCard({
  idx, register, control, setValue, getValues, onRemove, disableRemove, unitLabel = 'เครื่อง', baseSku = '',
  flagMissingSpec = false,
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
  /** รหัส running ตัวแรก (base) — รหัสเครื่องนี้ = base + idx */
  baseSku?: string;
  /** submit ถูกบล็อกเพราะมือ1 ขาดสี/ความจุ → ไฮไลต์ช่องที่ขาดสีแดง (FIX-088) */
  flagMissingSpec?: boolean;
}) {
  const condition = useWatch({ control, name: `items.${idx}.condition` }) ?? 'NEW';
  // อุปกรณ์เครื่องมือสอง (FIX-108) — ตัวเครื่องเปล่า = ไม่มีทั้งกล่องและสายชาร์จ
  const hasBox = useWatch({ control, name: `items.${idx}.hasBox` }) ?? false;
  const hasCharger = useWatch({ control, name: `items.${idx}.hasCharger` }) ?? false;
  const warrantyTerms = useWatch({ control, name: `items.${idx}.warrantyTerms` }) ?? '';
  /* เครื่อง activate แล้ว → โชว์ช่อง "ประกันถึงวันที่" (ประกัน Apple นับจากวัน activate) */
  const needsExpireDate = warrantyTerms === WARRANTY_APPLE_ACTIVATED || /activate/i.test(warrantyTerms);

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

  /* รูปรายเครื่อง — อัปโหลดหลายรูป เก็บใน items.${idx}.imageUrls (เว็บหน้าร้านดึงไปแสดง) */
  const images = (useWatch({ control, name: `items.${idx}.imageUrls` }) as string[] | undefined) ?? [];
  const [imgUploading, setImgUploading] = useState(false);
  const [imgDrag, setImgDrag] = useState(false);
  /* มือ1: รูปเป็นระดับรุ่น/สี (เว็บอ่านจาก variant = รูปเครื่องแรกของกลุ่มสี×ความจุ)
     → เครื่องถัดไปสี/ความจุเดียวกัน ใช้รูปร่วมอัตโนมัติ ไม่ต้องอัปซ้ำ (FIX-086) */
  const allItems = (useWatch({ control, name: 'items' }) as FormValues['items'] | undefined) ?? [];
  const norm = (s?: string) => (s ?? '').trim().toLowerCase();
  const me = allItems[idx];
  const sharedFromIdx = condition === 'NEW'
    ? allItems.findIndex((x, i) =>
        i < idx && (x.condition ?? 'NEW') === 'NEW'
        && norm(x.deviceColor) === norm(me?.deviceColor)
        && norm(x.deviceStorage) === norm(me?.deviceStorage)
        && (x.imageUrls?.length ?? 0) > 0)
    : -1;
  const autoShared = sharedFromIdx >= 0 && images.length === 0;
  const [forceOwnImages, setForceOwnImages] = useState(false);

  /* ผ่อนมือ1: ระบบเก็บผ่อนจาก "เครื่องแรกของกลุ่มสี×ความจุ" เท่านั้น (variant-level)
     → เครื่องถัดไปกลุ่มเดียวกัน ยุบ editor เป็นโน้ต กันกรอกแล้วถูกทิ้งเงียบๆ (FIX-088) */
  const instFirstIdx = condition === 'NEW'
    ? allItems.findIndex((x, i) =>
        i < idx && (x.condition ?? 'NEW') === 'NEW'
        && norm(x.deviceColor) === norm(me?.deviceColor)
        && norm(x.deviceStorage) === norm(me?.deviceStorage))
    : -1;

  /* คัดลอกทั้งแถวจากเครื่องก่อนหน้า — ทุกช่องยกเว้น IMEI/Serial/รูป (FIX-088) */
  const copyFromPrev = () => {
    const prev = getValues(`items.${idx - 1}`);
    if (!prev) return;
    (['condition', 'batteryHealth', 'hasBox', 'hasCharger', 'deviceColor', 'deviceStorage', 'deviceNetwork',
      'modelNumber', 'acquisitionType', 'purchasePrice', 'sellingPrice',
      'warrantyTerms', 'warrantyExpire'] as const)
      .forEach((k) => setValue(`items.${idx}.${k}`, prev[k], { shouldDirty: true }));
    toast.success(`คัดลอกจาก${unitLabel}ที่ ${idx} แล้ว (ยกเว้น IMEI/Serial/รูป)`, { duration: 1500 });
  };

  /* ใช้ทุน/ขายของแถวนี้กับทุกเครื่อง (FIX-088) */
  const applyPriceToAll = () => {
    const cost = getValues(`items.${idx}.purchasePrice`);
    const sell = getValues(`items.${idx}.sellingPrice`);
    (getValues('items') ?? []).forEach((_, i) => {
      if (i === idx) return;
      setValue(`items.${i}.purchasePrice`, cost, { shouldDirty: true });
      setValue(`items.${i}.sellingPrice`, sell, { shouldDirty: true });
    });
    toast.success('ใช้ราคานี้กับทุกเครื่องแล้ว', { duration: 1500 });
  };

  /* ไฮไลต์ช่องสี/ความจุที่มือ1 ยังไม่กรอก (หลัง submit ถูกบล็อก) */
  const missColor = flagMissingSpec && condition === 'NEW' && !(me?.deviceColor ?? '').trim();
  const missStorage = flagMissingSpec && condition === 'NEW' && !(me?.deviceStorage ?? '').trim();
  const setImages = (next: string[]) => setValue(`items.${idx}.imageUrls`, next, { shouldDirty: true });
  /* ผ่อนดาวน์ มือ2 (ต่อเครื่อง) — งวดหลายช่วง (single plan) */
  const instTerms = (useWatch({ control, name: `items.${idx}.installmentTerms` }) as { months: string; monthly: string; down?: string }[] | undefined) ?? [];
  const setInstTerms = (next: { months: string; monthly: string; down?: string }[]) => setValue(`items.${idx}.installmentTerms`, next, { shouldDirty: true });
  /* ผ่อนดาวน์ มือ1 (ต่อรุ่น) — แผนหลายแบบ (ปุ่มเลือก) */
  const plans = (useWatch({ control, name: `items.${idx}.installmentPlans` }) as InstallmentPlan[] | undefined) ?? [];
  const setPlans = (next: InstallmentPlan[]) => setValue(`items.${idx}.installmentPlans`, next, { shouldDirty: true });
  const uploadImages = async (files: File[]) => {
    const ok = files.filter((f) => {
      if (!f.type.startsWith('image/')) { toast.error(`"${f.name}" ไม่ใช่ไฟล์รูป`); return false; }
      if (f.size > 25 * 1024 * 1024) { toast.error(`"${f.name}" เกิน 25MB`); return false; }
      return true;
    });
    if (!ok.length) return;
    setImgUploading(true);
    try {
      const compressed = await Promise.all(ok.map((f) => compressImage(f)));
      const up = await Promise.all(compressed.map((f) => filesApi.upload(f, { normalize: true })));
      setImages([...images, ...up.map((u) => u.url)]);
      toast.success(`อัปโหลด ${up.length} รูป`, { duration: 1000 });
    } catch (e) { toast.error(extractErrorMessage(e)); }
    finally { setImgUploading(false); }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
          {unitLabel}ที่ {idx + 1}
          {baseSku && deviceCode(baseSku, idx) && (
            <span className="rounded bg-brand-100 px-1.5 py-0.5 font-mono text-[11px] text-brand-700">
              รหัส: {deviceCode(baseSku, idx)}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {idx > 0 && (
            <button type="button" onClick={copyFromPrev}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    title={`คัดลอกทุกช่องจาก${unitLabel}ที่ ${idx} (ยกเว้น IMEI/Serial/รูป)`}>
              <Copy className="h-3 w-3" /> คัดลอกจาก{unitLabel}ก่อนหน้า
            </button>
          )}
          <button type="button" disabled={disableRemove} onClick={onRemove}
                  className="rounded p-1 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30"
                  title={`ลบ${unitLabel}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">IMEI <span className="font-normal text-slate-400">(15 หลัก)</span></label>
          {(() => {
            const imeiReg = register(`items.${idx}.imei`);
            return (
              <input
                className="input font-mono text-sm"
                placeholder="35xxxxxxxxxxxxx"
                inputMode="numeric"
                maxLength={15}
                {...imeiReg}
                onChange={(e) => {
                  // IMEI = เลขล้วน สูงสุด 15 หลัก (กันพิมพ์/วางตัวอักษรหรือเกิน)
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 15);
                  imeiReg.onChange(e);
                }}
              />
            );
          })()}
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
            // h-[38px] = ความสูง .input จริง (py-2 + text-sm + border) — บรรทัดฐานตรงกับช่องข้างเคียง
            <div className="flex h-[38px] items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
              <BatteryFull className="h-3.5 w-3.5" /> 100% (มือ 1)
            </div>
          ) : (
            <input type="number" min={0} max={100} className="input text-sm" placeholder="87"
                   {...register(`items.${idx}.batteryHealth`)} />
          )}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">
            สี {condition === 'NEW' && <span className="font-normal text-red-500">*มือ 1 ต้องใส่</span>}
          </label>
          <input className={`input text-sm ${missColor ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
                 list="color-list" placeholder="เช่น Black"
                 {...register(`items.${idx}.deviceColor`)} />
          {missColor && <p className="mt-0.5 text-[11px] text-red-600">ยังไม่ใส่สี</p>}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">
            ความจุ {condition === 'NEW' && <span className="font-normal text-red-500">*มือ 1 ต้องใส่</span>}
          </label>
          <input className={`input text-sm ${missStorage ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
                 list="storage-list" placeholder="เช่น 256GB"
                 {...register(`items.${idx}.deviceStorage`)} />
          {missStorage && <p className="mt-0.5 text-[11px] text-red-600">ยังไม่ใส่ความจุ</p>}
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
          {needsExpireDate && (
            <div className="mt-1.5 rounded-md border border-sky-200 bg-sky-50 p-2">
              <label className="mb-0.5 block text-[11px] font-semibold text-sky-800">
                ประกันถึงวันที่ (Apple activate แล้ว)
              </label>
              <input type="date" className="input text-sm"
                     {...register(`items.${idx}.warrantyExpire`)} />
              <p className="mt-0.5 text-[10px] text-sky-700">
                เครื่องเปิดใช้แล้ว — ประกัน Apple นับจากวัน activate ระบุวันหมดให้ตรงกับเครื่อง
              </p>
            </div>
          )}
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
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-slate-600">ราคาทุน (บาท)</label>
          <input type="number" step="0.01" min={0} className="input text-sm" placeholder="เช่น 19500"
                 {...register(`items.${idx}.purchasePrice`)} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-semibold text-emerald-700">ราคาขาย (บาท)</label>
          <input type="number" step="0.01" min={0} className="input text-sm" placeholder="เช่น 22900"
                 {...register(`items.${idx}.sellingPrice`)} />
          {allItems.length > 1 && (
            <button type="button" onClick={applyPriceToAll}
                    className="mt-1 text-[11px] text-emerald-700 underline decoration-dotted underline-offset-2 hover:text-emerald-800"
                    title="เอาทุน/ขายของแถวนี้ ไปใส่ให้ทุกเครื่อง">
              ⚡ ใช้ราคานี้กับทุกเครื่อง
            </button>
          )}
        </div>
      </div>

      {/* อุปกรณ์ที่มากับเครื่องมือสอง (FIX-108) — มีกล่อง / มีสายชาร์จ / ตัวเครื่องเปล่า */}
      {condition !== 'NEW' && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm">
          <span className="text-xs font-semibold text-slate-600">อุปกรณ์ที่มากับเครื่อง:</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" {...register(`items.${idx}.hasBox`)} /> มีกล่อง
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" {...register(`items.${idx}.hasCharger`)} /> มีสายชาร์จ
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!hasBox && !hasCharger}
                   onChange={(e) => {
                     if (e.target.checked) {
                       setValue(`items.${idx}.hasBox`, false);
                       setValue(`items.${idx}.hasCharger`, false);
                     }
                   }} />
            ตัวเครื่องเปล่า
          </label>
        </div>
      )}

      {/* รูปเครื่องนี้ (รายเครื่อง) — เว็บหน้าร้านดึงไปแสดง · รูปแรก = ปก
          มือ1: เครื่องถัดไปสี/ความจุเดียวกัน ใช้รูปร่วมอัตโนมัติ (FIX-086) */}
      <div className="mt-2">
        {autoShared && !forceOwnImages ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 text-xs text-emerald-800">
            <span>🖼 <strong>ใช้รูปร่วมกับ{unitLabel}ที่ {sharedFromIdx + 1} อัตโนมัติ</strong> (มือ1 สี/ความจุเดียวกัน — เว็บโชว์รูปเดียวกัน ไม่ต้องอัปซ้ำ)</span>
            <button type="button" onClick={() => setForceOwnImages(true)}
                    className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100">
              อัปรูปแยกเฉพาะเครื่องนี้
            </button>
          </div>
        ) : (
          <>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              รูปเครื่องนี้ <span className="font-normal text-slate-400">
                {condition === 'NEW'
                  ? '(มือ1 · อัปเครื่องแรกพอ — เครื่องอื่นสีเดียวกันใช้รูปนี้อัตโนมัติ · รูปแรก = ปก)'
                  : '(หลายรูปได้ · รูปแรก = ปก)'}
              </span>
            </label>
            <MultiImageUpload
              images={images} uploading={imgUploading} dragOver={imgDrag}
              onDragOver={(e) => { e.preventDefault(); setImgDrag(true); }}
              onDragLeave={() => setImgDrag(false)}
              onDrop={(e) => { e.preventDefault(); setImgDrag(false); uploadImages(Array.from(e.dataTransfer.files || [])); }}
              onSelect={(files) => uploadImages(files)}
              onRemove={(i) => setImages(images.filter((_, k) => k !== i))}
              onMakeCover={(i) => { if (i <= 0) return; const n = [...images]; const [p] = n.splice(i, 1); n.unshift(p); setImages(n); }}
            />
          </>
        )}
      </div>

      {/* ผ่อนดาวน์ — เว็บหน้าร้านดึงไปแสดง (มือ1 = ต่อสี/ความจุ ตั้งที่เครื่องแรกของกลุ่ม · มือ2 = ต่อเครื่อง)
          เครื่องมือ1 ถัดไปกลุ่มเดียวกัน → ยุบเป็นโน้ต (ระบบใช้ของเครื่องแรกเท่านั้น — กันกรอกแล้วถูกทิ้ง) (FIX-088) */}
      {instFirstIdx >= 0 ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-xs text-amber-800">
          💳 <strong>ผ่อนดาวน์: ใช้ตาม{unitLabel}ที่ {instFirstIdx + 1} อัตโนมัติ</strong> (มือ1 สี/ความจุเดียวกัน ตั้งครั้งเดียวที่เครื่องแรก)
        </div>
      ) : condition === 'NEW' ? (
        /* มือ1 · แผนหลายแบบ (ปุ่มเลือก) ต่อรุ่น — ตั้งครั้งเดียวใช้ทั้งสี/ความจุนี้ */
        <div className="mt-2">
          <InstallmentPlansEditor value={plans} onChange={setPlans} />
        </div>
      ) : (
      <div className="mt-2 space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
          💳 ผ่อนดาวน์ <span className="font-normal text-amber-700">(มือ2 · รายเครื่องนี้) — เว้นว่างได้</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-600">เงินดาวน์ (บาท)</label>
            <input type="number" min={0} className="input text-sm" placeholder="เช่น 6990"
                   {...register(`items.${idx}.downPayment`)} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-600">โปรโมชัน (ถ้ามี)</label>
            <input className="input text-sm" placeholder="เช่น ฟรีฟิล์ม+เคส"
                   {...register(`items.${idx}.installmentPromo`)} />
          </div>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-600">ค่างวด (เพิ่มได้หลายช่วง)</label>
          <div className="space-y-1.5">
            {instTerms.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input type="number" min={1} className="input w-20 text-sm" placeholder="งวด"
                       value={t.months}
                       onChange={(e) => setInstTerms(instTerms.map((x, k) => (k === i ? { ...x, months: e.target.value } : x)))} />
                <span className="text-[11px] text-slate-500">เดือน ×</span>
                <input type="number" min={0} className="input w-28 text-sm" placeholder="บาท/เดือน"
                       value={t.monthly}
                       onChange={(e) => setInstTerms(instTerms.map((x, k) => (k === i ? { ...x, monthly: e.target.value } : x)))} />
                <span className="text-[11px] text-slate-500">· ดาวน์</span>
                <input type="number" min={0} className="input w-28 text-sm" placeholder="เว้น=ค่าเริ่มต้น"
                       value={t.down ?? ''}
                       title="เงินดาวน์เฉพาะงวดนี้ · เว้นว่าง = ใช้ดาวน์เริ่มต้นด้านบน"
                       onChange={(e) => setInstTerms(instTerms.map((x, k) => (k === i ? { ...x, down: e.target.value } : x)))} />
                <button type="button" className="rounded p-1 text-red-500 hover:bg-red-50"
                        onClick={() => setInstTerms(instTerms.filter((_, k) => k !== i))} title="ลบช่วงนี้">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setInstTerms([...instTerms, { months: '', monthly: '', down: '' }])}
                    className="text-xs font-medium text-amber-700 hover:text-amber-900">+ เพิ่มงวด</button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
