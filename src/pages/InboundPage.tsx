import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowDownToLine, Plus, Trash2 } from 'lucide-react';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { lotsApi } from '@/api/lots';
import { extractErrorMessage } from '@/api/client';
import { formatNumber, formatTHB } from '@/lib/format';

interface FormValues {
  variantId: string;
  quantity: number;
  referenceNo: string;
  lotNo: string;
  importDate: string;
  note: string;
  serializedItems: Array<{
    serialNumber: string;
    imei: string;
    purchasePrice: number | '';
    condition: 'NEW' | 'SECOND_HAND';
    batteryHealth: number | '';
    acquisitionType: 'PURCHASE' | 'TRADE_IN' | 'OUTRIGHT';
  }>;
}

const EMPTY_SERIAL_ROW = {
  serialNumber: '', imei: '', purchasePrice: '' as const,
  condition: 'NEW' as const, batteryHealth: '' as const, acquisitionType: 'PURCHASE' as const,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultLotNo(): string {
  // LOT-yyyyMMdd-HHmmss → unique + human-readable
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `LOT-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
       + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function InboundPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get('product') ?? undefined;
  const [selectedVariant, setSelectedVariant] = useState<{
    serialized: boolean; productName: string; sku: string; sellingPrice: number;
  } | null>(null);

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      quantity: 1, referenceNo: '', note: '',
      lotNo: defaultLotNo(), importDate: todayIso(),
      serializedItems: [{ ...EMPTY_SERIAL_ROW }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'serializedItems' });

  const products = useQuery({
    queryKey: ['products', 'all-for-select'],
    queryFn: () => productsApi.list({ size: 100, active: true }),
  });

  /** Bulk inbound (non-serialized) — no lot tracking. */
  const bulkInbound = useMutation({
    mutationFn: inventoryApi.inbound,
    onSuccess: (data) => {
      toast.success(`รับสินค้าเข้าสำเร็จ — qty ${data.qtyBefore} → ${data.qtyAfter} (TX: ${data.transactionNo})`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      reset({
        variantId: '', quantity: 1, referenceNo: '', note: '',
        lotNo: defaultLotNo(), importDate: todayIso(),
        serializedItems: [{ ...EMPTY_SERIAL_ROW }],
      });
      setSelectedVariant(null);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  /** Serialized (IMEI) inbound — creates a Stock Lot record automatically. */
  const lotInbound = useMutation({
    mutationFn: lotsApi.inbound,
    onSuccess: (data) => {
      const first = data[0];
      toast.success(
        `รับเข้าล็อตสำเร็จ — ${data.reduce((s, d) => s + (d.qtyAfter - d.qtyBefore), 0)} ชิ้น`
        + (first ? ` (TX: ${first.transactionNo})` : '')
      );
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      reset({
        variantId: '', quantity: 1, referenceNo: '', note: '',
        lotNo: defaultLotNo(), importDate: todayIso(),
        serializedItems: [{ ...EMPTY_SERIAL_ROW }],
      });
      setSelectedVariant(null);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const submitting = bulkInbound.isPending || lotInbound.isPending;

  const onSubmit = (data: FormValues) => {
    if (!data.variantId) {
      toast.error('กรุณาเลือกสินค้า');
      return;
    }

    if (selectedVariant?.serialized) {
      const items = data.serializedItems.filter((it) => it.serialNumber.trim());
      if (items.length === 0) {
        toast.error('สินค้านี้ต้องระบุ Serial Number อย่างน้อย 1 ชิ้น');
        return;
      }
      if (!data.lotNo.trim()) {
        toast.error('กรุณาระบุเลขล็อต');
        return;
      }
      // Serialized → use /inbound/lot so a StockLot row is created
      lotInbound.mutate({
        lotNo: data.lotNo.trim(),
        importDate: data.importDate,
        note: [data.referenceNo && `Ref: ${data.referenceNo}`, data.note]
                .filter(Boolean).join(' | ') || undefined,
        items: items.map((it) => ({
          variantId: data.variantId,
          serialNumber: it.serialNumber.trim(),
          imei: it.imei.trim() || undefined,
          condition: it.condition,
          batteryHealth: it.batteryHealth === '' ? undefined : Number(it.batteryHealth),
          acquisitionType: it.acquisitionType,
          purchasePrice: it.purchasePrice === '' ? undefined : Number(it.purchasePrice),
        })),
      });
    } else {
      // Bulk (accessory) → no lot tracking needed
      bulkInbound.mutate({
        variantId: data.variantId,
        quantity: Number(data.quantity),
        referenceNo: data.referenceNo || undefined,
        note: data.note || undefined,
      });
    }
  };

  const handleProductChange = async (variantId: string) => {
    if (!variantId) { setSelectedVariant(null); return; }
    const product = products.data?.content.find((p) => p.id);
    // Need product detail to get variant + serialized flag — fetch on demand
    try {
      const found = products.data?.content.find((p) => p);
      if (!found) return;
      // search through all loaded products for this variant
      for (const p of products.data?.content ?? []) {
        const detail = await productsApi.get(p.id);
        const v = detail.variants.find((x) => x.id === variantId);
        if (v) {
          setSelectedVariant({
            serialized: detail.serialized,
            productName: detail.name,
            sku: v.sku,
            sellingPrice: v.sellingPrice,
          });
          return;
        }
      }
    } catch { /* ignore */ }
    void product;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <ArrowDownToLine className="h-6 w-6 text-emerald-600" /> รับสินค้าเข้าสต็อก
        </h1>
        <p className="text-sm text-slate-500">บันทึกการรับสินค้าเข้า (Inbound)</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card">
          <div className="card-body space-y-4">
            <VariantSelector register={register} errors={errors}
                             products={products.data?.content ?? []}
                             onChange={handleProductChange} watch={watch}
                             initialProductId={initialProductId} />

            {selectedVariant && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium">{selectedVariant.productName}</div>
                <div className="text-xs text-slate-500">
                  SKU: <span className="font-mono">{selectedVariant.sku}</span> ·
                  Selling Price: {formatTHB(selectedVariant.sellingPrice)} ·
                  {selectedVariant.serialized ? ' Serialized (ต้องระบุ IMEI/SN)' : ' Bulk (ระบุจำนวน)'}
                </div>
              </div>
            )}

            {/* Lot tracking (Serialized only) */}
            {selectedVariant?.serialized && (
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase text-purple-800">
                  📦 ข้อมูลล็อต (สำหรับมือถือ — บันทึกใน Stock Lots)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      เลขล็อต (Lot No) <span className="text-red-500">*</span>
                    </label>
                    <input className="input font-mono text-xs"
                           placeholder="LOT-yyyyMMdd-HHmmss"
                           {...register('lotNo', { required: 'จำเป็น' })} />
                    <p className="mt-1 text-xs text-slate-500">
                      ระบบสร้างให้อัตโนมัติ — แก้เป็นเลขจริงของ supplier ได้
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      วันที่นำเข้า <span className="text-red-500">*</span>
                    </label>
                    <input type="date" className="input"
                           {...register('importDate', { required: true })} />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  เลขเอกสารอ้างอิง
                  <span className="ml-1 text-xs font-normal text-slate-500">(ถ้ามี — ใบ PO / ใบส่งของจาก supplier)</span>
                </label>
                <input className="input" placeholder="เช่น PO-2026-001 หรือ INV/AP/12345"
                       {...register('referenceNo')} />
              </div>
              {!selectedVariant?.serialized && (
                <div>
                  <label className="mb-1 block text-sm font-medium">จำนวน *</label>
                  <input type="number" min={1} className="input" {...register('quantity', { required: true, min: 1 })} />
                </div>
              )}
            </div>

            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
              💡 <strong>เลขเอกสารอ้างอิง</strong> เอาจากใบ PO / Invoice / ใบส่งของที่ supplier ออกให้คุณ
              {selectedVariant?.serialized
                ? ' — จะถูกบันทึกใน "หมายเหตุล็อต" เพื่อ trace กลับได้'
                : ' — ถ้าไม่มีเอกสาร เว้นว่างได้'}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                หมายเหตุ
                <span className="ml-1 text-xs font-normal text-slate-500">(ถ้ามี เช่น "lot Apple ส่งวันที่ ...")</span>
              </label>
              <textarea className="input" rows={2}
                        placeholder="หมายเหตุการรับเข้า (ไม่บังคับ)"
                        {...register('note')} />
            </div>
          </div>
        </div>

        {selectedVariant?.serialized && (
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>รายการ Serial / IMEI ({formatNumber(fields.length)} ชิ้น)</span>
              <button type="button" className="btn-secondary"
                      onClick={() => append({ ...EMPTY_SERIAL_ROW })}>
                <Plus className="h-4 w-4" /> เพิ่มเครื่อง
              </button>
            </div>
            <div className="card-body space-y-3">
              {fields.map((field, idx) => {
                const isUsed = watch(`serializedItems.${idx}.condition`) === 'SECOND_HAND';
                return (
                <div key={field.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                  {/* row 1: SN + IMEI + remove */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <label className="text-xs text-slate-500">Serial Number *</label>
                      <input className="input" autoFocus={idx === fields.length - 1}
                             {...register(`serializedItems.${idx}.serialNumber` as const)} />
                    </div>
                    <div className="col-span-6">
                      <label className="text-xs text-slate-500">IMEI (Optional)</label>
                      <input className="input" {...register(`serializedItems.${idx}.imei` as const)} />
                    </div>
                    <div className="col-span-1 flex items-end justify-center">
                      <button type="button" className="rounded p-2 text-red-600 hover:bg-red-50"
                              onClick={() => remove(idx)} disabled={fields.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* row 2: condition + battery + acquisition + price */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3">
                      <label className="text-xs text-slate-500">สภาพเครื่อง</label>
                      <select className="input" {...register(`serializedItems.${idx}.condition` as const)}>
                        <option value="NEW">มือ 1 (NEW)</option>
                        <option value="SECOND_HAND">มือ 2 (Used)</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs text-slate-500">
                        สุขภาพแบต % {isUsed && <span className="text-amber-600">(แนะนำ)</span>}
                      </label>
                      <input type="number" min={0} max={100} className="input"
                             placeholder={isUsed ? 'เช่น 87' : '100'}
                             {...register(`serializedItems.${idx}.batteryHealth` as const)} />
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs text-slate-500">ที่มาเครื่อง</label>
                      <select className="input" {...register(`serializedItems.${idx}.acquisitionType` as const)}>
                        <option value="PURCHASE">ซื้อมา</option>
                        <option value="TRADE_IN">เทิร์น</option>
                        <option value="OUTRIGHT">ซื้อขายขาด</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs text-slate-500">ราคาทุน</label>
                      <input type="number" step="0.01" className="input"
                             {...register(`serializedItems.${idx}.purchasePrice` as const)} />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'กำลังบันทึก...'
              : selectedVariant?.serialized ? 'บันทึกล็อตการรับเข้า'
              : 'บันทึกการรับเข้า'}
          </button>
        </div>
      </form>
    </div>
  );
}

function VariantSelector({ register, errors, products, onChange, watch, initialProductId }: {
  register: ReturnType<typeof useForm<FormValues>>['register'];
  errors: ReturnType<typeof useForm<FormValues>>['formState']['errors'];
  products: Array<{ id: string; name: string }>;
  onChange: (variantId: string) => void;
  watch: ReturnType<typeof useForm<FormValues>>['watch'];
  /** ถ้ามากับ query param ?product=<id> ให้เลือกสินค้านี้ + โหลด variant ให้อัตโนมัติ */
  initialProductId?: string;
}) {
  const [variantOptions, setVariantOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const handleProductChange = async (productId: string) => {
    setSelectedProductId(productId);
    setVariantOptions([]);
    if (!productId) return;
    try {
      const detail = await productsApi.get(productId);
      setVariantOptions(
        detail.variants.map((v) => ({
          id: v.id,
          label: `${v.sku} ${[v.color, v.storage].filter(Boolean).join(' / ')}`,
        }))
      );
    } catch { /* ignore */ }
  };

  // Preselect product จาก quick action "รับเข้า" — โหลด variant ของรุ่นนี้ให้พร้อมเลือก
  useEffect(() => {
    if (initialProductId) handleProductChange(initialProductId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium">สินค้า *</label>
        <select className="input" value={selectedProductId}
                onChange={(e) => handleProductChange(e.target.value)}>
          <option value="">เลือกสินค้า</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Variant *</label>
        <select className="input" {...register('variantId', { required: 'จำเป็น' })}
                onChange={(e) => onChange(e.target.value)}
                disabled={!selectedProductId}>
          <option value="">เลือก variant</option>
          {variantOptions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {errors.variantId && <p className="mt-1 text-xs text-red-600">{errors.variantId.message}</p>}
        {void watch}
      </div>
    </div>
  );
}
