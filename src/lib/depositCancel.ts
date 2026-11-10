import { formatTHB } from '@/lib/format';
import type { DeviceDeposit } from '@/types/api';

/**
 * ยกเลิกใบมัดจำ/จองเครื่อง (FIX-224) — พนักงานเลือกแบบ (คืนเต็ม/บางส่วน/ไม่คืน) ระบบคิดยอดให้เอง
 * และบอกเป็นประโยคว่าเงินจะเข้า-ออกที่ไหน ก่อนกดยืนยัน
 */
export type CancelMode = 'FULL' | 'PARTIAL' | 'NONE';

export interface CancelPlan {
  /** ยอดที่คืนลูกค้า */
  refund: number;
  /** ยอดที่ร้านเก็บไว้ (ไม่คืน) */
  kept: number;
  error: string | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function cancelPlan(balance: number, mode: CancelMode, partial: number): CancelPlan {
  const held = Math.max(0, r2(balance));
  if (mode === 'FULL') return { refund: held, kept: 0, error: null };
  if (mode === 'NONE') return { refund: 0, kept: held, error: null };
  if (!Number.isFinite(partial) || partial <= 0) return { refund: 0, kept: held, error: 'กรอกยอดที่คืนลูกค้า' };
  if (partial >= held) {
    return { refund: held, kept: 0, error: partial > held ? `คืนได้ไม่เกิน ${formatTHB(held)}` : 'คืนเต็มจำนวน — เลือก "คืนเงินลูกค้าทั้งหมด"' };
  }
  return { refund: r2(partial), kept: r2(held - partial), error: null };
}

/** คืนทางเดียวกับที่รับมา: รับเงินสดล้วน → เงินสด · มีโอน/บัตร/QR → โอนคืน */
export function defaultRefundMethod(d: Pick<DeviceDeposit, 'payments'>): 'CASH' | 'TRANSFER' {
  const received = d.payments.filter((p) => p.kind === 'RECEIVE');
  return received.length > 0 && received.every((p) => p.method === 'CASH') ? 'CASH' : 'TRANSFER';
}

/** ประโยคอธิบายผลกับเงิน (โชว์ก่อนยืนยัน) */
export function cancelEffects(plan: CancelPlan, method: 'CASH' | 'TRANSFER'): string[] {
  const lines: string[] = [];
  if (plan.refund > 0) {
    lines.push(method === 'CASH'
      ? `หยิบเงินสด ${formatTHB(plan.refund)} จากเก๊ะคืนลูกค้า — ยอดเงินสดในเก๊ะลดลง ${formatTHB(plan.refund)}`
      : `โอนคืนลูกค้า ${formatTHB(plan.refund)} — เงินในเก๊ะไม่เปลี่ยน (ออกจากบัญชีร้าน)`);
    lines.push(`สรุปยอดเก๊ะ: ขึ้น “คืนมัดจำ −${formatTHB(plan.refund)}” และหักจากยอดรับสุทธิ`);
  }
  if (plan.kept > 0) {
    lines.push(`ร้านเก็บมัดจำไว้ ${formatTHB(plan.kept)} — ยังนับเป็นเงินรับของร้าน (ไม่ออกจากสรุปยอด)`);
  }
  return lines;
}
