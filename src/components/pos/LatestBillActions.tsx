import { FileText, Printer } from 'lucide-react';
import type { SalesOrderResponse } from '@/types/api';

export function LatestBillActions({ order, printing, onPrintReceipt, onPrintTaxInvoice, onIssueTaxInvoice }: {
  order: SalesOrderResponse;
  printing: boolean;
  onPrintReceipt: () => void;
  onPrintTaxInvoice: () => void;
  onIssueTaxInvoice: () => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="mb-2 text-sm font-semibold text-emerald-800">✓ บิลล่าสุด {order.billNo}</div>
      {order.taxInvoiceNo && <div className="mb-2 text-xs text-emerald-700">ใบกำกับ {order.taxInvoiceNo} ถูกบันทึกแล้ว</div>}
      {order.taxInvoiceNo ? (
        <button className="btn-secondary w-full" disabled={printing} onClick={onPrintTaxInvoice}>
          <Printer className="h-4 w-4" /> {printing ? 'กำลังพิมพ์...' : 'พิมพ์ใบกำกับอีกครั้ง'}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" disabled={printing} onClick={onPrintReceipt}>
            <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จซ้ำ
          </button>
          <button className="btn-secondary text-brand-700" onClick={onIssueTaxInvoice}>
            <FileText className="h-4 w-4" /> ออกใบกำกับภาษี
          </button>
        </div>
      )}
    </div>
  );
}
