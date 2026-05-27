import { formatTHB, formatDateTime } from '@/lib/format';
import type { PaymentMethod, SalesOrderResponse } from '@/types/api';

const PAYMENT_TH: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  CARD: 'บัตรเครดิต/เดบิต',
  TRANSFER: 'โอนเงิน / QR',
  QR: 'QR / พร้อมเพย์',
  INSTALLMENT: 'ผ่อนชำระรายเดือน',
};

interface Props { order: SalesOrderResponse; shopName?: string; }

/**
 * Print-friendly receipt. Triggers via window.print().
 * Hidden in normal view (display:none) — only visible in print media via CSS.
 */
export function ReceiptPrintView({ order, shopName = 'Stockdd Mobile' }: Props) {
  return (
    <div className="receipt-print">
      <div className="text-center">
        <h1 className="text-xl font-bold">{shopName}</h1>
        <p className="text-xs text-slate-600">ใบเสร็จรับเงิน / Receipt</p>
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="text-sm">
        <div className="flex justify-between"><span>เลขที่บิล:</span><strong>{order.billNo}</strong></div>
        <div className="flex justify-between"><span>วันที่:</span><span>{formatDateTime(order.closedAt ?? order.createdAt)}</span></div>
        <div className="flex justify-between"><span>ผู้ขาย:</span><span>{order.createdBy}</span></div>
        {order.customerName && (
          <div className="flex justify-between"><span>ลูกค้า:</span><span>{order.customerName}</span></div>
        )}
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="py-1 text-left">รายการ</th>
            <th className="py-1 text-right">จำนวน</th>
            <th className="py-1 text-right">ราคา</th>
            <th className="py-1 text-right">รวม</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it.id} className="border-b border-slate-200">
              <td className="py-1.5">
                <div>{it.productName}</div>
                <div className="text-xs text-slate-600">{it.sku}</div>
                {it.imei && <div className="text-xs text-slate-600">IMEI: {it.imei}</div>}
              </td>
              <td className="py-1.5 text-right">{it.quantity}</td>
              <td className="py-1.5 text-right">{formatTHB(it.sellPrice)}</td>
              <td className="py-1.5 text-right">{formatTHB(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span>ยอดรวม:</span><span>{formatTHB(order.subtotal)}</span></div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between"><span>ส่วนลด:</span><span>- {formatTHB(order.discountAmount)}</span></div>
        )}
        {order.vatAmount > 0 && (
          <div className="flex justify-between"><span>ภาษีมูลค่าเพิ่ม:</span><span>{formatTHB(order.vatAmount)}</span></div>
        )}
        <div className="flex justify-between border-t border-slate-400 pt-1 text-base">
          <strong>ยอดสุทธิ:</strong>
          <strong>{formatTHB(order.grandTotal)}</strong>
        </div>
        <div className="flex justify-between">
          <span>วิธีชำระ:</span>
          <span>{order.paymentMethod ? PAYMENT_TH[order.paymentMethod] : '-'}</span>
        </div>
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <p className="text-center text-xs text-slate-600">
        ✓ ขอบคุณที่ใช้บริการ<br />
        เก็บใบเสร็จเพื่อเป็นหลักฐานการรับประกัน
      </p>
    </div>
  );
}
