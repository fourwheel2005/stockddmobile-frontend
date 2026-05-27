import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowDownToLine, Plus, Trash2 } from 'lucide-react';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatNumber, formatTHB } from '@/lib/format';

interface FormValues {
  variantId: string;
  quantity: number;
  referenceNo: string;
  note: string;
  serializedItems: Array<{
    serialNumber: string;
    imei: string;
    purchasePrice: number | '';
  }>;
}

export function InboundPage() {
  const qc = useQueryClient();
  const [selectedVariant, setSelectedVariant] = useState<{
    serialized: boolean; productName: string; sku: string; sellingPrice: number;
  } | null>(null);

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { quantity: 1, referenceNo: '', note: '', serializedItems: [{ serialNumber: '', imei: '', purchasePrice: '' }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'serializedItems' });

  const products = useQuery({
    queryKey: ['products', 'all-for-select'],
    queryFn: () => productsApi.list({ size: 100, active: true }),
  });

  const inbound = useMutation({
    mutationFn: inventoryApi.inbound,
    onSuccess: (data) => {
      toast.success(`รับสินค้าเข้าสำเร็จ — qty ${data.qtyBefore} → ${data.qtyAfter} (TX: ${data.transactionNo})`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      reset({ variantId: '', quantity: 1, referenceNo: '', note: '', serializedItems: [{ serialNumber: '', imei: '', purchasePrice: '' }] });
      setSelectedVariant(null);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

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
      inbound.mutate({
        variantId: data.variantId,
        referenceNo: data.referenceNo || undefined,
        note: data.note || undefined,
        serializedItems: items.map((it) => ({
          serialNumber: it.serialNumber.trim(),
          imei: it.imei.trim() || undefined,
          purchasePrice: it.purchasePrice === '' ? undefined : Number(it.purchasePrice),
        })),
      });
    } else {
      inbound.mutate({
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
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ArrowDownToLine className="h-6 w-6 text-emerald-600" /> รับสินค้าเข้าสต็อก
        </h1>
        <p className="text-sm text-slate-500">บันทึกการรับสินค้าเข้า (Inbound)</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card">
          <div className="card-body space-y-4">
            <VariantSelector register={register} errors={errors}
                             products={products.data?.content ?? []}
                             onChange={handleProductChange} watch={watch} />

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
              (ลอกตัวเลขมาใส่) — ถ้าไม่มีเอกสาร <strong>เว้นว่างได้</strong>
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
                      onClick={() => append({ serialNumber: '', imei: '', purchasePrice: '' })}>
                <Plus className="h-4 w-4" /> เพิ่มเครื่อง
              </button>
            </div>
            <div className="card-body space-y-3">
              {fields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 p-3">
                  <div className="col-span-4">
                    <label className="text-xs text-slate-500">Serial Number *</label>
                    <input className="input" autoFocus={idx === fields.length - 1}
                           {...register(`serializedItems.${idx}.serialNumber` as const)} />
                  </div>
                  <div className="col-span-4">
                    <label className="text-xs text-slate-500">IMEI (Optional)</label>
                    <input className="input" {...register(`serializedItems.${idx}.imei` as const)} />
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs text-slate-500">Purchase Price</label>
                    <input type="number" step="0.01" className="input"
                           {...register(`serializedItems.${idx}.purchasePrice` as const)} />
                  </div>
                  <div className="col-span-1 flex items-end justify-center">
                    <button type="button" className="rounded p-2 text-red-600 hover:bg-red-50"
                            onClick={() => remove(idx)} disabled={fields.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-primary" disabled={inbound.isPending}>
            {inbound.isPending ? 'กำลังบันทึก...' : 'บันทึกการรับเข้า'}
          </button>
        </div>
      </form>
    </div>
  );
}

function VariantSelector({ register, errors, products, onChange, watch }: {
  register: ReturnType<typeof useForm<FormValues>>['register'];
  errors: ReturnType<typeof useForm<FormValues>>['formState']['errors'];
  products: Array<{ id: string; name: string }>;
  onChange: (variantId: string) => void;
  watch: ReturnType<typeof useForm<FormValues>>['watch'];
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
