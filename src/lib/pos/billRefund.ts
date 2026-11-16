import type { SalesOrderItemResponse, SalesOrderResponse } from '@/types/api';

/**
 * ปุ่มยกเลิก/คืนเงิน/รับคืน/เปลี่ยนเครื่องของบิลขาย (FIX-228 → FIX-230) — ตรงกับกติกา backend
 * ให้พนักงานเห็นเหตุผลก่อนกรอกรหัสร้าน แทนที่จะไปเจอ error ตอนท้าย
 *
 *  - REFUND: ยกเลิกทั้งบิล คืนเงินตามช่องทาง (บิลที่ยังไม่ออกใบกำกับ และยังไม่เคยรับคืนบางรายการ)
 *  - CREDIT_NOTE: บิลที่ออกใบกำกับแล้ว ต้องออกใบลดหนี้คู่กับการคืนเงินทั้งบิล
 *  - RETURN_ITEMS: เลือกเครื่อง/อุปกรณ์ที่ลูกค้าคืน + จำนวน คืนเงินตามที่ตกลง (บิลผ่อน = รับเครื่องคืน)
 *  - EXCHANGE: เปลี่ยนเครื่อง — คืนจากบิลนี้แล้วใช้ยอดคืนเป็นเครดิตบิลใหม่ที่ POS (ไม่มีเงินออกเก๊ะ)
 */
export type BillRefundAction = 'REFUND' | 'CREDIT_NOTE' | 'RETURN_ITEMS' | 'EXCHANGE';

export interface BillRefundOption {
  action: BillRefundAction;
  label: string;
  /** มีค่า = กดแล้วบอกเหตุผล ไม่เปิดขั้นตอนคืนเงิน */
  blockedReason: string | null;
}

type Line = Pick<SalesOrderItemResponse, 'imei' | 'serialNumber' | 'custom'>
  & Partial<Pick<SalesOrderItemResponse, 'id' | 'quantity' | 'returnedQuantity' | 'sellPrice' | 'serialItemId'>>;

type RefundableOrder = Pick<SalesOrderResponse,
  'status' | 'paymentMethod' | 'taxInvoiceNo' | 'tradeInValue' | 'depositAppliedAmount' | 'depositNo'>
  & Partial<Pick<SalesOrderResponse, 'returnedAmount' | 'exchangeCreditAmount' | 'exchangeFromBillNo'>>
  & { items: Line[] };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const baht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

/** เครื่อง (มี IMEI/Serial) ในบิล — อุปกรณ์เสริม/รายการพิมพ์เองไม่นับ */
export const deviceLines = <T extends { imei: string | null; serialNumber: string | null; custom?: boolean }>(
  items: T[]) => items.filter((i) => !i.custom && (i.imei || i.serialNumber));

/** จำนวนที่ลูกค้ายังถืออยู่ (คืนได้อีก) */
export const remainingQty = (i: Pick<SalesOrderItemResponse, 'quantity' | 'returnedQuantity'> | Line) =>
  Math.max(0, (i.quantity ?? 1) - (i.returnedQuantity ?? 0));

const hasReturns = (o: RefundableOrder) =>
  (o.returnedAmount ?? 0) > 0 || o.items.some((i) => (i.returnedQuantity ?? 0) > 0);

/** เหตุผลที่ "ยกเลิกทั้งบิลอัตโนมัติ" ไม่ได้ (null = ทำได้) */
export function fullRefundBlockedReason(o: RefundableOrder): string | null {
  const tradeIn = o.tradeInValue ?? 0;
  if (tradeIn > 0) {
    return `บิลนี้มีเทิร์นเครื่องเก่า ${baht(tradeIn)} — ยกเลิกทั้งบิลอัตโนมัติไม่ได้ `
      + '(ต้องคืนเครื่องเทิร์นให้ลูกค้าด้วย) · ใช้ "รับคืนสินค้า" (คืนเงินได้ถึงยอดที่ลูกค้าจ่ายจริง)';
  }
  const deposit = o.depositAppliedAmount ?? 0;
  if (deposit > 0) {
    return `บิลนี้หักเงินมัดจำ ${baht(deposit)}${o.depositNo ? ` (ใบ ${o.depositNo})` : ''} — `
      + 'เงินรับ 2 วัน ยกเลิกทั้งบิลอัตโนมัติไม่ได้ · ใช้ "รับคืนสินค้า" (คืนได้รวมมัดจำ)';
  }
  if (hasReturns(o)) {
    return 'บิลนี้รับคืนบางรายการไปแล้ว — ยกเลิกทั้งบิลไม่ได้ ใช้ "รับคืนสินค้า" กับรายการที่เหลือ';
  }
  const exchange = o.exchangeCreditAmount ?? 0;
  if (exchange > 0) {
    return `บิลนี้ใช้เครดิตเปลี่ยนเครื่อง ${baht(exchange)}${o.exchangeFromBillNo ? ` จากบิล ${o.exchangeFromBillNo}` : ''} `
      + '— ยกเลิกทั้งบิลอัตโนมัติไม่ได้ · ใช้ "รับคืนสินค้า" (คืนได้รวมเครดิต)';
  }
  return null;
}

