import type { PaymentMethod, UpdateRepairStatusRequest } from '@/types/api';

/** สูตรเดียวกับ backend RepairService (FIX-207) — ใช้แสดงในหน้าต่างก่อนกดยืนยัน */
export interface RepairSettlement {
  /** ลูกค้าต้องจ่ายเพิ่มตอนรับเครื่อง */
  due: number;
  /** ร้านต้องคืนมัดจำส่วนเกิน (มัดจำมากกว่าค่าซ่อมจริง) */
  refund: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function repairPickupSettlement(repairCost: number, deposit: number): RepairSettlement {
  const diff = r2((repairCost || 0) - (deposit || 0));
  return { due: Math.max(0, diff), refund: Math.max(0, -diff) };
}

export type CancelDepositChoice = 'REFUND_CASH' | 'REFUND_TRANSFER' | 'KEEP';

/** คำขอยกเลิกงาน: คืนมัดจำ (สด/โอน) หรือร้านเก็บไว้เป็นรายได้ */
export function cancelRequest(choice: CancelDepositChoice): UpdateRepairStatusRequest {
  if (choice === 'KEEP') return { status: 'CANCELLED', keepDeposit: true };
  return {
    status: 'CANCELLED',
    keepDeposit: false,
    paymentMethod: choice === 'REFUND_TRANSFER' ? 'TRANSFER' : 'CASH',
  };
}

/** แก้มัดจำ: + = รับเพิ่ม, − = คืนลูกค้า, 0 = ไม่มีเงินเคลื่อนไหว */
export function depositDelta(oldDeposit: number, newDeposit: number): number {
  return r2((newDeposit || 0) - (oldDeposit || 0));
}

export const REPAIR_MONEY_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด (เข้า/ออกเก๊ะ)' },
  { value: 'TRANSFER', label: 'โอนเงิน / QR' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
];
