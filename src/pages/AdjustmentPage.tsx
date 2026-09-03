import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatNumber } from '@/lib/format';

/**
 * Stock Adjustment (MANAGER / ADMIN only).
 * Used for physical recounts, write-offs, corrections.
 * Requires a reason — recorded in the audit log.
 */
export function AdjustmentPage() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [newQuantity, setNewQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');

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

  const adjust = useMutation({
    mutationFn: inventoryApi.adjustment,
    onSuccess: (data) => {
      const delta = data.qtyAfter - data.qtyBefore;
      toast.success(
        `ปรับยอดสำเร็จ — ${data.qtyBefore} → ${data.qtyAfter} (${delta >= 0 ? '+' : ''}${delta}) · ${data.transactionNo}`
      );
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      setNewQuantity('');
      setReason('');
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantId) { toast.error('เลือก variant ก่อน'); return; }
    if (newQuantity === '' || newQuantity < 0) { toast.error('กรอกจำนวนใหม่ (>= 0)'); return; }
    if (!reason.trim()) { toast.error('กรุณาระบุเหตุผล'); return; }

    adjust.mutate({
      variantId,
      newQuantity: Number(newQuantity),
      reason: reason.trim(),
    });
  };

  const selectedVariant = productDetail.data?.variants.find((v) => v.id === variantId);
  const currentQty = inventory.data?.quantity ?? 0;
  const delta = newQuantity === '' ? 0 : Number(newQuantity) - currentQty;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <SlidersHorizontal className="h-6 w-6 text-amber-600" /> ปรับสต็อก (Adjustment)
        </h1>
        <p className="text-sm text-slate-500">
          ใช้สำหรับ stock count, write-off, แก้ไขยอดให้ตรงกับของจริง — ต้องระบุเหตุผล
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /> การปรับสต็อกจะถูกบันทึกใน Stock Transaction history (type: ADJUSTMENT)
        พร้อมชื่อผู้ทำรายการและเหตุผล
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500">ยอดปัจจุบัน</div>
                  <div className="text-2xl font-bold">{formatNumber(currentQty)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">ยอดใหม่</div>
                  <input
                    type="number"
                    min={0}
                    className="input mt-1"
                    placeholder="เช่น 42"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500">ผลต่าง</div>
                  <div className={`text-2xl font-bold ${
                    delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'
                  }`}>
                    {delta > 0 ? '+' : ''}{newQuantity === '' ? '-' : formatNumber(delta)}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">เหตุผล * (audit)</label>
              <textarea
                className="input"
                rows={3}
                placeholder="เช่น 'Stock count Q2 2026 — พบ 2 เครื่องที่ไม่ได้บันทึก' หรือ 'เครื่องชำรุด ตัดออก 1 ชิ้น'"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-primary"
                  disabled={adjust.isPending || !variantId || newQuantity === '' || !reason.trim()}>
            {adjust.isPending ? 'กำลังบันทึก...' : 'ยืนยันการปรับสต็อก'}
          </button>
        </div>
      </form>
    </div>
  );
}
