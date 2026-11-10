import { formatDateTime, formatTHB } from '@/lib/format';
import { depositForfeited, depositPaymentText, depositSlipTitle } from '@/lib/escpos/depositEscpos';
import type { DeviceDeposit } from '@/types/api';

/**
 * ใบรับเงินมัดจำ / จองเครื่อง (FIX-222) — แบบพิมพ์ผ่านเบราว์เซอร์ (สำรองเมื่อไม่มีเครื่องปริ้นความร้อน)
 * เนื้อหาเดียวกับ buildDepositSlip · ใช้ class `receipt-print` โชว์เฉพาะตอนพิมพ์
 */
export function DepositPrintView({ deposit: d, shopName = 'DDMobile' }: { deposit: DeviceDeposit; shopName?: string }) {
  const cancelled = d.status === 'CANCELLED';
  const spec = [d.deviceColor, d.deviceStorage, d.condition === 'NEW' ? 'มือ 1' : d.condition ? 'มือ 2' : null]
    .filter(Boolean).join(' / ');
  return (
    <div className="receipt-print">
      <div className="text-center">
        <h1 className="text-xl font-bold">{shopName}</h1>
        <p className="text-xs text-slate-600">{depositSlipTitle(d)}</p>
      </div>
      <hr className="my-3 border-dashed border-slate-400" />
      <div className="text-sm">
        <div className="flex justify-between"><span>เลขที่:</span><strong>{d.depositNo}</strong></div>
        <div className="flex justify-between"><span>วันที่:</span><span>{formatDateTime(d.createdAt)}</span></div>
        {d.createdBy && <div className="flex justify-between"><span>พนักงาน:</span><span>{d.createdBy}</span></div>}
        <div className="flex justify-between"><span>ลูกค้า:</span><strong>{d.customerName}</strong></div>
        {d.customerPhone && <div className="flex justify-between"><span>โทร:</span><span>{d.customerPhone}</span></div>}
      </div>
      <hr className="my-3 border-dashed border-slate-400" />
      <div className="text-sm">
        <div className="font-semibold">{d.productName}</div>
        {spec && <div>{spec}</div>}
        {d.imei ? <div>IMEI: {d.imei}</div> : d.serialNumber ? <div>SN: {d.serialNumber}</div> : null}
        <div className="mt-1 flex justify-between"><span>ราคาที่ตกลง:</span><span>{formatTHB(d.agreedPrice)}</span></div>
      </div>
      <hr className="my-3 border-dashed border-slate-400" />
      <div className="space-y-0.5 text-sm">
        {d.payments.map((p, i) => (
          <div key={i} className="flex justify-between">
            <span>{formatDateTime(p.paidAt)} {depositPaymentText(p)}</span>
            <span>{p.kind === 'REFUND' ? '-' : ''}{formatTHB(p.amount)}</span>
          </div>
        ))}
      </div>
      <hr className="my-3 border-dashed border-slate-400" />
      {cancelled ? (
        <div className="space-y-0.5 text-sm">
          <div className="flex justify-between"><span>รับมัดจำรวม:</span><span>{formatTHB(d.paidTotal)}</span></div>
          <div className="flex justify-between text-base"><strong>คืนเงินลูกค้า:</strong><strong>{formatTHB(d.refundedTotal)}</strong></div>
          {depositForfeited(d) > 0 && (
            <div className="flex justify-between"><span>ร้านเก็บไว้ (ไม่คืน):</span><span>{formatTHB(depositForfeited(d))}</span></div>
          )}
          {d.cancelReason && <div>เหตุผล: {d.cancelReason}</div>}
          <p className="pt-2 text-center font-semibold">*** ยกเลิกแล้ว ***</p>
        </div>
      ) : (
        <div className="space-y-0.5 text-sm">
          <div className="flex justify-between text-base"><strong>มัดจำรวม:</strong><strong>{formatTHB(d.balance)}</strong></div>
          <div className="flex justify-between">
            <span>{d.status === 'COMPLETED' ? 'หักในบิลขาย:' : 'คงเหลือชำระวันรับเครื่อง:'}</span>
            <span>{formatTHB(d.status === 'COMPLETED' ? (d.appliedAmount ?? d.balance) : d.remaining)}</span>
          </div>
          {d.billNo && <div>บิลขาย: {d.billNo}</div>}
          {d.note && <div>หมายเหตุ: {d.note}</div>}
          <p className="pt-2 text-center text-xs text-slate-600">กรุณาเก็บใบนี้ไว้เป็นหลักฐาน และนำมาแสดงในวันรับเครื่อง</p>
        </div>
      )}
    </div>
  );
}
