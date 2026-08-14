import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { isValidTaxInvoiceBuyer, type IssueTaxInvoiceRequest } from '@/api/taxInvoice';
import { TaxInvoiceBuyerFields } from '@/components/TaxInvoiceBuyerFields';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';

export function TaxInvoiceCheckoutModal({ value, onChange, onConfirm, onClose }: {
  value: IssueTaxInvoiceRequest;
  onChange: (next: IssueTaxInvoiceRequest) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useModalChrome(onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={backdropCloseHandler(onClose)}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-5 w-5 text-brand-600" />ข้อมูลใบกำกับภาษี</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="ปิด"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
            VAT เป็นแบบถอดใน 7/107 — ระบบไม่บวก 7% เพิ่มจากยอดที่ลูกค้าจ่าย
          </div>
          <TaxInvoiceBuyerFields value={value} onChange={onChange} />
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" onClick={onConfirm} disabled={!isValidTaxInvoiceBuyer(value)}>
            ใช้ข้อมูลนี้
          </button>
        </div>
      </div>
    </div>, document.body,
  );
}
