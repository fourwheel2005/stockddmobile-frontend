import { formatTHB, formatDateTime } from '@/lib/format';
import type { PaymentMethod, SalesOrderResponse, ShippingPartner } from '@/types/api';

const PAYMENT_TH: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  CARD: 'บัตรเครดิต/เดบิต',
  TRANSFER: 'โอนเงิน / QR',
  QR: 'QR / พร้อมเพย์',
  INSTALLMENT: 'ผ่อนชำระรายเดือน',
  MIXED: 'ผสม (สด+โอน/บัตร/QR)',
};

const PARTNER_TH: Record<ShippingPartner, string> = {
  ICE: 'น้ำแข็ง',
  YUEM_MAI: 'ยืมมั้ย',
  PEE_KEAW: 'พี่เขียว',
  GREATER: 'กรีทเตอร์',
  RED_HEAT: 'เรด ฮีท',
  AMP_MOBILE: 'แอมป์ โมบาย',
  PICKUP: 'ลูกค้ารับเอง',
  OTHER: 'อื่นๆ',
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
        {order.customerPhone && (
          <div className="flex justify-between"><span>เบอร์โทร:</span><span>{order.customerPhone}</span></div>
        )}
        {order.orderChannel === 'ONLINE' && (
          <div className="flex justify-between"><span>ช่องทาง:</span><span>ออนไลน์</span></div>
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
        {order.shippingFee > 0 && (
          <div className="flex justify-between">
            <span>ค่าจัดส่ง{order.shippingPartner ? ` (${PARTNER_TH[order.shippingPartner]})` : ''}:</span>
            <span>{formatTHB(order.shippingFee)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-400 pt-1 text-base">
          <strong>ยอดสุทธิ:</strong>
          <strong>{formatTHB(order.grandTotal)}</strong>
        </div>
        <div className="flex justify-between">
          <span>วิธีชำระ:</span>
          <span>{order.paymentMethod ? PAYMENT_TH[order.paymentMethod] : '-'}</span>
        </div>
        {order.paymentMethod === 'INSTALLMENT' && order.installmentMonths && (
          <>
            <div className="flex justify-between">
              <span>เงินดาวน์:</span>
              <span>{formatTHB(order.downPaymentAmount ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>ผ่อน {order.installmentMonths} เดือน × :</span>
              <span>
                {formatTHB(
                  ((order.grandTotal ?? 0) - (order.downPaymentAmount ?? 0)) /
                    Math.max(1, order.installmentMonths)
                )} / เดือน
              </span>
            </div>
          </>
        )}
        {(order.shippingTrackingNo || order.shippingAddress) && (
          <div className="mt-2 border-t border-dashed border-slate-300 pt-2 text-xs">
            <div className="font-semibold">📦 ข้อมูลจัดส่ง</div>
            {order.shippingTrackingNo && (
              <div>เลขพัสดุ: {order.shippingTrackingNo}</div>
            )}
            {order.shippingAddress && (
              <div className="whitespace-pre-line">{order.shippingAddress}</div>
            )}
          </div>
        )}
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <p className="text-center text-xs text-slate-600">
        ✓ ขอบคุณที่ใช้บริการ<br />
        เก็บใบเสร็จเพื่อเป็นหลักฐานการรับประกัน
      </p>
    </div>
  );
}
