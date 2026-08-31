import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Plus, ScanLine, Save, AlertTriangle, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { useBranchStore } from '@/stores/branchStore';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { formatTHB } from '@/lib/format';
import { shopToday } from '@/lib/datetime';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import {
  NETWORK_OPTIONS, STORAGE_OPTIONS, WARRANTY_NEW, WARRANTY_OPTIONS, warrantyNeedsExpire,
} from '@/lib/deviceOptions';
import { ImageEditor } from '@/components/MultiImageUpload';
import { InstallmentPlansEditor } from '@/components/products/InstallmentPlansEditor';
import { AccessorySerialInboundModal } from './AccessorySerialInboundModal';
import { isAccessoryProduct } from '@/lib/productKind';
import { serializePlans, type InstallmentPlan } from '@/lib/installment';
import type {
  AcquisitionType, ProductDetail, VariantResponse, WizardInitialItem, WizardVariantBlock,
} from '@/types/api';

/**
 * ฟอร์มรับเข้า "หนึ่งเดียว" ของสินค้ามือถือ (FIX-112 → FIX-114) — หลายสี/หลายมือ กดบันทึกครั้งเดียว
 * ครอบทุกเคสที่เดิมแยก 3 ฟอร์ม: รับเข้าระดับรุ่น · เพิ่มสีใหม่ (สร้าง SKU อัตโนมัติ) · รับเข้าเจาะจง SKU
 * (ผ่าน prop initialVariant = prefill สี/ความจุ/มือ ของ SKU นั้น)
 *
 * ส่งผ่าน POST /products/wizard ซึ่งฝั่ง backend:
 *  - reuse product ตามชื่อ (FIX-100 กันรุ่นซ้ำ)
 *  - จับ SKU เดิมตาม มือ+สี+ความจุ ของ SKU (FIX-113 — SKU ขายหมดก็ match, ไม่มีทางลงผิดมือ)
 *  - รวมทุกเครื่องเป็น StockLot เดียว (เก็บผู้ขาย/ใบกำกับใน note เหมือนฟอร์มเดิม)
 */

type Cond = 'NEW' | 'SECOND_HAND';

/* FIX-116: สี/ความจุ/มือ เป็นข้อมูลของ "เครื่อง" — อยู่ในแถวเครื่องเท่านั้น (เดิมมีช่องค่าเริ่มต้นซ้ำ
   แล้วแถวที่เว้นว่างสืบทอดแบบมองไม่เห็น → เสี่ยงเครื่องคละสีตกไป SKU สีของค่าเริ่มต้นเงียบๆ)
   เครื่องใหม่คัดลอกค่าจากเครื่องก่อนหน้า — เห็นค่าจริงในช่อง แก้ได้ ไม่มีการสืบทอดล่องหน */
interface DeviceRow {
  imei: string;
  serialNumber: string;
  color: string;          // จำเป็น (จับ SKU)
  storage: string;        // จำเป็น (จับ SKU)
  condition: Cond;
  batteryHealth: string;  // มือ 2
  purchasePrice: string;  // เว้น = ทุน/เครื่อง ของล็อต
  sellingPrice: string;   // มือ 2 ควรตั้งรายเครื่อง · มือ 1 เว้น = ราคา SKU
  // รายละเอียดเพิ่มเติม (พับเก็บ) — ครบเท่ารายเครื่องของหน้า "สร้างรุ่นใหม่" (FIX-118)
  extraOpen: boolean;
  modelNumber: string;      // เลขรุ่นรายเครื่อง (เว้น = ใช้เลขรุ่นระดับรุ่น)
  deviceNetwork: string;    // เว้น = ใช้เครือข่ายของล็อต
  acquisitionOverride: AcquisitionType | '';   // เว้น = ใช้ที่มาของล็อต
  warrantyTerms: string;    // เว้น = มือ1 ใช้ประกันศูนย์ default · มือ2 ไม่ระบุ
  warrantyExpire: string;   // YYYY-MM-DD (เช่น มือ2 ประกันศูนย์ activate แล้วเหลือถึงวันที่)
  hasBox: boolean;          // อุปกรณ์เครื่องมือสอง (FIX-108)
  hasCharger: boolean;
  imageUrls: string[];
  // ผ่อนรายเครื่อง (มือ 2) — เว็บหน้าร้านดึงไปแสดง
  downPayment: string;
  instPromo: string;
  instTerms: { months: string; monthly: string; down: string }[];
}

