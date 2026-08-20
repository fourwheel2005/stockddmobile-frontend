import { FileText, PackageCheck, Printer } from 'lucide-react';
import type { SalesOrderResponse } from '@/types/api';

interface LatestBillActionsProps {
  order: SalesOrderResponse;
  printing: boolean;
  onPrintReceipt: () => void;
  onPrintTaxInvoice: () => void;
  onIssueTaxInvoice: () => void;
  onPrintShippingLabel: () => void;
}

function BillDocumentActions(props: LatestBillActionsProps) {
  if (props.order.taxInvoiceNo) {
    return (
      <button className="btn-secondary w-full" disabled={props.printing} onClick={props.onPrintTaxInvoice}>
        <Printer className="h-4 w-4" /> {props.printing ? 'กำลังพิมพ์...' : 'พิมพ์ใบกำกับอีกครั้ง'}
      </button>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button className="btn-secondary" disabled={props.printing} onClick={props.onPrintReceipt}>
        <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จ
      </button>
      <button className="btn-secondary text-brand-700" onClick={props.onIssueTaxInvoice}>
        <FileText className="h-4 w-4" /> ออกใบกำกับภาษี
      </button>
    </div>
  );
}

export function LatestBillActions(props: LatestBillActionsProps) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="mb-2 text-sm font-semibold text-emerald-800">✓ บิลล่าสุด {props.order.billNo}</div>
      {props.order.taxInvoiceNo && (
        <div className="mb-2 text-xs text-emerald-700">ใบกำกับ {props.order.taxInvoiceNo} ถูกบันทึกแล้ว</div>
      )}
      <BillDocumentActions {...props} />
      <button className="btn-secondary mt-2 w-full border-orange-200 text-orange-700"
              onClick={props.onPrintShippingLabel}>
        <PackageCheck className="h-4 w-4" /> ป้ายจัดส่ง 10×15 ซม.
      </button>
    </div>
  );
}