export function billRefundOptions(o: RefundableOrder): BillRefundOption[] {
  if (o.status !== 'PAID') return [];
  const options: BillRefundOption[] = [];
  options.push(o.taxInvoiceNo
    ? { action: 'CREDIT_NOTE', label: 'ใบลดหนี้ + คืนเงิน', blockedReason: fullRefundBlockedReason(o) }
    : { action: 'REFUND', label: 'ยกเลิกบิล / คืนเงิน', blockedReason: fullRefundBlockedReason(o) });
  const returnable = !o.taxInvoiceNo && o.items.some((i) => remainingQty(i) > 0);
  if (returnable) {
    const installment = o.paymentMethod === 'INSTALLMENT' && deviceLines(o.items).length > 0;
    options.push({
      action: 'RETURN_ITEMS',
      label: installment ? 'รับเครื่องคืน (ผ่อนไม่ไหว)' : 'รับคืนสินค้า',
      blockedReason: null,
    });
    options.push({ action: 'EXCHANGE', label: 'เปลี่ยนเครื่อง', blockedReason: null });
  }
  return options;
}

// ─── หน้าต่างรับคืน: เลือกรายการ + ยอดเงิน ───────────────────────────────

export type ReturnSelection = Record<string, number>;   // itemId → จำนวนที่คืน

type MoneyOrder = Pick<SalesOrderResponse,
  'cashAmount' | 'transferAmount' | 'cardAmount' | 'qrAmount' | 'paymentMethod'>
  & Partial<Pick<SalesOrderResponse,
    'refundableAmount' | 'returnedAmount' | 'depositAppliedAmount' | 'exchangeCreditAmount'>>
  & { items: Array<Pick<SalesOrderItemResponse, 'id' | 'quantity' | 'sellPrice' | 'imei' | 'serialNumber' | 'custom'>
    & { returnedQuantity?: number; serialItemId?: string | null }> };

/**
 * เพดานเงินคืน = เงินที่ลูกค้าจ่ายจริง (สด/โอน/บัตร/QR รวมงวดแรก + มัดจำ + เครดิตเปลี่ยนเครื่อง) − ที่คืนไปแล้ว
 * ไม่รวมเครดิตเทิร์น (ไม่ใช่เงิน) — backend ส่ง refundableAmount มาแล้ว · บิลจาก backend เก่าคำนวณเอง
 */
export function refundCap(o: MoneyOrder): number {
  if (o.refundableAmount != null) return Math.max(0, r2(o.refundableAmount));
  const paid = (o.cashAmount ?? 0) + (o.transferAmount ?? 0) + (o.cardAmount ?? 0) + (o.qrAmount ?? 0)
    + (o.depositAppliedAmount ?? 0) + (o.exchangeCreditAmount ?? 0);
  return Math.max(0, r2(paid - (o.returnedAmount ?? 0)));
}

/** มูลค่าตามราคาขายของรายการที่เลือก */
export function selectionValue(o: MoneyOrder, sel: ReturnSelection): number {
  return r2(o.items.reduce((sum, i) => sum + (sel[i.id] ?? 0) * (i.sellPrice ?? 0), 0));
}

/**
 * รายการที่เลือกไว้ตอนเปิดหน้าต่าง: สแกนเครื่องมา = เครื่องนั้น · บิลผ่อน = ทุกเครื่องที่ยังไม่คืน ·
 * เหลือรายการเดียว = รายการนั้น · นอกนั้นให้พนักงานเลือกเอง
 */
export function defaultSelection(o: MoneyOrder, preselectSerialId?: string | null): ReturnSelection {
  const open = o.items.filter((i) => remainingQty(i) > 0);
  if (preselectSerialId) {
    const hit = open.find((i) => i.serialItemId === preselectSerialId);
    if (hit) return { [hit.id]: 1 };
  }
  if (o.paymentMethod === 'INSTALLMENT') {
    const devices = deviceLines(open);
    if (devices.length > 0) return Object.fromEntries(devices.map((i) => [i.id, remainingQty(i)]));
  }
  if (open.length === 1) return { [open[0].id]: remainingQty(open[0]) };
  return {};
}

/** ยอดคืนเริ่มต้น: ผ่อนไม่ไหว = 0 (ร้านเก็บงวดที่จ่ายแล้ว) · นอกนั้น = มูลค่ารายการที่เลือก (ไม่เกินเพดาน) */
export function defaultRefund(o: MoneyOrder, sel: ReturnSelection, mode: 'RETURN' | 'EXCHANGE'): number {
  if (mode === 'RETURN' && o.paymentMethod === 'INSTALLMENT') return 0;
  return Math.min(selectionValue(o, sel), refundCap(o));
}

/** เครื่องเดียวที่เลือก (ถามแบตได้) */
export function singleSelectedDevice<T extends { id: string; imei: string | null; serialNumber: string | null; custom?: boolean }>(
  items: T[], sel: ReturnSelection): T | null {
  const devices = deviceLines(items).filter((i) => (sel[i.id] ?? 0) > 0);
  return devices.length === 1 ? devices[0] : null;
}

/** ตรวจก่อนยืนยัน (null = ผ่าน) */
export function returnFormError(o: MoneyOrder, sel: ReturnSelection, amountText: string, needReason: string): string | null {
  const picked = Object.entries(sel).filter(([, q]) => q > 0);
  if (picked.length === 0) return 'เลือกรายการที่ลูกค้าคืนอย่างน้อย 1 รายการ';
  for (const [id, q] of picked) {
    const item = o.items.find((i) => i.id === id);
    if (!item || !Number.isInteger(q) || q < 1 || q > remainingQty(item)) return 'จำนวนที่คืนเกินที่ลูกค้าถืออยู่';
  }
  if (amountText.trim() === '') return 'กรอกจำนวนเงิน (0 = ไม่คืนเงิน)';
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount < 0) return 'จำนวนเงินต้องเป็นตัวเลข 0 ขึ้นไป';
  const cap = refundCap(o);
  if (amount > cap) return `เกินเงินที่ลูกค้าจ่ายจริง — คืนได้สูงสุด ${baht(cap)}`;
  if (!needReason.trim()) return 'กรอกเหตุผล';
  return null;
}
