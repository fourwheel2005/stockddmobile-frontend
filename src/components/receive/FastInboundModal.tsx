import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { productsApi } from '@/api/products';
import { FastInboundForm } from './FastInboundForm';
import { ProductFastInboundModal } from './ProductFastInboundModal';
import type { VariantResponse } from '@/types/api';

interface Props {
  variant: VariantResponse;
  onClose: () => void;
  onDone: () => void;
}

/**
 * ประตูรับเข้าจาก "แถว SKU" (ปุ่ม 📥 ที่ /products และหน้ารุ่น) — FIX-114
 * มือถือ (serialized) → ฟอร์มรับเข้าหนึ่งเดียวระดับรุ่น (prefill สี/ความจุ/มือของ SKU ที่กด)
 *   ทุกทางวิ่ง /products/wizard เหมือนกัน — จับ SKU ตามมือ ไม่มีทางลงผิดมือ (FIX-113)
 * อุปกรณ์เสริม (bulk) → ฟอร์มนับจำนวนต่อ SKU เดิม
 */
export function FastInboundModal({ variant, onClose, onDone }: Props) {
  useModalChrome(onClose);

  // ดึง product detail เพื่อรู้ serialized flag + รายการ SKU ทั้งรุ่น
  const productQuery = useQuery({
    queryKey: ['product', variant.productId],
    queryFn: () => productsApi.get(variant.productId),
  });

  if (productQuery.data?.serialized) {
    return (
      <ProductFastInboundModal
        product={productQuery.data}
        initialVariant={variant}
        onClose={onClose}
        onDone={onDone}
      />
    );
  }

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">

        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">📥 รับสินค้าเข้า</h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {productQuery.isLoading && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {productQuery.error && (
            <p className="text-center text-sm text-red-500">โหลดข้อมูลสินค้าไม่สำเร็จ</p>
          )}
          {productQuery.data && !productQuery.data.serialized && (
            <FastInboundForm
              variant={variant}
              onBack={onClose}
              onDone={() => { onDone(); onClose(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