const EMPTY_ROW: DeviceRow = {
  imei: '', serialNumber: '', color: '', storage: '', condition: 'NEW',
  batteryHealth: '', purchasePrice: '', sellingPrice: '',
  extraOpen: false, modelNumber: '', deviceNetwork: '', acquisitionOverride: '',
  warrantyTerms: '', warrantyExpire: '', hasBox: false, hasCharger: false, imageUrls: [],
  downPayment: '', instPromo: '', instTerms: [],
};

/** เครื่องใหม่ลอก สี/ความจุ/มือ/เลขรุ่น/เครือข่าย/ที่มา/ราคา จากเครื่องล่าสุด
 *  (เคลียร์ IMEI/Serial/แบต/รูป/ประกัน/อุปกรณ์/ผ่อน — เป็นของเฉพาะเครื่อง) */
const cloneRow = (last: DeviceRow): DeviceRow => ({
  ...EMPTY_ROW,
  color: last.color, storage: last.storage, condition: last.condition,
  modelNumber: last.modelNumber, deviceNetwork: last.deviceNetwork,
  acquisitionOverride: last.acquisitionOverride,
  purchasePrice: last.purchasePrice, sellingPrice: last.sellingPrice,
});

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** รหัสเครื่อง running จาก base "DDxxxxx" + ลำดับ (เหมือน AddVariantModal) */
const deviceCode = (base: string, idx: number) => {
  const m = (base || '').match(/^DD(\d+)$/);
  if (!m) return base ? (idx === 0 ? base : `${base}-${idx + 1}`) : '';
  return 'DD' + String(parseInt(m[1], 10) + idx).padStart(5, '0');
};

export interface ProductFastInboundModalProps {
  product: ProductDetail;
  /** เปิดจากปุ่ม 📥 ท้ายแถว SKU — prefill สี/ความจุ/มือ ของ SKU นั้น (แก้รายแถวได้เหมือนเดิม) */
  initialVariant?: VariantResponse;
  onClose: () => void;
  onDone: () => void;
}

/** แยก business ตั้งแต่ประตูเข้า: accessory กรอก Barcode/SN; device คงฟอร์มรายเครื่องเดิม. */
export function ProductFastInboundModal(props: ProductFastInboundModalProps) {
  if (isAccessoryProduct(props.product)) {
    return <AccessorySerialInboundModal {...props} />;
  }
  return <DeviceFastInboundModal {...props} />;
}

