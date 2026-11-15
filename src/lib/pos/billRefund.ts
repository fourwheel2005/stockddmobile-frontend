import type { SalesOrderResponse } from '@/types/api';

/**
 * ปุ่มยกเลิก/คืนเงินของบิลขาย (FIX-228) — ตรงกับกติกา backend (PosService.assertFullRefundAllowed)
 * ให้พนักงานเห็นเหตุผลก่อนกรอกรหัสร้าน แทนที่จะไปเจอ error ตอนท้าย
 *
 *  - REFUND: ยกเลิกบิลทั้งบิล คืนเงินตามช่องทาง (บิลที่ยังไม่ออกใบกำกับ)
 *  - CREDIT_NOTE: บิลที่ออกใบกำกับแล้ว ต้องออกใบลดหนี้คู่กับการคืนเงิน
 *  - RETURN_DEVICE: บิลผ่อน ลูกค้าผ่อนไม่ไหว คืนเครื่อง (ร้านเลือกคืนเงินบางส่วน/ไม่คืน)
 */
export type BillRefundAction = 'REFUND' | 'CREDIT_NOTE' | 'RETURN_DEVICE';

export interface BillRefundOption {
  action: BillRefundAction;
  label: string;
  /** มีค่า = กดแล้วบอกเหตุผล ไม่เปิดขั้นตอนคืนเงิน */
  blockedReason: string | null;
}

type RefundableOrder = Pick<SalesOrderResponse,
  'status' | 'paymentMethod' | 'taxInvoiceNo' | 'tradeInValue' | 'depositAppliedAmount' | 'depositNo'>;

const baht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

/** เหตุผลที่ "คืนทั้งบิลอัตโนมัติ" ไม่ได้ (null = ทำได้) */
export function fullRefundBlockedReason(o: RefundableOrder): string | null {
  const tradeIn = o.tradeInValue ?? 0;
  if (tradeIn > 0) {
    return `บิลนี้มีเทิร์นเครื่องเก่า ${baht(tradeIn)} — ระบบคืนทั้งบิลอัตโนมัติไม่ได้ `
      + '(ต้องคืนเครื่องเทิร์นให้ลูกค้าด้วย) · คืนเครื่องเทิร์น + เงินกับเจ้าของ/บัญชี';
  }
  const deposit = o.depositAppliedAmount ?? 0;
  if (deposit > 0) {
    return `บิลนี้หักเงินมัดจำ ${baht(deposit)}${o.depositNo ? ` (ใบ ${o.depositNo})` : ''} — `
      + 'เงินรับ 2 วัน ระบบคืนทั้งบิลอัตโนมัติไม่ได้ · คืนเงินมัดจำ + ยอดวันขายกับเจ้าของ/บัญชี';
  }
  return null;
}

export function billRefundOptions(o: RefundableOrder): BillRefundOption[] {
  if (o.status !== 'PAID') return [];
  const options: BillRefundOption[] = [];
  const blocked = fullRefundBlockedReason(o);
  options.push(o.taxInvoiceNo
    ? { action: 'CREDIT_NOTE', label: 'ใบลดหนี้ + คืนเงิน', blockedReason: blocked }
    : { action: 'REFUND', label: 'ยกเลิกบิล / คืนเงิน', blockedReason: blocked });
  // รับเครื่องคืน (ผ่อนไม่ไหว) ไม่ผ่านกติกาคืนทั้งบิล — backend เพดานเงินคืนหักเครดิตเทิร์นให้เอง
  if (o.paymentMethod === 'INSTALLMENT' && !o.taxInvoiceNo) {
    options.push({ action: 'RETURN_DEVICE', label: 'รับเครื่องคืน (ผ่อนไม่ไหว)', blockedReason: null });
  }
  return options;
}
