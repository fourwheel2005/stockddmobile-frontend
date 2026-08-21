import { createPortal } from 'react-dom';
import { PackageCheck, X } from 'lucide-react';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { recipientFromOrder } from '@/lib/tspl/shippingLabel';
import type { SalesOrderResponse } from '@/types/api';
import { ShippingLabelForm } from '@/components/shipping/ShippingLabelForm';

interface ModalProps {
  order: SalesOrderResponse;
  onClose: () => void;
}

function ModalHeader({ billNo, onClose }: { billNo: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <PackageCheck className="h-5 w-5 text-orange-600" /> ป้ายจัดส่ง 10×15 ซม. — {billNo}
      </h2>
      <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="ปิด">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ShippingLabelModal({ order, onClose }: ModalProps) {
  useModalChrome(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
         onClick={backdropCloseHandler(onClose)}>
      <div role="dialog" aria-modal="true"
           className="my-auto w-full max-w-lg rounded-lg bg-white shadow-2xl">
        <ShippingLabelForm
          initialRecipient={recipientFromOrder(order)}
          reference={order.billNo}
          header={<ModalHeader billNo={order.billNo} onClose={onClose} />}
          onPrinted={onClose}
          onCancel={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
