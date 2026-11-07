/**
 * ยอดที่ลูกค้าต้องจ่ายวันขาย เมื่อขายเครื่องที่จอง/วางมัดจำไว้ (FIX-214) — สูตรเดียวกับ backend (PosService.checkout)
 *
 * ฐาน: บิลสด/โอน/บัตร/QR/ผสม = ยอดบิล · บิลผ่อน = ยอดจ่ายวันนี้ (ดาวน์ + อุปกรณ์ − ส่วนลด)
 * หักเทิร์นก่อน แล้วหักมัดจำ · มัดจำมากกว่ายอดที่เหลือ = ห้ามปิดบิล (ต้องคืนส่วนเกินที่ใบมัดจำก่อน)
 */
export interface DepositDueInput {
  isInstallment: boolean;
  grandTotal: number;
  /** บิลผ่อน: ดาวน์ + อุปกรณ์จ่ายวันนี้ − ส่วนลด */
  payToday: number;
  tradeInValue: number;
  depositCredit: number;
}

export interface DepositDue {
  base: number;
  afterTradeIn: number;
  /** ยอดคงเหลือที่ต้องรับวันนี้ (ติดลบ = เครดิตเกิน) */
  due: number;
  depositOver: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function depositDue(input: DepositDueInput): DepositDue {
  const base = r2(input.isInstallment ? input.payToday : input.grandTotal);
  const afterTradeIn = r2(base - Math.max(0, input.tradeInValue || 0));
  const deposit = Math.max(0, input.depositCredit || 0);
  const due = r2(afterTradeIn - deposit);
  return { base, afterTradeIn, due, depositOver: deposit > 0 && due < 0 };
}

/** ยอดคงเหลือของใบมัดจำก่อนขาย = ราคาที่ตกลง − มัดจำที่ถืออยู่ */
export function depositRemaining(agreedPrice: number, balance: number): number {
  return Math.max(0, r2(agreedPrice - balance));
}
