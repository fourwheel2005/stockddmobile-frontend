import { EscPosBuilder } from './EscPosBuilder';
import type { DeviceDeposit, DeviceDepositPaymentLine } from '@/types/api';
import { formatInShopZone, parseServerDateTime } from '../datetime';

/**
 * ใบรับเงินมัดจำ / จองเครื่อง (FIX-222) — หลักฐานให้ลูกค้าทุกครั้งที่รับ/คืนเงินมัดจำ
 * แสดงทุกรายการเงินของใบ (รับ + คืน) → มัดจำที่ร้านถืออยู่ → ยอดคงเหลือที่ต้องชำระวันรับเครื่อง
 */

export const DEPOSIT_PAY_LABEL: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร', QR: 'QR',
};

export function depositSlipTitle(d: DeviceDeposit): string {
  if (d.status === 'CANCELLED') return 'ใบยกเลิก / คืนเงินมัดจำ';
  return d.kind === 'ORDER' ? 'ใบรับเงินมัดจำสั่งเครื่อง' : 'ใบรับเงินมัดจำจองเครื่อง';
}

/** เงินมัดจำที่ร้านริบไว้ตอนยกเลิก (รับ − คืน) · ใบที่ยังไม่ยกเลิก = 0 */
export function depositForfeited(d: DeviceDeposit): number {
  return d.status === 'CANCELLED' ? Math.max(0, d.paidTotal - d.refundedTotal) : 0;
}

export function depositPaymentText(p: DeviceDepositPaymentLine): string {
  return `${p.kind === 'REFUND' ? 'คืนเงิน' : 'รับเงิน'} (${DEPOSIT_PAY_LABEL[p.method] ?? p.method})`;
}

function baht(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!parseServerDateTime(iso)) return '-';
  return formatInShopZone(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' ' + formatInShopZone(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

const W = 48;

export function buildDepositSlip(d: DeviceDeposit): Uint8Array {
  const cancelled = d.status === 'CANCELLED';
  const b = new EscPosBuilder().init().codepage(26)
    .align('C').size(2, 2).bold(true).textln('DDMobile').bold(false).size(1, 1)
    .textln('IPHONE & ACCESSORIES')
    .textln(depositSlipTitle(d))
    .separator('=', W).align('L')
    .textln(`เลขที่: ${d.depositNo}`)
    .textln(`วันที่: ${fmtDate(d.createdAt)}`);
  if (d.createdBy) b.textln(`พนักงาน: ${d.createdBy}`);

  b.separator('-', W).textln(`ลูกค้า: ${d.customerName}`);
  if (d.customerPhone) b.textln(`โทร: ${d.customerPhone}`);

  b.separator('-', W).bold(true).textln(d.productName).bold(false);
  const spec = [d.deviceColor, d.deviceStorage, d.condition === 'NEW' ? 'มือ 1' : d.condition ? 'มือ 2' : null]
    .filter(Boolean).join(' / ');
  if (spec) b.textln(spec);
  if (d.imei) b.textln(`IMEI: ${d.imei}`);
  else if (d.serialNumber) b.textln(`SN: ${d.serialNumber}`);
  if (d.kind === 'ORDER' && d.status === 'WAITING_ARRIVAL' && d.expectedDate) b.textln(`คาดว่าเครื่องถึง: ${d.expectedDate}`);

  b.separator('-', W).justify('ราคาที่ตกลง:', baht(d.agreedPrice), W);
  b.separator('-', W);
  for (const p of d.payments) {
    b.justify(`${fmtDate(p.paidAt)} ${depositPaymentText(p)}`, `${p.kind === 'REFUND' ? '-' : ''}${baht(p.amount)}`, W);
  }
  b.separator('-', W);
  if (cancelled) {
    b.justify('รับมัดจำรวม:', baht(d.paidTotal), W)
      .bold(true).justify('คืนเงินลูกค้า:', baht(d.refundedTotal), W).bold(false);
    if (depositForfeited(d) > 0) b.justify('ร้านเก็บไว้ (ไม่คืน):', baht(depositForfeited(d)), W);
    if (d.cancelReason) b.textln(`เหตุผล: ${d.cancelReason}`);
    b.align('C').separator('=', W).textln('*** ยกเลิกแล้ว ***');
  } else {
    b.bold(true).size(1, 2).justify('มัดจำรวม:', baht(d.balance), W).size(1, 1).bold(false)
      .justify(d.status === 'COMPLETED' ? 'หักในบิลขาย:' : 'คงเหลือชำระวันรับเครื่อง:',
        baht(d.status === 'COMPLETED' ? (d.appliedAmount ?? d.balance) : d.remaining), W);
    if (d.billNo) b.textln(`บิลขาย: ${d.billNo}`);
    if (d.note) b.textln(`หมายเหตุ: ${d.note}`);
    b.align('C').separator('-', W)
      .textln('กรุณาเก็บใบนี้ไว้เป็นหลักฐาน')
      .textln('และนำมาแสดงในวันรับเครื่อง');
  }
  return b.feed(3).cut().build();
}
