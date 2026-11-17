import type { SalesOrderItemResponse, SalesOrderResponse } from '@/types/api';

/**
 * ปุ่มยกเลิก/คืนเงิน/รับคืน/เปลี่ยนเครื่องของบิลขาย (FIX-228 → FIX-230) — ตรงกับกติกา backend
 * ให้พนักงานเห็นเหตุผลก่อนกรอกรหัสร้าน แทนที่จะไปเจอ error ตอนท้าย
 *
 *  - REFUND: ยกเลิกทั้งบิล (ขายผิด/ยกเลิกการขาย — ยอดขายถูกตัด) · FIX-232 ไม่มีเงินออกจากเก๊ะ
 *    (บิลที่ยังไม่ออกใบกำกับ และยังไม่เคยรับคืนบางรายการ)
 *  - CREDIT_NOTE: บิลที่ออกใบกำกับแล้ว ยกเลิกทั้งบิลด้วยใบลดหนี้ (ไม่มีเงินออกเก๊ะเช่นกัน)
 *  - RETURN_ITEMS: เลือกเครื่อง/อุปกรณ์ที่ลูกค้าคืน + จำนวน (บิลผ่อน = รับเครื่องคืน) — FIX-231: ตีของเข้าสต็อก
 *    อย่างเดียว ไม่มีเงินออกจากเก๊ะ (เงินที่ร้านจ่ายซื้อคืนทำนอกระบบ POS) · ยอดขายเดิมยังเป็นรายได้ร้าน
 *    · FIX-232: กรอกราคารับซื้อคืน = ทุนใหม่ของเครื่อง · บิลขายสดที่มีใบกำกับแล้วก็ขายคืนได้ (ยอดขายไม่ถูกตัด)
 *  - EXCHANGE: เปลี่ยนเครื่อง — ราคาของที่คืนเป็นเครดิตบิลใหม่ที่ POS (ไม่มีเงินออกเก๊ะ)
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

/**
 * ป้ายรับคืนข้างสถานะบิล (FIX-231) — รับคืนไม่เปลี่ยนบิลขายสดเป็น "คืนเงินแล้ว" (ร้านเก็บเงินไว้ บิลยังจ่ายแล้ว)
 * จึงต้องบอกว่าของกลับมาแล้ว
 */
export function returnBadge(o: Pick<RefundableOrder, 'status' | 'items'>): string | null {
  if (o.status !== 'PAID') return null;
  const returned = o.items.filter((i) => (i.returnedQuantity ?? 0) > 0);
  if (returned.length === 0) return null;
  return o.items.every((i) => remainingQty(i) === 0) ? 'รับคืนครบแล้ว' : 'รับคืนบางรายการ';
}

/** เหตุผลที่ "ยกเลิกทั้งบิลอัตโนมัติ" ไม่ได้ (null = ทำได้) */
export function fullRefundBlockedReason(o: RefundableOrder): string | null {
  const tradeIn = o.tradeInValue ?? 0;
  if (tradeIn > 0) {
    return `บิลนี้มีเทิร์นเครื่องเก่า ${baht(tradeIn)} — ยกเลิกทั้งบิลอัตโนมัติไม่ได้ `
      + '(ต้องคืนเครื่องเทิร์นให้ลูกค้าด้วย) · ลูกค้าคืนของใช้ "รับคืนสินค้า" (ของเข้าสต็อก ไม่มีเงินออกเก๊ะ)';
  }
  const deposit = o.depositAppliedAmount ?? 0;
  if (deposit > 0) {
    return `บิลนี้หักเงินมัดจำ ${baht(deposit)}${o.depositNo ? ` (ใบ ${o.depositNo})` : ''} — `
      + 'เงินรับ 2 วัน ยกเลิกทั้งบิลอัตโนมัติไม่ได้ · ลูกค้าคืนของใช้ "รับคืนสินค้า" (ของเข้าสต็อก ไม่มีเงินออกเก๊ะ)';
  }
  if (hasReturns(o)) {
    return 'บิลนี้รับคืนบางรายการไปแล้ว — ยกเลิกทั้งบิลไม่ได้ ใช้ "รับคืนสินค้า" กับรายการที่เหลือ';
  }
  const exchange = o.exchangeCreditAmount ?? 0;
  if (exchange > 0) {
    return `บิลนี้ใช้เครดิตเปลี่ยนเครื่อง ${baht(exchange)}${o.exchangeFromBillNo ? ` จากบิล ${o.exchangeFromBillNo}` : ''} `
      + '— ยกเลิกทั้งบิลอัตโนมัติไม่ได้ · ลูกค้าคืนของใช้ "รับคืนสินค้า" (ของเข้าสต็อก ไม่มีเงินออกเก๊ะ)';
  }
  return null;
}

