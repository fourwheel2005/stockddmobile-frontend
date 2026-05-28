import { formatTHB, formatDateTime } from '@/lib/format';
import type { RepairTicket } from '@/types/api';

interface Props { ticket: RepairTicket; shopName?: string; }

/**
 * ใบรับซ่อม (Repair intake bill) — print-friendly.
 * Triggers via window.print(); ใช้ class `receipt-print` ที่ซ่อนในจอปกติและโชว์เฉพาะตอนพิมพ์.
 */
export function RepairBillPrintView({ ticket, shopName = 'Stockdd Mobile' }: Props) {
  return (
    <div className="receipt-print">
      <div className="text-center">
        <h1 className="text-xl font-bold">{shopName}</h1>
        <p className="text-xs text-slate-600">ใบรับซ่อม / Repair Ticket</p>
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="text-sm">
        <div className="flex justify-between"><span>เลขที่ใบรับซ่อม:</span><strong>{ticket.ticketNo}</strong></div>
        <div className="flex justify-between"><span>วันที่รับเครื่อง:</span><span>{formatDateTime(ticket.receivedAt)}</span></div>
        <div className="flex justify-between"><span>ผู้รับเครื่อง:</span><span>{ticket.receivedBy}</span></div>
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span>ลูกค้า:</span><strong>{ticket.customerName}</strong></div>
        {ticket.customerPhone && (
          <div className="flex justify-between"><span>เบอร์โทร:</span><span>{ticket.customerPhone}</span></div>
        )}
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>เครื่อง:</span>
          <span>{[ticket.deviceBrand, ticket.deviceModel, ticket.deviceColor].filter(Boolean).join(' ')}</span>
        </div>
        {ticket.imei && <div className="flex justify-between"><span>IMEI:</span><span>{ticket.imei}</span></div>}
        {ticket.serialNumber && <div className="flex justify-between"><span>Serial:</span><span>{ticket.serialNumber}</span></div>}
        <div className="mt-1">
          <div className="text-slate-600">อาการที่แจ้ง:</div>
          <div className="whitespace-pre-wrap">{ticket.reportedSymptom}</div>
        </div>
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <div className="space-y-1 text-sm">
        {ticket.estimatedCost != null && (
          <div className="flex justify-between"><span>ค่าซ่อมประเมิน:</span><span>{formatTHB(ticket.estimatedCost)}</span></div>
        )}
        <div className="flex justify-between"><span>มัดจำ:</span><span>{formatTHB(ticket.depositAmount)}</span></div>
        {ticket.repairCost > 0 && (
          <>
            <div className="flex justify-between"><span>ค่าซ่อมจริง:</span><span>{formatTHB(ticket.repairCost)}</span></div>
            <div className="flex justify-between border-t border-slate-400 pt-1 text-base">
              <strong>ยอดค้างชำระ:</strong>
              <strong>{formatTHB(ticket.balanceDue)}</strong>
            </div>
          </>
        )}
      </div>

      <hr className="my-3 border-dashed border-slate-400" />

      <p className="text-center text-xs text-slate-600">
        กรุณาเก็บใบรับซ่อมนี้ไว้เป็นหลักฐาน<br />
        และนำมาแสดงเมื่อมารับเครื่องคืน
      </p>
    </div>
  );
}
