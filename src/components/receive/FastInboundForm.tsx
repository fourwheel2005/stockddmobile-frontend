import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Package, Plus, Minus, ArrowLeft, Save, AlertTriangle, ImageIcon } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { AuthImage } from '@/components/AuthImage';
import { formatTHB } from '@/lib/format';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import type { AcquisitionType, VariantResponse } from '@/types/api';

interface Props {
  variant: VariantResponse;
  onBack: () => void;
  onDone: () => void;
}

/**
 * รับเข้า "อุปกรณ์เสริม" (นับจำนวน ไม่มี IMEI) ของ SKU ที่มีอยู่แล้ว — FIX-114
 * มือถือ (serialized) ไม่ใช้ฟอร์มนี้แล้ว — FastInboundModal ส่งไปฟอร์มรวมระดับรุ่นแทน
 */
export function FastInboundForm({ variant, onBack, onDone }: Props) {
  const qc = useQueryClient();

  const [qty, setQty] = useState<number>(0);
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>('PURCHASE');
  const [unitCost, setUnitCost] = useState<string>('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');

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

  const submit = useMutation({
    mutationFn: async () => {
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
    },
    onSuccess: () => {
      toast.success(`รับ ${qty} ชิ้นเข้าคลัง`);
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
                ? <AuthImage src={variant.imageUrl} alt="" className="h-full w-full rounded-md object-cover" />
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

          <div>
            <label className="mb-1 block text-sm font-medium">จำนวนรับเข้า (ชิ้น)</label>
            <BulkQty value={qty} onChange={setQty} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">ที่มา</label>
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
              ทุนต่อชิ้น ({formatTHB(variant.costPrice ?? 0)} เดิม)
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
          <span className="font-semibold">{qty} ชิ้น</span>
          {unitCostNum > 0 && (
            <span className="text-slate-600">
              ทุนรวม <strong>{formatTHB(qty * unitCostNum)}</strong>
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