export function billRefundOptions(o: RefundableOrder): BillRefundOption[] {
  if (o.status !== 'PAID') return [];
  // FIX-231: รับคืนครบแล้วบิลยัง PAID (ร้านเก็บเงินไว้) — ไม่มีอะไรให้ทำต่อ ไม่ต้องโชว์ปุ่มยกเลิกที่กดไม่ได้
  if (hasReturns(o) && !o.items.some((i) => remainingQty(i) > 0)) return [];
  const options: BillRefundOption[] = [];
  options.push(o.taxInvoiceNo
    ? { action: 'CREDIT_NOTE', label: 'ใบลดหนี้ (ยกเลิกบิล)', blockedReason: fullRefundBlockedReason(o) }
    : { action: 'REFUND', label: 'ยกเลิกบิล', blockedReason: fullRefundBlockedReason(o) });
  if (!o.items.some((i) => remainingQty(i) > 0)) return options;
  const installment = o.paymentMethod === 'INSTALLMENT' && deviceLines(o.items).length > 0;
  // FIX-232: มีใบกำกับแล้ว — ขายคืนบิลขายสดได้ (ยอดขายไม่ถูกตัด) · บิลผ่อน/เปลี่ยนเครื่องตัดยอดขาย ต้องใบลดหนี้
  if (o.taxInvoiceNo && installment) return options;
  options.push({
    action: 'RETURN_ITEMS',
    label: installment ? 'รับเครื่องคืน (ผ่อนไม่ไหว)' : 'รับคืนสินค้า',
    blockedReason: null,
  });
  if (!o.taxInvoiceNo) options.push({ action: 'EXCHANGE', label: 'เปลี่ยนเครื่อง', blockedReason: null });
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
 * เพดานเครดิตเปลี่ยนเครื่อง (ระดับบิล) = เงินที่ลูกค้าจ่ายจริง (สด/โอน/บัตร/QR รวมงวดแรก + มัดจำ + เครดิตเดิม)
 * − ที่ใช้ไปแล้ว · ไม่รวมเครดิตเทิร์น (ไม่ใช่เงิน) — backend ส่ง refundableAmount มาแล้ว · บิลจาก backend เก่าคำนวณเอง
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

/** เพดานเครดิตเปลี่ยนเครื่อง = ไม่เกินราคาของที่คืน และไม่เกินเงินที่ลูกค้าจ่ายจริง (FIX-231 — ตรง backend) */
export function exchangeCreditCap(o: MoneyOrder, sel: ReturnSelection): number {
  return Math.min(selectionValue(o, sel), refundCap(o));
}

/** ยอดเริ่มต้น: รับคืน = 0 เสมอ (FIX-231 ไม่มีเงินออกเก๊ะ) · เปลี่ยนเครื่อง = ราคาของที่คืน (ไม่เกินเพดาน) */
export function defaultRefund(o: MoneyOrder, sel: ReturnSelection, mode: 'RETURN' | 'EXCHANGE'): number {
  if (mode === 'RETURN') return 0;
  return exchangeCreditCap(o, sel);
}

/** เครื่องเดียวที่เลือก (ถามแบตได้) */
export function singleSelectedDevice<T extends { id: string; imei: string | null; serialNumber: string | null; custom?: boolean }>(
  items: T[], sel: ReturnSelection): T | null {
  const devices = deviceLines(items).filter((i) => (sel[i.id] ?? 0) > 0);
  return devices.length === 1 ? devices[0] : null;
}

/** ราคารับซื้อคืนที่พนักงานพิมพ์ต่อเครื่อง: itemId → ข้อความ */
export type BuybackInput = Record<string, string>;

/** บังคับกรอกราคารับซื้อคืนไหม (FIX-232): บิลขายสด/โอน/บัตร = บังคับ · บิลผ่อนว่างได้ (= ทุนเดิม ณ วันขาย) */
export const buybackRequired = (o: Pick<SalesOrderResponse, 'paymentMethod'>) => o.paymentMethod !== 'INSTALLMENT';

/** แปลงราคารับซื้อคืน (ว่าง = undefined · ผิดรูป = NaN) */
export function parseBuyback(text: string | undefined): number | undefined {
  const t = (text ?? '').replace(/,/g, '').trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

/**
 * ตรวจก่อนยืนยัน (null = ผ่าน) · รับคืนไม่มีช่องเงิน (FIX-231) — ตรวจยอดเฉพาะเครดิตเปลี่ยนเครื่อง
 * · FIX-232: รับคืนเครื่องต้องมีราคารับซื้อคืน (บิลขายสด) และต้องเป็นตัวเลข ≥ 0
 */
export function returnFormError(o: MoneyOrder, sel: ReturnSelection, amountText: string, needReason: string,
  mode: 'RETURN' | 'EXCHANGE' = 'RETURN', buyback: BuybackInput = {}): string | null {
  const picked = Object.entries(sel).filter(([, q]) => q > 0);
  if (picked.length === 0) return 'เลือกรายการที่ลูกค้าคืนอย่างน้อย 1 รายการ';
  for (const [id, q] of picked) {
    const item = o.items.find((i) => i.id === id);
    if (!item || !Number.isInteger(q) || q < 1 || q > remainingQty(item)) return 'จำนวนที่คืนเกินที่ลูกค้าถืออยู่';
  }
  if (mode === 'EXCHANGE') {
    if (amountText.trim() === '') return 'กรอกเครดิตที่ใช้ซื้อเครื่องใหม่';
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount < 0) return 'เครดิตต้องเป็นตัวเลข 0 ขึ้นไป';
    const cap = exchangeCreditCap(o, sel);
    if (amount > cap) return `เครดิตเกินราคาของที่คืน/เงินที่ลูกค้าจ่ายจริง — ใช้ได้สูงสุด ${baht(cap)}`;
  } else {
    for (const item of deviceLines(o.items).filter((i) => (sel[i.id] ?? 0) > 0)) {
      const cost = parseBuyback(buyback[item.id]);
      const name = item.imei ?? item.serialNumber;
      if (cost === undefined && buybackRequired(o)) return `กรอกราคาที่ร้านรับซื้อคืน (ทุนใหม่) ของเครื่อง ${name}`;
      if (cost !== undefined && Number.isNaN(cost)) return `ราคารับซื้อคืนของเครื่อง ${name} ต้องเป็นตัวเลข 0 ขึ้นไป`;
    }
  }
  if (!needReason.trim()) return 'กรอกเหตุผล';
  return null;
}
