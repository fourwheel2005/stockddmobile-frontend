import type { CashMovementLine, CashMovementType } from '@/types/api';

/**
 * แยก "ยอดในเก๊ะปัจจุบัน" ออกเป็นส่วน ๆ ให้นับตามได้ทีละบรรทัด (FIX-199).
 *
 * แหล่งข้อมูลเดียวกับตัวเลขบนการ์ด: ผลรวม `amount` ของ movement ทุกรายการ (เงินสดจริงในลิ้นชัก)
 * โอน/บัตร/QR/ไฟแนนซ์/ตา-ยายจ่ายแทน มี amount = 0 จึงแยกไปกลุ่ม "ไม่อยู่ในเก๊ะ" ให้เห็นว่าไม่ได้นับรวม.
 */
export type DrawerLineKey =
  | 'OPENING_FLOAT' | 'SALE_CASH' | 'REPAIR_CASH' | 'INSTALLMENT_CASH'
  | 'CASH_IN' | 'ADJUSTMENT_PLUS'
  | 'REFUND_CASH' | 'PAYOUT' | 'SAFE_DROP' | 'ADJUSTMENT_MINUS';

export interface DrawerLine {
  key: DrawerLineKey;
  label: string;
  /** ยอดกระทบเก๊ะ (มีเครื่องหมาย: + เข้า / − ออก) */
  amount: number;
  count: number;
}

export interface NonDrawerLine {
  key: 'TRANSFER' | 'CARD' | 'QR' | 'FINANCE' | 'REFUND_TRANSFER' | 'OWNER_PAID';
  label: string;
  amount: number;
  count: number;
}

export interface DrawerReconciliation {
  openingFloat: number;
  inflows: DrawerLine[];
  outflows: DrawerLine[];
  totalIn: number;
  totalOut: number;
  /** = openingFloat + totalIn − totalOut — ต้องเท่ากับผลรวม amount ทุก movement */
  balance: number;
  nonDrawer: NonDrawerLine[];
}

const LABELS: Record<DrawerLineKey, string> = {
  OPENING_FLOAT:    'เงินทอนตั้งต้นตอนเปิดเก๊ะ',
  SALE_CASH:        'ขายหน้าร้าน รับเป็นเงินสด',
  REPAIR_CASH:      'ค่าซ่อม รับเป็นเงินสด',
  INSTALLMENT_CASH: 'ค่างวดผ่อน รับเป็นเงินสด',
  CASH_IN:          'เติมเงินสดเข้าเก๊ะ (รวมตา/ยายใส่เงิน)',
  ADJUSTMENT_PLUS:  'ปรับปรุงเพิ่ม',
  REFUND_CASH:      'คืนเงินสดให้ลูกค้า',
  PAYOUT:           'จ่ายออกจากเก๊ะ (ค่าส่ง/ค่าใช้จ่าย/ส่วนต่างเทิร์น)',
  SAFE_DROP:        'เก็บเงินเข้าตู้นิรภัย',
  ADJUSTMENT_MINUS: 'ปรับปรุงลด',
};

const INFLOW_ORDER: DrawerLineKey[] = ['SALE_CASH', 'REPAIR_CASH', 'INSTALLMENT_CASH', 'CASH_IN', 'ADJUSTMENT_PLUS'];
const OUTFLOW_ORDER: DrawerLineKey[] = ['REFUND_CASH', 'PAYOUT', 'SAFE_DROP', 'ADJUSTMENT_MINUS'];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function saleCashKey(m: CashMovementLine): DrawerLineKey {
  if (m.referenceType === 'REPAIR_TICKET') return 'REPAIR_CASH';
  if ((m.note ?? '').startsWith('ค่างวด')) return 'INSTALLMENT_CASH';
  return 'SALE_CASH';
}

