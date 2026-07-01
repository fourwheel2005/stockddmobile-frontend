import { EscPosBuilder } from './EscPosBuilder';
import type { RepairTicket } from '@/types/api';

export type RepairSlipMode = 'INTAKE' | 'RECEIPT';

const PAY_LABEL: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร', QR: 'QR', INSTALLMENT: 'ผ่อน', MIXED: 'ผสม',
};

function baht(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' บาท';
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * สร้าง ESC/POS ใบซ่อม (CP874 codepage 26 เหมือนใบเสร็จขาย) — พิมพ์ผ่านเครื่องปริ้นความร้อน.
 *  - INTAKE  = ใบรับซ่อม (ตอนรับเครื่อง)
 *  - RECEIPT = ใบเสร็จค่าซ่อม (ตอนลูกค้ามารับ+จ่าย)
 */
export function buildRepairSlip(t: RepairTicket, mode: RepairSlipMode): Uint8Array {
  const b = new EscPosBuilder().init().codepage(26)
    .align('C').size(2, 2).bold(true).textln('DDMobile').bold(false).size(1, 1)
    .textln('IPHONE & ACCESSORIES')
    .textln(mode === 'RECEIPT' ? 'ใบเสร็จรับเงิน (ค่าซ่อม)' : 'ใบรับซ่อม / Repair Ticket')
    .separator('=', 48).align('L')
    .textln(`เลขที่: ${t.ticketNo}`)
    .textln(`วันที่รับ: ${fmtDate(t.receivedAt)}`);
  if (mode === 'RECEIPT') b.textln(`วันที่รับคืน: ${fmtDate(t.pickedUpAt)}`);

  b.separator('-', 48)
    .textln(`ลูกค้า: ${t.customerName}`);
  if (t.customerPhone) b.textln(`โทร: ${t.customerPhone}`);
  b.textln(`เครื่อง: ${[t.deviceBrand, t.deviceModel, t.deviceColor].filter(Boolean).join(' ')}`);
  if (t.imei) b.textln(`IMEI: ${t.imei}`);
  if (t.screenCode) b.textln(`รหัสหน้าจอ: ${t.screenCode}`);

  b.separator('-', 48)
    .textln('อาการที่แจ้ง:')
    .textln(t.reportedSymptom);
  if (t.workDescription) {
    b.textln('งานที่ซ่อม/อะไหล่:').textln(t.workDescription);
  }

  b.separator('-', 48);
  if (mode === 'RECEIPT') {
    b.textln(`ค่าซ่อม:        ${baht(t.repairCost)}`)
     .textln(`มัดจำ:          ${baht(t.depositAmount)}`)
     .bold(true).size(1, 2).textln(`ชำระเพิ่ม: ${baht(t.balanceDue)}`).size(1, 1).bold(false)
     .textln(`วิธีชำระ: ${PAY_LABEL[t.paymentMethod ?? ''] ?? t.paymentMethod ?? '-'}`)
     .align('C').separator('=', 48).textln('*** ชำระเงินแล้ว ***');
  } else {
    if (t.estimatedCost) b.textln(`ประเมินค่าซ่อม: ${baht(t.estimatedCost)}`);
    b.textln(`มัดจำ:          ${baht(t.depositAmount)}`)
     .align('C').separator('-', 48)
     .textln('กรุณาเก็บใบรับซ่อมนี้ไว้เป็นหลักฐาน')
     .textln('เพื่อรับเครื่องคืน');
  }

  return b.align('C').textln('').textln(fmtDate(new Date().toISOString())).feedAndCut(4).build();
}
