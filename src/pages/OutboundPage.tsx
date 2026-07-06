import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowUpFromLine, Plus, Trash2 } from 'lucide-react';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatNumber, formatTHB } from '@/lib/format';

export function OutboundPage() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');
  const [identifiers, setIdentifiers] = useState<string[]>(['']);

  const products = useQuery({
    queryKey: ['products', 'all-for-select'],
    queryFn: () => productsApi.list({ size: 100, active: true }),
  });

  const productDetail = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productsApi.get(productId),
    enabled: !!productId,
  });

  const inventory = useQuery({
    queryKey: ['inventory', variantId, 'detail'],
    queryFn: () => inventoryApi.get(variantId),
    enabled: !!variantId,
  });

  const selectedVariant = productDetail.data?.variants.find((v) => v.id === variantId);
  const isSerialized = productDetail.data?.serialized ?? false;

  const outbound = useMutation({
    mutationFn: inventoryApi.outbound,
    onSuccess: (data) => {
      toast.success(`จ่ายสินค้าสำเร็จ — qty ${data.qtyBefore} → ${data.qtyAfter} (TX: ${data.transactionNo})`);
      if (data.lowStockAlertCreated) {
        toast(`⚠️ Low Stock Alert ถูกสร้าง`, { duration: 5000 });
      }
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      setIdentifiers(['']);
      setQuantity(1);
      setReferenceNo('');
      setNote('');
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantId) { toast.error('เลือก variant ก่อน'); return; }

    if (isSerialized) {
      const ids = identifiers.map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) { toast.error('ระบุ IMEI/SN อย่างน้อย 1 ตัว'); return; }
      outbound.mutate({
        variantId,
        serialIdentifiers: ids,
        referenceNo: referenceNo || undefined,
        note: note || undefined,
      });
    } else {
      outbound.mutate({
        variantId,
        quantity,
        referenceNo: referenceNo || undefined,
        note: note || undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <ArrowUpFromLine className="h-6 w-6 text-red-600" /> จ่ายสินค้าออก
        </h1>
        <p className="text-sm text-slate-500">บันทึกการจ่ายสินค้าออก (Outbound / Sale)</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        <div className="card">
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">สินค้า *</label>
                <select className="input" value={productId}
                        onChange={(e) => { setProductId(e.target.value); setVariantId(''); }}>
                  <option value="">เลือกสินค้า</option>
                  {products.data?.content.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Variant *</label>
                <select className="input" value={variantId}
                        onChange={(e) => setVariantId(e.target.value)}
                        disabled={!productId}>
                  <option value="">เลือก variant</option>
                  {productDetail.data?.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} — {[v.color, v.storage].filter(Boolean).join(' / ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedVariant && inventory.data && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium">{productDetail.data?.name}</div>
                <div className="text-xs text-slate-500">
                  สต็อกคงเหลือ: <span className="font-bold text-slate-700">{formatNumber(inventory.data.quantity)}</span> ·
                  ราคาขาย: {formatTHB(selectedVariant.sellingPrice)} ·
                  {isSerialized ? ' Serialized (ระบุ IMEI/SN)' : ' Bulk (ระบุจำนวน)'}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Reference No (SO#)</label>
                <input className="input" placeholder="SO-2026-001"
                       value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              </div>
              {!isSerialized && (
                <div>
                  <label className="mb-1 block text-sm font-medium">จำนวน *</label>
                  <input type="number" min={1} className="input"
                         value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
              <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        {isSerialized && (
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>IMEI / Serial Number ที่จะจ่าย ({identifiers.filter(Boolean).length} ชิ้น)</span>
              <button type="button" className="btn-secondary"
                      onClick={() => setIdentifiers((prev) => [...prev, ''])}>
                <Plus className="h-4 w-4" /> เพิ่มแถว
              </button>
            </div>
            <div className="card-body space-y-2">
              {identifiers.map((val, idx) => (
                <div key={idx} className="flex gap-2">
                  <input className="input" placeholder="กรอกหรือสแกน IMEI / Serial Number"
                         value={val}
                         autoFocus={idx === identifiers.length - 1}
                         onChange={(e) => setIdentifiers((prev) => prev.map((v, i) => i === idx ? e.target.value : v))} />
                  <button type="button" className="rounded p-2 text-red-600 hover:bg-red-50"
                          onClick={() => setIdentifiers((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={identifiers.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-danger" disabled={outbound.isPending}>
            {outbound.isPending ? 'กำลังบันทึก...' : 'บันทึกการจ่ายออก'}
          </button>
        </div>
      </form>
    </div>
  );
}
