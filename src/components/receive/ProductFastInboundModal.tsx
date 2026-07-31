import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Plus, ScanLine, Save, AlertTriangle, Package } from 'lucide-react';
import { productsApi } from '@/api/products';
import { extractErrorMessage } from '@/api/client';
import { useBranchStore } from '@/stores/branchStore';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { formatTHB } from '@/lib/format';
import { shopToday } from '@/lib/datetime';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import { NETWORK_OPTIONS, STORAGE_OPTIONS, WARRANTY_NEW } from '@/lib/deviceOptions';
import type { AcquisitionType, ProductDetail, WizardInitialItem, WizardVariantBlock } from '@/types/api';

/**
 * รับเข้าเครื่องระดับ "รุ่น" — หลายสี/หลายมือ ในฟอร์มเดียว กดบันทึกครั้งเดียว (FIX-112)
 *
 * เดิมปุ่ม "รับเข้าสีเดิม" ผูกกับ SKU เดียว → ล็อตที่มีหลายสีต้องเปิดฟอร์มทีละสี
 * ฟอร์มนี้ส่งผ่าน POST /products/wizard ซึ่งฝั่ง backend:
 *  - reuse product ตามชื่อ (FIX-100 กันรุ่นซ้ำ)
 *  - จับ SKU เดิมตาม สภาพ+สี+ความจุ (findMatchingVariant — แม่นกว่าเดาฝั่ง client
 *    เพราะรุ่นเดียวอาจมีหลาย SKU สี/ความจุเดียวกันแยกมือ 1/มือ 2)
 *  - รวมทุกเครื่องเป็น StockLot เดียว (เก็บผู้ขาย/ใบกำกับใน note เหมือนฟอร์มเดิม)
 */

type Cond = 'NEW' | 'SECOND_HAND';

interface DeviceRow {
  imei: string;
  serialNumber: string;
  color: string;          // เว้น = ใช้ค่าเริ่มต้น
  storage: string;        // เว้น = ใช้ค่าเริ่มต้น
  condition: '' | Cond;   // เว้น = ใช้ค่าเริ่มต้น
  batteryHealth: string;  // มือ 2
  purchasePrice: string;  // เว้น = ทุนเริ่มต้น
  sellingPrice: string;   // มือ 2 ควรตั้งรายเครื่อง · มือ 1 เว้น = ราคา SKU
}

