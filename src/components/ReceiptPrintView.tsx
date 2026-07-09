import { formatTHB, formatDateTime } from '@/lib/format';
import { hasRealImei } from '@/lib/escpos/ddmobileReceipt';
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

      {/* ผ่อน → ไม่โชว์ราคาเครื่องเต็ม (ลูกค้าเห็นยอดดาวน์+อุปกรณ์เสริมที่จ่ายวันนี้ + ค่างวด) — FIX-070/FIX-090 */}
      {(() => {
      const hidePrice = order.paymentMethod === 'INSTALLMENT';
      // อุปกรณ์เสริมจ่ายสดวันนี้ในบิลผ่อน = บรรทัดไม่มี IMEI/SN (หัวชาร์จ/เคส)
      const addOn = hidePrice
        ? order.items.filter((it) => !hasRealImei(it.imei) && !it.serialNumber)
            .reduce((s, it) => s + (it.lineTotal ?? 0), 0)
        : 0;
      return (
      <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="py-1 text-left">รายการ</th>
            {!hidePrice && <th className="py-1 text-right">จำนวน</th>}
            {!hidePrice && <th className="py-1 text-right">ราคา</th>}
            {!hidePrice && <th className="py-1 text-right">รวม</th>}
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => {
            const spec = [it.color, it.storage, it.condition].filter(Boolean).join(' · ');
            return (
            <tr key={it.id} className="border-b border-slate-200">
              <td className="py-1.5">
                <div>{it.productName}</div>
                {spec && <div className="text-xs text-slate-600">{spec}</div>}
                {hasRealImei(it.imei)
                  ? <div className="text-xs text-slate-600">IMEI: {it.imei}</div>
                  : it.serialNumber
                    ? <div className="text-xs text-slate-600">SN: {it.serialNumber}</div>
                    : <div className="text-xs text-slate-600">{it.sku}</div>}
                {/* บิลผ่อน: อุปกรณ์เสริมจ่ายสดวันนี้ → โชว์ราคา (เครื่องที่ผ่อนไม่โชว์) FIX-090 */}
                {hidePrice && !hasRealImei(it.imei) && !it.serialNumber && (it.lineTotal ?? 0) > 0 && (
                  <div className="text-xs text-emerald-700">
                    จ่ายวันนี้: {it.quantity} × {formatTHB(it.sellPrice)} = {formatTHB(it.lineTotal)}
                  </div>
                )}
              </td>
              {!hidePrice && <td className="py-1.5 text-right">{it.quantity}</td>}
              {!hidePrice && <td className="py-1.5 text-right">{formatTHB(it.sellPrice)}</td>}
              {!hidePrice && <td className="py-1.5 text-right">{formatTHB(it.lineTotal)}</td>}
            </tr>
          ); })}
          {order.items.length === 0 && (
            /* บิลรับค่างวด (FIX-085) — ไม่มีสินค้าจากสต็อก */
            <tr className="border-b border-slate-200">
              <td className="py-1.5"><div>{order.note || 'รับชำระค่างวด'}</div></td>
              {!hidePrice && <td className="py-1.5 text-right">1</td>}
              {!hidePrice && <td className="py-1.5 text-right">{formatTHB(order.grandTotal)}</td>}
              {!hidePrice && <td className="py-1.5 text-right">{formatTHB(order.grandTotal)}</td>}
            </tr>
          )}
        </tbody>
      </table>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="space-y-1 text-sm">
        {!hidePrice && (
          <>
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
          </>
        )}
        {hidePrice && (
          // ผ่อน → ยอดสุทธิ = เงินรับวันนี้ (ดาวน์ + อุปกรณ์เสริมจ่ายสด) — FIX-072/FIX-090
          <>
            {addOn > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>เงินดาวน์:</span><span>{formatTHB(order.downPaymentAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>อุปกรณ์เสริม (จ่ายวันนี้):</span><span>{formatTHB(addOn)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-slate-400 pt-1 text-base">
              <strong>ยอดสุทธิ:</strong>
              <strong>{formatTHB((order.downPaymentAmount ?? 0) + addOn)}</strong>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <span>วิธีชำระ:</span>
          <span>{order.paymentMethod ? PAYMENT_TH[order.paymentMethod] : '-'}</span>
        </div>
        {order.paymentMethod === 'INSTALLMENT' && order.installmentMonths && (
          <>
            <div className="text-xs text-slate-500">
              (ยอดสุทธิ = เงินรับวันนี้{addOn > 0 ? ': ดาวน์ + อุปกรณ์เสริม' : ' (เงินดาวน์)'})
            </div>
            {(order.cashAmount ?? 0) > 0 && (
              <div className="flex justify-between text-slate-500">
                <span className="pl-3">- เงินสด:</span>
                <span>{formatTHB(order.cashAmount ?? 0)}</span>
              </div>
            )}
            {(order.transferAmount ?? 0) > 0 && (
              <div className="flex justify-between text-slate-500">
                <span className="pl-3">- เงินโอน:</span>
                <span>{formatTHB(order.transferAmount ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>ผ่อน {order.installmentMonths} เดือน:</span>
              <span>
                {formatTHB(
                  // ค่างวดที่พนักงานกำหนด (รวมดอกเบี้ย) ถ้ามี · ไม่งั้น fallback (ยอด−ดาวน์−อุปกรณ์เสริม)/งวด (FIX-090)
                  order.installmentMonthlyAmount != null && order.installmentMonthlyAmount > 0
                    ? order.installmentMonthlyAmount
                    : Math.max(0, (order.grandTotal ?? 0) - (order.downPaymentAmount ?? 0) - addOn) /
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
      </>
      ); })()}

      <hr className="my-3 border-dashed border-slate-400" />

      <p className="text-center text-xs text-slate-600">
        ✓ ขอบคุณที่ใช้บริการ<br />
        เก็บใบเสร็จเพื่อเป็นหลักฐานการรับประกัน
      </p>
    </div>
  );
}
