import { FileText, Receipt } from 'lucide-react';

export type SaleDocumentMode = 'RECEIPT' | 'TAX_INVOICE';

export function SaleDocumentSelector({ mode, buyerName, disabled, onReceipt, onTaxInvoice }: {
  mode: SaleDocumentMode;
  buyerName: string;
  disabled: boolean;
  onReceipt: () => void;
  onTaxInvoice: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-600">เอกสารหลังรับชำระ</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled} onClick={onReceipt}
                className={mode === 'RECEIPT' ? 'btn-primary' : 'btn-secondary'}>
          <Receipt className="h-4 w-4" /> ใบเสร็จรับเงิน
        </button>
        <button type="button" disabled={disabled} onClick={onTaxInvoice}
                className={mode === 'TAX_INVOICE' ? 'btn-primary' : 'btn-secondary'}>
          <FileText className="h-4 w-4" /> ใบกำกับภาษีเต็มรูป
        </button>
      </div>
      {mode === 'RECEIPT'
        ? <p className="mt-2 text-xs text-slate-500">ค่าเริ่มต้น · VAT เพิ่ม 0% · ปิดบิลและพิมพ์แบบเดิมได้ทันที</p>
        : <p className="mt-2 truncate text-xs text-sky-700">ผู้ซื้อ: {buyerName} · VAT ถอดใน ไม่บวกเพิ่ม</p>}
    </div>
  );
}
