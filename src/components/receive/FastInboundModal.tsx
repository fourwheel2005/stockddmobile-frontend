import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { productsApi } from '@/api/products';
import { FastInboundForm } from './FastInboundForm';
import type { VariantResponse } from '@/types/api';

interface Props {
  variant: VariantResponse;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Modal wrapper รอบ FastInboundForm — ใช้ใน /products page
 * (ไม่ต้อง navigate ออกจากหน้า)
 */
export function FastInboundModal({ variant, onClose, onDone }: Props) {
  useModalChrome(onClose);

  // ดึง product detail เพื่อรู้ serialized flag
  const productQuery = useQuery({
    queryKey: ['product', variant.productId],
    queryFn: () => productsApi.get(variant.productId),
  });

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">

        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">📥 รับเข้า Lot ใหม่</h2>
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
          {productQuery.data && (
            <FastInboundForm
              variant={variant}
              isSerialized={productQuery.data.serialized}
              onBack={onClose}
              onDone={() => { onDone(); onClose(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
