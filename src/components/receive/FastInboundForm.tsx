import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Package, X, Plus, Minus, ScanLine, ArrowLeft, Save, AlertTriangle, ImageIcon,
} from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { lotsApi } from '@/api/lots';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import type { AcquisitionType, VariantResponse } from '@/types/api';

interface Props {
  variant: VariantResponse;
  /** ถ้า Product = serialized → ใช้ items/IMEI · ไม่ใช่ → ใช้ qty bulk */
  isSerialized: boolean;
  onBack: () => void;
  onDone: () => void;
}

interface ItemRow {
  serialNumber: string;
  imei: string;
  purchasePrice: string;
}

const EMPTY_ITEM: ItemRow = { serialNumber: '', imei: '', purchasePrice: '' };

/**
 * Fast inbound — รับเข้า lot ใหม่ของ variant ที่มีอยู่แล้ว
 * แสดงข้อมูลเดิม (read-only) + ฟอร์ม lot
 */
export function FastInboundForm({ variant, isSerialized, onBack, onDone }: Props) {
  const qc = useQueryClient();

  // bulk-mode state
  const [qty, setQty] = useState<number>(0);

  // common state
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>('PURCHASE');
  const [unitCost, setUnitCost] = useState<string>('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');

  // serialized state
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [scannerMode, setScannerMode] = useState(false);
  const [scanText, setScanText] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);

  // ─── Cost warning ──────────────────────────────────────────────
  const unitCostNum = Number(unitCost);
  const costDeviationWarning = useMemo(() => {
    if (!unitCostNum || unitCostNum === 0) return null;
    const orig = variant.costPrice ?? 0;
    if (orig === 0) return null;
    const diff = Math.abs(unitCostNum - orig) / orig;
    if (diff > 0.3) {
      return `⚠️ ทุนต่างจากเดิม (${formatTHB(orig)}) เกิน 30% — ตรวจอีกครั้ง`;
    }
    return null;
  }, [unitCostNum, variant.costPrice]);

  // ─── Scan IMEI ────────────────────────────────────────────────
  const ingestImeis = (raw: string): number => {
    const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return 0;
    setItems((prev) => {
      const next = [...prev];
      const firstEmpty = next.findIndex((it) => !it.imei && !it.serialNumber);
      let cursor = 0;
      if (firstEmpty >= 0) {
        next[firstEmpty] = { ...next[firstEmpty], imei: tokens[cursor++] };
      }
      for (; cursor < tokens.length; cursor++) {
        next.push({ ...EMPTY_ITEM, imei: tokens[cursor] });
      }
      return next;
    });
    return tokens.length;
  };

  // ─── Submit ───────────────────────────────────────────────────
  const submit = useMutation({
    mutationFn: async () => {
      if (isSerialized) {
        const validItems = items
          .filter((it) => (it.imei || it.serialNumber).trim())
          .map((it) => ({
            variantId: variant.id,
            serialNumber: (it.serialNumber || it.imei).trim(),
            imei: it.imei.trim() || undefined,
            acquisitionType,
            purchasePrice: it.purchasePrice
              ? Number(it.purchasePrice)
              : (unitCostNum || undefined),
          }));
        if (validItems.length === 0) {
          throw new Error('ใส่อย่างน้อย 1 เครื่อง');
        }
        return lotsApi.inbound({
          lotNo: '',
          importDate: new Date().toISOString().slice(0, 10),
          note: [note, supplierRef && `ผู้ขาย: ${supplierRef}`, invoiceNo && `INV: ${invoiceNo}`]
            .filter(Boolean).join(' · ') || undefined,
          items: validItems,
        });
      } else {
        if (qty <= 0) throw new Error('ใส่จำนวนรับเข้าให้มากกว่า 0');
        return inventoryApi.inbound({
          variantId: variant.id,
          quantity: qty,
          note: [
            `acq: ${acquisitionType}`,
            unitCost && `cost/unit: ${unitCost}`,
            supplierRef && `supplier: ${supplierRef}`,
            invoiceNo && `invoice: ${invoiceNo}`,
            note,
          ].filter(Boolean).join(' · ') || undefined,
        });
      }
    },
    onSuccess: () => {
      toast.success(`รับ ${isSerialized ? items.filter((i) => i.imei || i.serialNumber).length : qty} ${isSerialized ? 'เครื่อง' : 'ชิ้น'} เข้าคลัง`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['variant-search'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      onDone();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> ค้นหาใหม่
      </button>

      {/* Variant card (read-only) */}
      <div className="card border-2 border-emerald-300">
        <div className="card-body">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-emerald-100">
              {variant.imageUrl
                ? <img src={variant.imageUrl} alt="" className="h-full w-full rounded-md object-cover" />
                : <ImageIcon className="h-7 w-7 text-emerald-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold uppercase text-emerald-700">มีในระบบแล้ว</span>
              </div>
              <h2 className="text-lg font-bold">{variant.productName}</h2>
              <div className="text-sm text-slate-500">
                {[variant.color, variant.storage, variant.network].filter(Boolean).join(' / ')}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                <span>SKU: <code className="font-mono">{variant.sku}</code></span>
                <span>ราคาขาย: {formatTHB(variant.sellingPrice)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lot form */}
      <div className="card">
        <div className="card-header">
          <span className="font-semibold">🆕 รับ Lot ใหม่</span>
        </div>
        <div className="card-body space-y-4">

          {/* qty / IMEI ── ขึ้นกับ serialized */}
          {!isSerialized ? (
            <div>
              <label className="mb-1 block text-sm font-medium">จำนวนรับเข้า (ชิ้น)</label>
              <BulkQty value={qty} onChange={setQty} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">รายการเครื่อง (IMEI/Serial)</label>
                <button
                  type="button"
                  onClick={() => { setScannerMode((v) => !v); setTimeout(() => scannerRef.current?.focus(), 0); }}
                  className={`btn text-xs ${scannerMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'btn-secondary'}`}>
                  <ScanLine className="h-3.5 w-3.5" />
                  {scannerMode ? `โหมดสแกน · ${items.length} เครื่อง` : 'โหมดยิงสแกน'}
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
                  className="input font-mono border-emerald-400"
                />
              )}
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded border border-slate-100 bg-slate-50 p-2">
                  <span className="col-span-1 self-center text-xs font-semibold text-slate-500">{idx + 1}.</span>
                  <input
                    className="input col-span-5 font-mono text-sm"
                    placeholder="IMEI"
                    value={it.imei}
                    onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, imei: e.target.value } : x))}
                  />
                  <input
                    className="input col-span-4 font-mono text-sm"
                    placeholder="Serial (เว้น=ใช้ IMEI)"
                    value={it.serialNumber}
                    onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, serialNumber: e.target.value } : x))}
                  />
                  <button
                    type="button"
                    onClick={() => setItems((p) => p.length > 1 ? p.filter((_, i) => i !== idx) : p)}
                    disabled={items.length === 1}
                    className="col-span-2 rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30">
                    <X className="h-4 w-4 mx-auto" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((p) => [...p, { ...EMPTY_ITEM }])}
                className="btn-secondary text-sm">
                <Plus className="h-4 w-4" /> เพิ่มเครื่อง
              </button>
            </div>
          )}

          {/* acquisitionType */}
          <div>
            <label className="mb-1 block text-sm font-medium">ที่มา (Lot นี้)</label>
            <select
              className="input"
              value={acquisitionType}
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

          {/* unit cost */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              ทุนต่อ{isSerialized ? 'เครื่อง' : 'ชิ้น'} ({formatTHB(variant.costPrice ?? 0)} เดิม)
            </label>
            <input
              type="number"
              step="0.01"
              className="input"
              placeholder={`เว้น = ใช้ ${formatTHB(variant.costPrice ?? 0)}`}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
            {costDeviationWarning && (
              <div className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {costDeviationWarning}
              </div>
            )}
          </div>

          {/* supplier + invoice */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">ผู้ขาย / Supplier</label>
              <input className="input" placeholder="ชื่อร้าน" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">เลขใบกำกับ</label>
              <input className="input font-mono" placeholder="INV-..." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-slate-500">สรุป:</span>
          <span className="font-semibold">
            {isSerialized
              ? `${items.filter((i) => i.imei || i.serialNumber).length} เครื่อง`
              : `${qty} ชิ้น`}
          </span>
          {unitCostNum > 0 && (
            <span className="text-slate-600">
              ทุนรวม <strong>{formatTHB((isSerialized ? items.filter((i) => i.imei || i.serialNumber).length : qty) * unitCostNum)}</strong>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onBack} className="btn-secondary">ยกเลิก</button>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="btn-primary">
            <Save className="h-4 w-4" />
            {submit.isPending ? 'กำลังบันทึก...' : 'บันทึก + รับเข้า'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Touch-friendly qty input with +/- buttons + presets */
function BulkQty({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const safe = Math.max(0, Math.floor(value || 0));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, safe - 1))}
          disabled={safe <= 0}
          className="grid h-12 w-12 place-items-center rounded-lg border-2 border-slate-200 bg-white text-xl font-bold hover:border-rose-400 disabled:opacity-40">
          <Minus className="h-5 w-5" />
        </button>
        <input
          type="number" min={0} step={1}
          value={safe || ''}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="input flex-1 text-center text-2xl font-bold"
        />
        <button
          type="button"
          onClick={() => onChange(safe + 1)}
          className="grid h-12 w-12 place-items-center rounded-lg border-2 border-slate-200 bg-white text-xl font-bold hover:border-emerald-400">
          <Plus className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[5, 10, 20, 50, 100].map((v) => (
          <button
            key={v} type="button"
            onClick={() => onChange(safe + v)}
            className="rounded border border-slate-200 px-2 py-1 text-xs hover:border-brand-400">
            + {v}
          </button>
        ))}
      </div>
    </div>
  );
}
