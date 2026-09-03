import { FileText, PackageCheck, Receipt, Check } from 'lucide-react';

export type SaleDocumentMode = 'RECEIPT' | 'TAX_INVOICE';

function ShippingLabelOption({ selected, recipientReady, disabled, onToggle }: {
  selected: boolean;
  recipientReady: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const status = selected
    ? recipientReady
      ? 'ผู้รับพร้อมพิมพ์ · พิมพ์หลังปิดบิลสำเร็จ'
      : 'กรอกชื่อ เบอร์โทร และที่อยู่ผู้รับก่อนปิดบิล'
    : 'ตัวเลือกเสริม · กดเพื่อพิมพ์หลังปิดบิลสำเร็จ';
  return (
    <>
      <button type="button" disabled={disabled} onClick={onToggle} aria-pressed={selected}
              className={`mt-3 w-full rounded-md border px-3 py-2 text-sm font-semibold transition ${selected
                ? 'border-orange-500 bg-orange-100 text-orange-800'
                : 'border-orange-200 bg-white text-orange-700 hover:bg-orange-50'}`}>
        <span className="flex items-center justify-center gap-2">
          <PackageCheck className="h-4 w-4" /> {selected && <Check className="h-3.5 w-3.5" />}ป้ายที่อยู่ 10×15 ซม.
        </span>
      </button>
      <p className={`mt-1 text-xs ${selected && !recipientReady
        ? 'font-medium text-red-600' : 'text-slate-500'}`}>{status}</p>
    </>
  );
}

export function SaleDocumentSelector({
  mode, buyerName, disabled, shippingLabelSelected, shippingRecipientReady,
  onReceipt, onTaxInvoice, onToggleShippingLabel,
}: {
  mode: SaleDocumentMode;
  buyerName: string;
  disabled: boolean;
  shippingLabelSelected: boolean;
  shippingRecipientReady: boolean;
  onReceipt: () => void;
  onTaxInvoice: () => void;
  onToggleShippingLabel: () => void;
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
        : <p className="mt-2 truncate text-xs text-sky-700">ผู้ซื้อ: {buyerName} · พิมพ์ใบเสร็จความร้อน · VAT ถอดใน ไม่บวกเพิ่ม</p>}
      <ShippingLabelOption selected={shippingLabelSelected} recipientReady={shippingRecipientReady}
                           disabled={disabled} onToggle={onToggleShippingLabel} />
    </div>
  );
}