function DeviceFastInboundModal({ product, initialVariant, onClose, onDone }: ProductFastInboundModalProps) {
  useModalChrome(onClose);
  const qc = useQueryClient();

  const activeVariants = product.variants.filter((v) => v.active);
  const colorOptions = Array.from(new Set(activeVariants.map((v) => (v.color ?? '').trim()).filter(Boolean))).sort();
  const storageOptions = Array.from(new Set(activeVariants.map((v) => (v.storage ?? '').trim()).filter(Boolean))).sort();

  // autocomplete เลขรุ่น/สี จาก DB distinct — ชุดเดียวกับหน้า "สร้างรุ่นใหม่" (FIX-118)
  const { data: serialSuggest } = useQuery({
    queryKey: ['serial-suggestions'],
    queryFn: () => inventoryApi.serialSuggestions(),
    staleTime: 60 * 1000,
  });
  const colorList = Array.from(new Set([...colorOptions, ...(serialSuggest?.colors ?? [])])).sort();
  const modelList = Array.from(new Set([
    ...(product.modelNumber ? [product.modelNumber] : []),
    ...(serialSuggest?.modelNumbers ?? []),
  ])).sort();

  // ─── ข้อมูลระดับ "ล็อต" (ที่มา/ทุน/เอกสาร/เครือข่าย) — สี/ความจุ/มือ อยู่ที่แถวเครื่อง (FIX-116)
  const [batchNetwork, setBatchNetwork] = useState(initialVariant?.network ?? '');
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>('PURCHASE');
  const [unitCost, setUnitCost] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');
  // แผนผ่อน มือ 1 — ใช้กับ SKU มือ1 ที่ "สร้างใหม่" รอบนี้ (SKU เดิมตั้งที่ปุ่มแก้ไขเหมือนเดิม)
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [plansOpen, setPlansOpen] = useState(false);

  // ─── เครื่องรายตัว ──────────────────────────────────────────────────
  // แถวแรก prefill จาก SKU ที่กดมา (📥 ท้ายแถว) หรือความจุเดียวที่รุ่นมี
  const [rows, setRows] = useState<DeviceRow[]>([{
    ...EMPTY_ROW,
    color: initialVariant?.color ?? '',
    storage: initialVariant?.storage ?? (storageOptions.length === 1 ? storageOptions[0] : ''),
    condition: initialVariant?.condition === 'SECOND_HAND' ? 'SECOND_HAND' : 'NEW',
  }]);
  const patchRow = (i: number, patch: Partial<DeviceRow>) =>
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

  const [scannerMode, setScannerMode] = useState(false);
  const [scanText, setScanText] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  const ingestImeis = (raw: string): number => {
    const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return 0;
    setRows((prev) => {
      const next = [...prev];
      const firstEmpty = next.findIndex((r) => !r.imei && !r.serialNumber);
      let cursor = 0;
      if (firstEmpty >= 0) next[firstEmpty] = { ...next[firstEmpty], imei: tokens[cursor++] };
      for (; cursor < tokens.length; cursor++) {
        next.push({ ...cloneRow(next[next.length - 1] ?? EMPTY_ROW), imei: tokens[cursor] });
      }
      return next;
    });
    return tokens.length;
  };

  // ─── สรุปกลุ่ม (สภาพ×สี×ความจุ) + เช็คว่าจับ SKU เดิมได้ไหม ─────────
  const filled = rows.filter((r) => (r.imei || r.serialNumber).trim());
  const groups = useMemo(() => {
    const map = new Map<string, { color: string; storage: string; condition: Cond; count: number; matched: boolean }>();
    for (const r of filled) {
      const color = r.color.trim();
      const storage = r.storage.trim();
      const key = `${r.condition}|${norm(color)}|${norm(storage)}`;
      const g = map.get(key);
      if (g) { g.count += 1; continue; }
      // จับคู่แบบเดียวกับ backend (FIX-113): มือ+สี+ความจุ · SKU ยังไม่ผูกมือ (condition null) = adopt ได้
      const matched = activeVariants.some(
        (v) => norm(v.color) === norm(color) && norm(v.storage) === norm(storage)
            && (v.condition == null || v.condition === r.condition));
      map.set(key, { color, storage, condition: r.condition, count: 1, matched });
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const unitCostNum = Number(unitCost);
  const costDeviationWarning = useMemo(() => {
    if (!unitCostNum) return null;
    const refs = activeVariants.map((v) => v.costPrice ?? 0).filter((c) => c > 0);
    if (refs.length === 0) return null;
    const nearest = refs.reduce((a, b) => (Math.abs(b - unitCostNum) < Math.abs(a - unitCostNum) ? b : a));
    return Math.abs(unitCostNum - nearest) / nearest > 0.3
      ? `⚠️ ทุนต่างจาก SKU เดิมที่ใกล้สุด (${formatTHB(nearest)}) เกิน 30% — ตรวจอีกครั้ง`
      : null;
  }, [unitCostNum, activeVariants]);

  const submit = useMutation({
    mutationFn: async () => {
      if (filled.length === 0) throw new Error('ใส่อย่างน้อย 1 เครื่อง (IMEI หรือ Serial)');
      // สี+ความจุจำเป็นทุกเครื่อง — ไม่งั้นจับ SKU ไม่ได้ (จะไปสร้าง SKU no-spec)
      const missing = filled
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => !r.color.trim() || !r.storage.trim());
      if (missing.length > 0) {
        throw new Error(`เครื่องที่ ${missing.map(({ i }) => i + 1).join(', ')} ยังไม่มีสี/ความจุ — ใส่ให้ครบทุกแถว`);
      }
      // IMEI/Serial ซ้ำกันเองในฟอร์ม → แจ้งก่อนส่ง (backend ก็เช็กซ้ำอีกชั้น)
      const dupCheck = new Set<string>();
      for (const r of filled) {
        const key = (r.imei || r.serialNumber).trim();
        if (!dupCheck.add(key)) throw new Error(`IMEI/Serial ซ้ำในฟอร์ม: ${key}`);
      }
      // สี/ความจุที่ไม่ตรง SKU เดิมเลย → ยืนยันก่อน (กันพิมพ์ผิดสร้าง SKU ขยะ)
      const fresh = groups.filter((g) => !g.matched);
      if (fresh.length > 0) {
        const list = fresh.map((g) => `• ${g.color} ${g.storage} (${g.condition === 'NEW' ? 'มือ 1' : 'มือ 2'}) × ${g.count}`).join('\n');
        if (!confirm(`สี/ความจุเหล่านี้ยังไม่มีใน SKU ของรุ่นนี้ — ระบบจะสร้าง SKU ใหม่ให้:\n${list}\n\nถ้าตั้งใจพิมพ์สีนี้จริง กด OK · ถ้าพิมพ์ผิด กด Cancel แล้วแก้`)) {
          throw new Error('ยกเลิก — แก้สี/ความจุแล้วบันทึกใหม่');
        }
      }

      const { sku: base } = await productsApi.nextSku();   // running DD ไม่ซ้ำ (ไล่ทั้งชุด)
      // ตารางผ่อนรายเครื่อง มือ2 → JSON แบบเดียวกับหน้าสร้างรุ่นใหม่ (กรองแถวไม่ครบทิ้ง)
      const termsJson = (terms: DeviceRow['instTerms']): string | undefined => {
        const clean = terms
          .map((t) => {
            const down = t.down.trim() === '' ? undefined : Number(t.down);
            return { months: Number(t.months), monthly: Number(t.monthly),
                     ...(down != null && Number.isFinite(down) && down >= 0 ? { down } : {}) };
          })
          .filter((t) => Number.isFinite(t.months) && t.months > 0 && Number.isFinite(t.monthly) && t.monthly >= 0);
        return clean.length ? JSON.stringify(clean) : undefined;
      };
      const items: (WizardInitialItem & { _key: string })[] = filled.map((r, i) => {
        const isNew = r.condition === 'NEW';
        return {
          _key: `${r.condition}|${norm(r.color)}|${norm(r.storage)}`,
          serialNumber: (r.serialNumber || r.imei).trim(),
          imei: r.imei.trim() || undefined,
          stockCode: deviceCode(base, i),
          condition: r.condition,
          batteryHealth: isNew ? 100 : (r.batteryHealth === '' ? undefined : Number(r.batteryHealth)),
          hasBox: !isNew ? r.hasBox : undefined,          // อุปกรณ์เครื่องมือสอง (FIX-108)
          hasCharger: !isNew ? r.hasCharger : undefined,
          deviceColor: r.color.trim(),
          deviceStorage: r.storage.trim(),
          deviceNetwork: (r.deviceNetwork || batchNetwork).trim() || undefined,
          modelNumber: r.modelNumber.trim() || product.modelNumber || undefined,
          acquisitionType: r.acquisitionOverride || acquisitionType,
          purchasePrice: r.purchasePrice !== '' ? Number(r.purchasePrice) : (unitCostNum || undefined),
          sellingPrice: r.sellingPrice === '' ? undefined : Number(r.sellingPrice),
          warrantyTerms: r.warrantyTerms.trim() || (isNew ? WARRANTY_NEW : undefined),
          warrantyExpire: r.warrantyExpire.trim() || undefined,
          imageUrls: r.imageUrls.length ? r.imageUrls : undefined,
          // ผ่อนรายเครื่อง — มือ 2 เท่านั้น (มือ 1 ใช้แผนต่อรุ่นด้านล่าง)
          downPayment: !isNew && r.downPayment !== '' ? Number(r.downPayment) : undefined,
          installmentTerms: !isNew ? termsJson(r.instTerms) : undefined,
          installmentPromo: !isNew ? (r.instPromo.trim() || undefined) : undefined,
        };
      });

      // จัดกลุ่ม (สภาพ|สี|ความจุ) — แต่ละกลุ่ม = 1 VariantBlock · backend จับเข้า SKU เดิม/สร้างใหม่เอง
      const grouped = new Map<string, WizardInitialItem[]>();
      for (const { _key, ...it } of items) {
        const arr = grouped.get(_key) ?? [];
        arr.push(it);
        grouped.set(_key, arr);
      }
      const blocks: WizardVariantBlock[] = Array.from(grouped.values()).map((grp) => {
        const first = grp[0];
        // spec ใช้จริงเฉพาะกรณีสร้าง SKU ใหม่ (กลุ่มที่จับ SKU เดิมได้ backend ข้าม spec)
        // ราคาอ้างอิง: เอา SKU มือเดียวกันก่อน (ราคามือ1/มือ2 ต่างกันมาก) แล้วค่อย fallback สี/ความจุตรง
        const sameSpec = activeVariants.filter(
          (v) => norm(v.color) === norm(first.deviceColor) && norm(v.storage) === norm(first.deviceStorage));
        const ref = sameSpec.find((v) => v.condition === first.condition) ?? sameSpec[0];
        const isNewGroup = first.condition === 'NEW';
        const cover = grp.find((x) => x.imageUrls?.length)?.imageUrls;   // รูป SKU ใหม่ = เครื่องแรกที่มีรูป
        const inst = serializePlans(plans);   // แผนผ่อน มือ1 → เฉพาะ SKU มือ1 (SKU เดิม backend ข้าม spec)
        return {
          spec: {
            sku: first.stockCode!,
            color: first.deviceColor,
            storage: first.deviceStorage,
            network: batchNetwork.trim() || undefined,
            costPrice: Number(first.purchasePrice) || ref?.costPrice || 0,
            sellingPrice: Number(first.sellingPrice) || ref?.sellingPrice || 0,
            reorderPoint: ref?.reorderPoint ?? 5,
            imageUrls: cover,
            ...(isNewGroup ? {
              downPayment: inst.downPayment ?? undefined,
              installmentTerms: inst.installmentTerms ?? undefined,
              installmentPromo: inst.installmentPromo ?? undefined,
              installmentPlans: inst.installmentPlans ?? undefined,
            } : {}),
          },
          items: grp,
        };
      });

      return productsApi.createWizard({
        categoryId: product.category.id,
        name: product.name,
        brand: product.brand,
        modelNumber: product.modelNumber ?? undefined,
        serialized: true,
        branchId: useBranchStore.getState().activeBranchId ?? undefined,
        variants: blocks,
        importDate: shopToday(),
        note: [note, supplierRef && `ผู้ขาย: ${supplierRef}`, invoiceNo && `INV: ${invoiceNo}`]
          .filter(Boolean).join(' · ') || undefined,
      });
    },
    onSuccess: (detail) => {
      toast.success(`รับ ${filled.length} เครื่อง (${groups.length} กลุ่มสี/มือ) เข้าคลังแล้ว — lot เดียว`);
      // ชื่อรุ่นชนกับรุ่นซ้ำที่ยังไม่ได้รวม → backend อาจเลือกอีก record (FIX-100 dedup ยังไม่ล้าง)
      if (detail.id !== product.id) {
        toast('⚠️ เครื่องถูกรวมเข้ารุ่นชื่อเดียวกันอีกรายการ — ตรวจที่หน้าสินค้า / รวมรุ่นซ้ำ', { duration: 6000 });
      }
      qc.invalidateQueries({ queryKey: ['product'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      qc.invalidateQueries({ queryKey: ['variant-search'] });
      onDone();
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">

        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold">📥 รับเข้าเครื่อง — {product.name}</h2>
            <p className="text-xs text-slate-500">หลายสี/หลายมือ ในครั้งเดียว · ระบบจับเข้า SKU เดิมให้ตาม สภาพ+สี+ความจุ</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* ข้อมูลระดับล็อต — สี/ความจุ/มือ อยู่ที่แถวเครื่องด้านล่าง (FIX-116) */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">ข้อมูลล็อต <span className="font-normal text-slate-400">(ใช้ร่วมกันทุกเครื่องในบิลนี้)</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">เครือข่าย</label>
                <input className="input text-sm" list="pfi-networks" placeholder="เช่น TH / ZP"
                       value={batchNetwork} onChange={(e) => setBatchNetwork(e.target.value)} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">ที่มา</label>
                <select className="input text-sm" value={acquisitionType}
                        onChange={(e) => setAcquisitionType(e.target.value as AcquisitionType)}>
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
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">ทุน/เครื่อง (บาท)</label>
                <input type="number" step="0.01" min={0} className="input text-sm" placeholder="เช่น 45800"
                       value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">ผู้ขาย / Supplier</label>
                <input className="input text-sm" placeholder="ชื่อร้าน" value={supplierRef}
                       onChange={(e) => setSupplierRef(e.target.value)} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">เลขใบกำกับ</label>
                <input className="input font-mono text-sm" placeholder="INV-..." value={invoiceNo}
                       onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
            </div>
            {costDeviationWarning && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {costDeviationWarning}
              </div>
            )}
            <datalist id="pfi-colors">{colorList.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="pfi-storages">
              {Array.from(new Set([...storageOptions, ...STORAGE_OPTIONS])).map((s) => <option key={s} value={s} />)}
            </datalist>
            <datalist id="pfi-networks">{NETWORK_OPTIONS.map((n) => <option key={n} value={n} />)}</datalist>
            <datalist id="pfi-models">{modelList.map((m) => <option key={m} value={m} />)}</datalist>
          </div>

          {/* รายการเครื่อง */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium">รายการเครื่อง (IMEI/Serial)</label>
              <button
                type="button"
                onClick={() => { setScannerMode((v) => !v); setTimeout(() => scannerRef.current?.focus(), 0); }}
                className={`btn text-xs ${scannerMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'btn-secondary'}`}>
                <ScanLine className="h-3.5 w-3.5" />
                {scannerMode ? `โหมดสแกน · ${rows.length} เครื่อง` : 'โหมดยิงสแกน'}
              </button>
            </div>
            {scannerMode && (
              <input
                ref={scannerRef}
                type="text"
                value={scanText}
                onChange={(e) => setScanText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const n = ingestImeis(scanText);
                  if (n > 0) toast.success(`เพิ่ม ${n} เครื่อง`, { duration: 1000 });
                  setScanText('');
                }}
                onPaste={(e) => {
                  const txt = e.clipboardData.getData('text');
                  if (/[\s,;]/.test(txt)) {
                    e.preventDefault();
                    const n = ingestImeis(txt);
                    if (n > 0) toast.success(`วาง ${n} เครื่อง`, { duration: 1000 });
                    setScanText('');
                  }
                }}
                placeholder="ยิง → Enter เพื่อเพิ่ม / วางหลายบรรทัด"
                className="input border-emerald-400 font-mono"
              />
            )}
            {rows.map((r, idx) => {
              const isSecond = r.condition === 'SECOND_HAND';
              return (
                <div key={idx} className="space-y-1.5 rounded border border-slate-100 bg-slate-50 p-2">
                  <div className="grid grid-cols-12 gap-2">
                    <span className="col-span-1 self-center text-xs font-semibold text-slate-500">{idx + 1}.</span>
                    <input
                      className="input col-span-5 font-mono text-sm"
                      placeholder="IMEI" inputMode="numeric" maxLength={15}
                      value={r.imei}
                      onChange={(ev) => patchRow(idx, { imei: ev.target.value.replace(/\D/g, '').slice(0, 15) })}
                    />
                    <input
                      className="input col-span-4 font-mono text-sm"
                      placeholder="Serial (เว้น=ใช้ IMEI)"
                      value={r.serialNumber}
                      onChange={(ev) => patchRow(idx, { serialNumber: ev.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={rows.length === 1}
                      className="col-span-2 rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30">
                      <X className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-6 sm:grid-cols-6">
                    <input className="input text-xs" list="pfi-colors" placeholder="สี *"
                           value={r.color} onChange={(ev) => patchRow(idx, { color: ev.target.value })} />
                    <input className="input text-xs" list="pfi-storages" placeholder="ความจุ *"
                           value={r.storage} onChange={(ev) => patchRow(idx, { storage: ev.target.value })} />
                    <select className="input text-xs" value={r.condition}
                            onChange={(ev) => patchRow(idx, { condition: ev.target.value as Cond })}>
                      <option value="NEW">มือ 1</option>
                      <option value="SECOND_HAND">มือ 2</option>
                    </select>
                    {isSecond ? (
                      <input type="number" min={0} max={100} className="input text-xs" placeholder="แบต %"
                             value={r.batteryHealth} onChange={(ev) => patchRow(idx, { batteryHealth: ev.target.value })} />
                    ) : (
                      <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-center text-xs text-emerald-700">🔋 100%</div>
                    )}
                    <input type="number" step="0.01" min={0} className="input text-xs" placeholder="ทุน (default)"
                           value={r.purchasePrice} onChange={(ev) => patchRow(idx, { purchasePrice: ev.target.value })} />
                    <input type="number" step="0.01" min={0}
                           className={`input text-xs ${isSecond ? 'border-amber-300' : ''}`}
                           placeholder={isSecond ? 'ราคาขาย (มือ2)' : 'ราคาขาย (=SKU)'}
                           value={r.sellingPrice} onChange={(ev) => patchRow(idx, { sellingPrice: ev.target.value })} />
                  </div>
                  {/* รายละเอียดเพิ่มเติม (ไม่บังคับ) — ครบเท่ารายเครื่องหน้า "สร้างรุ่นใหม่" (FIX-118) */}
                  <button type="button" onClick={() => patchRow(idx, { extraOpen: !r.extraOpen })}
                          className="ml-6 inline-flex items-center gap-0.5 text-[11px] text-slate-500 hover:text-slate-700">
                    {r.extraOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    เพิ่มเติม (เลขรุ่น / ประกัน / อุปกรณ์ / รูป{isSecond ? ' / ผ่อน' : ''})
                    {(r.warrantyTerms || r.modelNumber || r.deviceNetwork || r.acquisitionOverride
                      || r.hasBox || r.hasCharger || r.imageUrls.length > 0
                      || r.downPayment || r.instTerms.length > 0) && !r.extraOpen && (
                      <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">มีข้อมูล</span>
                    )}
                  </button>
                  {r.extraOpen && (
                    <div className="space-y-2 pl-6">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">เลขรุ่น</label>
                          <input className="input font-mono text-xs" list="pfi-models"
                                 placeholder={product.modelNumber ? `เว้น = ${product.modelNumber}` : 'เช่น MG2N4ZP/A'}
                                 value={r.modelNumber}
                                 onChange={(ev) => patchRow(idx, { modelNumber: ev.target.value })} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">เครือข่าย</label>
                          <input className="input text-xs" list="pfi-networks" placeholder="เว้น = ตามล็อต"
                                 value={r.deviceNetwork}
                                 onChange={(ev) => patchRow(idx, { deviceNetwork: ev.target.value })} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">ที่มา</label>
                          <select className="input text-xs" value={r.acquisitionOverride}
                                  onChange={(ev) => patchRow(idx, { acquisitionOverride: ev.target.value as AcquisitionType | '' })}>
                            <option value="">ตามล็อต ({ACQ_INFO[acquisitionType].th})</option>
                            {ACQ_ORDER.map((k) => <option key={k} value={k}>{ACQ_INFO[k].th}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">ประกัน</label>
                          <input className="input text-xs" list="pfi-warranty"
                                 placeholder={isSecond ? 'เช่น ประกันศูนย์เหลือ / ประกันร้าน 1 เดือน' : `เว้น = ${WARRANTY_NEW}`}
                                 value={r.warrantyTerms}
                                 onChange={(ev) => patchRow(idx, { warrantyTerms: ev.target.value })} />
                        </div>
                        {(isSecond || warrantyNeedsExpire(r.warrantyTerms || WARRANTY_NEW)) && (
                          <div>
                            <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
                              ประกันถึงวันที่ <span className="font-normal text-slate-400">(เครื่อง activate แล้วใส่วันหมดจริง)</span>
                            </label>
                            <input type="date" className="input text-xs" value={r.warrantyExpire}
                                   onChange={(ev) => patchRow(idx, { warrantyExpire: ev.target.value })} />
                          </div>
                        )}
                      </div>
                      {isSecond && (
                        <div className="flex items-center gap-4 rounded-md bg-slate-100 px-2 py-1.5 text-xs">
                          <span className="font-semibold text-slate-600">อุปกรณ์ที่มากับเครื่อง:</span>
                          <label className="inline-flex items-center gap-1">
                            <input type="checkbox" checked={r.hasBox}
                                   onChange={(ev) => patchRow(idx, { hasBox: ev.target.checked })} /> 📦 กล่อง
                          </label>
                          <label className="inline-flex items-center gap-1">
                            <input type="checkbox" checked={r.hasCharger}
                                   onChange={(ev) => patchRow(idx, { hasCharger: ev.target.checked })} /> 🔌 สายชาร์จ
                          </label>
                        </div>
                      )}
                      {isSecond && (
                        <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/60 p-2">
                          <div className="text-[11px] font-semibold text-amber-900">
                            💳 ผ่อนเครื่องนี้ (มือ 2) <span className="font-normal text-amber-700">— โชว์บนเว็บ · เว้นว่าง = ใช้ "ตารางผ่อนมือ 2" ของรุ่นอัตโนมัติ (FIX-123)</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="number" min={0} className="input text-xs" placeholder="เงินดาวน์ (บาท)"
                                   value={r.downPayment}
                                   onChange={(ev) => patchRow(idx, { downPayment: ev.target.value })} />
                            <input className="input text-xs" placeholder="โปรโมชัน เช่น ฟรีเคส"
                                   value={r.instPromo}
                                   onChange={(ev) => patchRow(idx, { instPromo: ev.target.value })} />
                          </div>
                          {r.instTerms.map((t, ti) => (
                            <div key={ti} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <input type="number" min={1} className="input w-16 text-xs" placeholder="งวด"
                                     value={t.months}
                                     onChange={(ev) => patchRow(idx, { instTerms: r.instTerms.map((x, j) => j === ti ? { ...x, months: ev.target.value } : x) })} />
                              <span className="text-slate-500">เดือน ×</span>
                              <input type="number" min={0} className="input w-24 text-xs" placeholder="บาท/เดือน"
                                     value={t.monthly}
                                     onChange={(ev) => patchRow(idx, { instTerms: r.instTerms.map((x, j) => j === ti ? { ...x, monthly: ev.target.value } : x) })} />
                              <span className="text-slate-500">· ดาวน์</span>
                              <input type="number" min={0} className="input w-24 text-xs" placeholder="เว้น=ค่าบน"
                                     value={t.down}
                                     onChange={(ev) => patchRow(idx, { instTerms: r.instTerms.map((x, j) => j === ti ? { ...x, down: ev.target.value } : x) })} />
                              <button type="button" className="rounded p-0.5 text-red-500 hover:bg-red-50"
                                      onClick={() => patchRow(idx, { instTerms: r.instTerms.filter((_, j) => j !== ti) })}>✕</button>
                            </div>
                          ))}
                          <button type="button"
                                  onClick={() => patchRow(idx, { instTerms: [...r.instTerms, { months: '', monthly: '', down: '' }] })}
                                  className="text-[11px] font-medium text-amber-700 hover:text-amber-900">+ เพิ่มงวด</button>
                        </div>
                      )}
                      <div>
                        <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
                          รูปเครื่องนี้ <span className="font-normal text-slate-400">(รูปแรก = ปก · SKU ใหม่ใช้เป็นรูปปกด้วย)</span>
                        </label>
                        <ImageEditor value={r.imageUrls} onChange={(urls) => patchRow(idx, { imageUrls: urls })} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <datalist id="pfi-warranty">{WARRANTY_OPTIONS.map((w) => <option key={w} value={w} />)}</datalist>
            <button
              type="button"
              onClick={() => setRows((p) => [...p, cloneRow(p[p.length - 1] ?? EMPTY_ROW)])}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100">
              <Plus className="h-5 w-5" /> เพิ่มเครื่องอีกตัว <span className="text-xs font-normal">(คัดลอก สี/ความจุ/มือ จากตัวบน)</span>
            </button>
          </div>

          {/* พรีวิวการจับกลุ่ม → SKU */}
          {groups.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="mb-1.5 flex items-center gap-1 font-semibold text-slate-700">
                <Package className="h-3.5 w-3.5" /> สรุปกลุ่ม (ระบบจับเข้า SKU ให้ตอนบันทึก)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g, i) => (
                  <span key={i}
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          g.matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {g.color || '?'} {g.storage || '?'} · {g.condition === 'NEW' ? 'มือ 1' : 'มือ 2'} × {g.count}
                    {!g.matched && ' · ⚠️ SKU ใหม่'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* แผนผ่อน มือ 1 — เฉพาะกรณีรอบนี้จะสร้าง SKU มือ1 ใหม่ (SKU เดิมตั้งที่ปุ่มแก้ไข) */}
          <div className="rounded-lg border border-slate-200 p-3">
            <button type="button" onClick={() => setPlansOpen((o) => !o)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
              {plansOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              แผนผ่อน มือ 1 <span className="text-xs font-normal text-slate-400">(ใช้กับสี/SKU มือ1 ที่สร้างใหม่รอบนี้ · SKU เดิมตั้งที่ปุ่ม "แก้ไข")</span>
            </button>
            {plansOpen && (
              <div className="mt-2">
                <InstallmentPlansEditor value={plans} onChange={setPlans} />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col gap-2 border-t bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-slate-500">สรุป:</span>
            <span className="font-semibold">{filled.length} เครื่อง · {groups.length} กลุ่มสี/มือ · 1 lot</span>
            {unitCostNum > 0 && (
              <span className="text-slate-600">
                ทุนรวม≈ <strong>{formatTHB(filled.reduce((s, r) => s + (Number(r.purchasePrice) || unitCostNum), 0))}</strong>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
            <button onClick={() => submit.mutate()} disabled={submit.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {submit.isPending ? 'กำลังบันทึก...' : 'บันทึก + รับเข้า (ครั้งเดียว)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