/** movement ที่กระทบเก๊ะ (amount ≠ 0) → อยู่กลุ่มไหน; null = ไม่กระทบเก๊ะ */
function drawerKey(m: CashMovementLine): DrawerLineKey | null {
  const amount = Number(m.amount || 0);
  if (amount === 0) return null;
  const byType: Partial<Record<CashMovementType, DrawerLineKey>> = {
    OPENING_FLOAT: 'OPENING_FLOAT',
    SALE_CASH: saleCashKey(m),
    CASH_IN: 'CASH_IN',
    PETTY_CASH_FROM_OWNER: 'CASH_IN',
    REFUND_CASH: 'REFUND_CASH',
    PAYOUT_SHIPPING: 'PAYOUT',
    PAYOUT_EXPENSE: 'PAYOUT',
    TRADEIN_PAYOUT: 'PAYOUT',
    SAFE_DROP: 'SAFE_DROP',
    ADJUSTMENT: amount > 0 ? 'ADJUSTMENT_PLUS' : 'ADJUSTMENT_MINUS',
  };
  // ประเภทที่ปกติ amount = 0 แต่ถ้าข้อมูลเก่ามีค่า ให้ตามเครื่องหมายเพื่อให้ผลรวมยังตรงกับการ์ด
  return byType[m.type] ?? (amount > 0 ? 'ADJUSTMENT_PLUS' : 'ADJUSTMENT_MINUS');
}

function nonDrawerKey(m: CashMovementLine): NonDrawerLine['key'] | null {
  if (m.paidFrom === 'OWNER_GRANDPA' || m.paidFrom === 'OWNER_GRANDMA') return 'OWNER_PAID';
  switch (m.type) {
    case 'SALE_TRANSFER': return 'TRANSFER';
    case 'SALE_CARD': return 'CARD';
    case 'SALE_QR': return 'QR';
    case 'FINANCE_PAYOUT_RECEIVED': return 'FINANCE';
    case 'REFUND_TRANSFER': return 'REFUND_TRANSFER';
    default: return null;
  }
}

const NON_DRAWER_LABELS: Record<NonDrawerLine['key'], string> = {
  TRANSFER:        'ขายรับโอน (เข้าบัญชีร้าน)',
  CARD:            'ขายรูดบัตร (เข้าบัญชีร้าน)',
  QR:              'ขายรับ QR (เข้าบัญชีร้าน)',
  FINANCE:         'ไฟแนนซ์โอนคืน (เข้าบัญชีร้าน)',
  REFUND_TRANSFER: 'คืนเงินผ่านโอน (ออกจากบัญชี)',
  OWNER_PAID:      'ตา/ยายจ่ายแทนเก๊ะ',
};
const NON_DRAWER_ORDER: NonDrawerLine['key'][] = ['TRANSFER', 'CARD', 'QR', 'FINANCE', 'REFUND_TRANSFER', 'OWNER_PAID'];

export function reconcileDrawer(movements: CashMovementLine[] | null | undefined): DrawerReconciliation {
  const drawer = new Map<DrawerLineKey, DrawerLine>();
  const outside = new Map<NonDrawerLine['key'], NonDrawerLine>();

  for (const m of movements ?? []) {
    const amount = Number(m.amount || 0);
    const key = drawerKey(m);
    if (key) {
      const line = drawer.get(key) ?? { key, label: LABELS[key], amount: 0, count: 0 };
      line.amount = r2(line.amount + amount);
      line.count += 1;
      drawer.set(key, line);
      continue;
    }
    const outsideKey = nonDrawerKey(m);
    if (!outsideKey) continue;
    const shown = Math.abs(Number(m.displayAmount ?? 0));
    if (shown === 0) continue;
    const line = outside.get(outsideKey) ?? { key: outsideKey, label: NON_DRAWER_LABELS[outsideKey], amount: 0, count: 0 };
    line.amount = r2(line.amount + shown);
    line.count += 1;
    outside.set(outsideKey, line);
  }

  const pick = (order: DrawerLineKey[]) => order.map((k) => drawer.get(k)).filter((l): l is DrawerLine => !!l);
  const openingFloat = drawer.get('OPENING_FLOAT')?.amount ?? 0;
  const inflows = pick(INFLOW_ORDER);
  const outflows = pick(OUTFLOW_ORDER);
  const totalIn = r2(inflows.reduce((s, l) => s + l.amount, 0));
  const totalOut = r2(outflows.reduce((s, l) => s + Math.abs(l.amount), 0));

  return {
    openingFloat,
    inflows,
    outflows,
    totalIn,
    totalOut,
    balance: r2(openingFloat + totalIn - totalOut),
    nonDrawer: NON_DRAWER_ORDER.map((k) => outside.get(k)).filter((l): l is NonDrawerLine => !!l),
  };
}