const EMPTY_ROW: DeviceRow = {
  imei: '', serialNumber: '', color: '', storage: '', condition: '',
  batteryHealth: '', purchasePrice: '', sellingPrice: '',
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** รหัสเครื่อง running จาก base "DDxxxxx" + ลำดับ (เหมือน AddVariantModal) */
const deviceCode = (base: string, idx: number) => {
  const m = (base || '').match(/^DD(\d+)$/);
  if (!m) return base ? (idx === 0 ? base : `${base}-${idx + 1}`) : '';
  return 'DD' + String(parseInt(m[1], 10) + idx).padStart(5, '0');
};

export function ProductFastInboundModal({ product, onClose, onDone }: {
  product: ProductDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  useModalChrome(onClose);
  const qc = useQueryClient();

  const activeVariants = product.variants.filter((v) => v.active);
  const colorOptions = Array.from(new Set(activeVariants.map((v) => (v.color ?? '').trim()).filter(Boolean))).sort();
  const storageOptions = Array.from(new Set(activeVariants.map((v) => (v.storage ?? '').trim()).filter(Boolean))).sort();

  // ─── ค่าเริ่มต้นของทั้งล็อต ─────────────────────────────────────────
  const [batchCondition, setBatchCondition] = useState<Cond>('NEW');
  const [batchColor, setBatchColor] = useState('');
  // รุ่นมีความจุเดียว → เติมให้เลย (เคสร้านส่วนใหญ่)
  const [batchStorage, setBatchStorage] = useState(storageOptions.length === 1 ? storageOptions[0] : '');
  const [batchNetwork, setBatchNetwork] = useState('');
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>('PURCHASE');
  const [unitCost, setUnitCost] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');

  // ─── เครื่องรายตัว ──────────────────────────────────────────────────
  const [rows, setRows] = useState<DeviceRow[]>([{ ...EMPTY_ROW }]);
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
      for (; cursor < tokens.length; cursor++) next.push({ ...EMPTY_ROW, imei: tokens[cursor] });
      return next;
    });
    return tokens.length;
  };

  // ─── สรุปกลุ่ม (สภาพ×สี×ความจุ) + เช็คว่าจับ SKU เดิมได้ไหม ─────────
  const filled = rows.filter((r) => (r.imei || r.serialNumber).trim());
  const eff = (r: DeviceRow) => ({
    color: (r.color || batchColor).trim(),
    storage: (r.storage || batchStorage).trim(),
    condition: (r.condition || batchCondition) as Cond,
  });
  const groups = useMemo(() => {
    const map = new Map<string, { color: string; storage: string; condition: Cond; count: number; matched: boolean }>();
    for (const r of filled) {
      const e = eff(r);
      const key = `${e.condition}|${norm(e.color)}|${norm(e.storage)}`;
      const g = map.get(key);
      if (g) { g.count += 1; continue; }
      // จับคู่แบบเดียวกับ backend (FIX-113): มือ+สี+ความจุ · SKU ยังไม่ผูกมือ (condition null) = adopt ได้
      const matched = activeVariants.some(
        (v) => norm(v.color) === norm(e.color) && norm(v.storage) === norm(e.storage)
            && (v.condition == null || v.condition === e.condition));
      map.set(key, { ...e, count: 1, matched });
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, batchColor, batchStorage, batchCondition]);

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
        .filter(({ r }) => { const e = eff(r); return !e.color || !e.storage; });
      if (missing.length > 0) {
        throw new Error(`เครื่องที่ ${missing.map(({ i }) => i + 1).join(', ')} ยังไม่มีสี/ความจุ — ใส่ให้ครบ (ตั้งค่าเริ่มต้นด้านบนได้)`);
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
      const items: (WizardInitialItem & { _key: string })[] = filled.map((r, i) => {
        const e = eff(r);
        const isNew = e.condition === 'NEW';
        return {
          _key: `${e.condition}|${norm(e.color)}|${norm(e.storage)}`,
          serialNumber: (r.serialNumber || r.imei).trim(),
          imei: r.imei.trim() || undefined,
          stockCode: deviceCode(base, i),
          condition: e.condition,
          batteryHealth: isNew ? 100 : (r.batteryHealth === '' ? undefined : Number(r.batteryHealth)),
          deviceColor: e.color,
          deviceStorage: e.storage,
          deviceNetwork: batchNetwork.trim() || undefined,
          modelNumber: product.modelNumber ?? undefined,
          acquisitionType,
          purchasePrice: r.purchasePrice !== '' ? Number(r.purchasePrice) : (unitCostNum || undefined),
          sellingPrice: r.sellingPrice === '' ? undefined : Number(r.sellingPrice),
          warrantyTerms: isNew ? WARRANTY_NEW : undefined,
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
        return {
          spec: {
            sku: first.stockCode!,
            color: first.deviceColor,
            storage: first.deviceStorage,
            network: batchNetwork.trim() || undefined,
            costPrice: Number(first.purchasePrice) || ref?.costPrice || 0,
            sellingPrice: Number(first.sellingPrice) || ref?.sellingPrice || 0,
            reorderPoint: ref?.reorderPoint ?? 5,
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
          {/* ค่าเริ่มต้นทั้งล็อต */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">ค่าเริ่มต้นทุกเครื่อง <span className="font-normal text-slate-400">(เครื่องไหนต่างค่อยแก้รายแถว)</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">สภาพ</label>
                <div className="flex items-center gap-3 pt-1.5 text-sm">
                  <label className="inline-flex items-center gap-1">
                    <input type="radio" checked={batchCondition === 'NEW'} onChange={() => setBatchCondition('NEW')} /> มือ 1
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input type="radio" checked={batchCondition === 'SECOND_HAND'} onChange={() => setBatchCondition('SECOND_HAND')} /> มือ 2
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">สี</label>
                <input className="input text-sm" list="pfi-colors" placeholder="เช่น Silver"
                       value={batchColor} onChange={(e) => setBatchColor(e.target.value)} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">ความจุ</label>
                <input className="input text-sm" list="pfi-storages" placeholder="เช่น 256GB"
                       value={batchStorage} onChange={(e) => setBatchStorage(e.target.value)} />
              </div>
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
            <datalist id="pfi-colors">{colorOptions.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="pfi-storages">
              {Array.from(new Set([...storageOptions, ...STORAGE_OPTIONS])).map((s) => <option key={s} value={s} />)}
            </datalist>
            <datalist id="pfi-networks">{NETWORK_OPTIONS.map((n) => <option key={n} value={n} />)}</datalist>
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
              const e = eff(r);
              const isSecond = e.condition === 'SECOND_HAND';
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
                    <input className="input text-xs" list="pfi-colors"
                           placeholder={batchColor ? `สี (${batchColor})` : 'สี *'}
                           value={r.color} onChange={(ev) => patchRow(idx, { color: ev.target.value })} />
                    <input className="input text-xs" list="pfi-storages"
                           placeholder={batchStorage ? `ความจุ (${batchStorage})` : 'ความจุ *'}
                           value={r.storage} onChange={(ev) => patchRow(idx, { storage: ev.target.value })} />
                    <select className="input text-xs" value={r.condition}
                            onChange={(ev) => patchRow(idx, { condition: ev.target.value as '' | Cond })}>
                      <option value="">{batchCondition === 'NEW' ? 'มือ 1 (default)' : 'มือ 2 (default)'}</option>
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
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setRows((p) => [...p, { ...EMPTY_ROW }])}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100">
              <Plus className="h-5 w-5" /> เพิ่มเครื่องอีกตัว
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
