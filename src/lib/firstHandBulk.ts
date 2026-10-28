import type { FirstHandInstallmentRow, UpsertFirstHandInstallmentRequest } from '@/types/api';
import { buildTermTable, parseTermTable, type TermTable } from '@/lib/installmentTable';

/**
 * ตารางผ่อนมือ 1 — กติกาแถว + ปรับหลายแถวพร้อมกัน (FIX-208).
 * ใช้ร่วมกันระหว่างปุ่ม "บันทึก" รายแถว และ "บันทึกทั้งหมด" ให้ตรวจแบบเดียวกันเสมอ.
 */
export interface RowDraft {
  cash: string;
  down: string;
  monthly: TermTable;
  dirty: boolean;
}

export const draftFromRow = (r: FirstHandInstallmentRow): RowDraft => ({
  cash: r.cashPrice != null ? String(r.cashPrice) : '',
  down: r.downPayment != null ? String(r.downPayment) : '',
  monthly: parseTermTable(r.installmentTerms),
  dirty: false,
});

export type RowRequestResult =
  | { ok: true; request: UpsertFirstHandInstallmentRequest; clears: boolean }
  | { ok: false; error: string };

const label = (r: FirstHandInstallmentRow) => `${r.productName} ${r.storage}GB`;

/** draft → คำขอบันทึก (กติกาเดียวกับ backend: ราคาซื้อสด > 0 · มีดาวน์ต้องมีค่างวด · เว้นทั้งคู่ = ล้างผ่อน) */
export function rowRequest(r: FirstHandInstallmentRow, d: RowDraft): RowRequestResult {
  const terms = buildTermTable(d.monthly);
  const downEmpty = d.down.trim() === '';
  const cashEmpty = d.cash.trim() === '';
  if (!cashEmpty && !(Number(d.cash) > 0)) return { ok: false, error: `${label(r)}: ราคาซื้อสดต้องมากกว่า 0` };
  if (downEmpty && terms === '[]') {
    return {
      ok: true, clears: true,
      request: { productId: r.productId, storage: r.storage, downPayment: null, installmentTerms: '[]',
                 cashPrice: cashEmpty ? null : Number(d.cash) },
    };
  }
  if (!downEmpty && !(Number(d.down) >= 0)) return { ok: false, error: `${label(r)}: เงินดาวน์ต้องไม่ติดลบ` };
  if (terms === '[]') return { ok: false, error: `${label(r)}: กรอกค่างวดอย่างน้อย 1 ช่อง (หรือเว้นดาวน์ด้วยเพื่อล้าง)` };
  return {
    ok: true, clears: false,
    request: { productId: r.productId, storage: r.storage, downPayment: downEmpty ? null : Number(d.down),
               installmentTerms: terms, cashPrice: cashEmpty ? null : Number(d.cash) },
  };
}

/** แถวนี้ต่างจากค่าที่บันทึกไว้จริงไหม (ไม่ส่งแถวที่ปรับแล้วได้ค่าเดิม) */
export function isChanged(r: FirstHandInstallmentRow, d: RowDraft): boolean {
  const original = draftFromRow(r);
  const n = (v: string) => (v.trim() === '' ? '' : String(Number(v)));
  return n(original.cash) !== n(d.cash)
    || n(original.down) !== n(d.down)
    || buildTermTable(original.monthly) !== buildTermTable(d.monthly);
}

// ─── ปรับหลายแถวพร้อมกัน ──────────────────────────────────────────────────

export type BulkField = 'cash' | 'down' | 'monthly' | 'termDown';
export type BulkOp = 'SET' | 'ADD' | 'SUB' | 'PCT_UP' | 'PCT_DOWN';
export type BulkRound = 1 | 10 | 100;

export interface BulkAdjust {
  field: BulkField;
  op: BulkOp;
  value: number;
  round: BulkRound;
  /** monthly/termDown: เดือนที่จะปรับ · null = ทุกเดือนที่มีค่างวดอยู่แล้ว */
  months: number | null;
}

export function adjustNumber(current: number, a: Pick<BulkAdjust, 'op' | 'value' | 'round'>): number {
  const raw = (() => {
    switch (a.op) {
      case 'SET': return a.value;
      case 'ADD': return current + a.value;
      case 'SUB': return current - a.value;
      case 'PCT_UP': return current * (1 + a.value / 100);
      case 'PCT_DOWN': return current * (1 - a.value / 100);
    }
  })();
  const rounded = Math.round(raw / a.round) * a.round;
  return Math.max(0, Math.round(rounded * 100) / 100);
}

/** ค่าที่ว่างอยู่: ตั้งค่า (SET) ได้ · บวก/ลด/เปอร์เซ็นต์ข้าม (ไม่มีฐานให้คิด) */
function adjustText(current: string, a: BulkAdjust): string {
  if (current.trim() === '') return a.op === 'SET' ? String(adjustNumber(0, a)) : current;
  const n = Number(current);
  if (!Number.isFinite(n)) return current;
  return String(adjustNumber(n, a));
}

export function applyBulkAdjust(d: RowDraft, a: BulkAdjust): RowDraft {
  if (!Number.isFinite(a.value) || a.value < 0) return d;
  if (a.field === 'cash') return { ...d, cash: adjustText(d.cash, a), dirty: true };
  if (a.field === 'down') return { ...d, down: adjustText(d.down, a), dirty: true };
  const monthly: TermTable = { ...d.monthly };
  const targets = a.months != null ? [a.months] : Object.keys(monthly).map(Number);
  for (const m of targets) {
    const cell = monthly[m] ?? { monthly: '', down: '' };
    if (a.field === 'monthly') {
      monthly[m] = { ...cell, monthly: adjustText(cell.monthly, a) };
    } else if (String(cell.monthly).trim() !== '') {
      // ดาวน์เฉพาะงวด: ตั้งได้เฉพาะงวดที่มีค่างวดแล้ว (งวดว่างไม่มีความหมาย)
      monthly[m] = { ...cell, down: adjustText(cell.down, a) };
    }
  }
  return { ...d, monthly, dirty: true };
}

/** สรุปค่างวดสั้น ๆ สำหรับหน้ายืนยัน เช่น "10ด 1,990 · 24ด 990 (ดาวน์ 5,990)" */
export function termsSummary(json: string | null | undefined): string {
  const table = parseTermTable(json);
  const parts = Object.keys(table).map(Number).sort((x, y) => x - y).map((m) => {
    const c = table[m];
    const down = c.down.trim() !== '' ? ` (ดาวน์ ${Number(c.down).toLocaleString('en-US')})` : '';
    return `${m}ด ${Number(c.monthly).toLocaleString('en-US')}${down}`;
  });
  return parts.length ? parts.join(' · ') : '—';
}
