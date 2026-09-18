import { Calculator, Info } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { reconcileDrawer } from '@/lib/cash/drawerReconciliation';
import type { CashMovementLine } from '@/types/api';

interface Props {
  movements: CashMovementLine[] | null | undefined;
  /** ยอดเงินสดตามบิลขายวันนี้ (การ์ดสรุปตามวันที่บัญชี) — ใช้บอกความต่างกับเงินสดจริงจากการขาย */
  accountingCashTotal?: number | null;
  className?: string;
}

/**
 * "ยอดในเก๊ะปัจจุบัน มาจากไหน" — แจกแจงทีละบรรทัดจาก movement จริง ให้นับตามได้ (FIX-199).
 * ผลรวมบรรทัดสุดท้ายเท่ากับตัวเลขบนการ์ดเสมอเพราะคำนวณจากชุดข้อมูลเดียวกัน.
 */
export function DrawerReconciliationCard({ movements, accountingCashTotal, className = '' }: Props) {
  const r = reconcileDrawer(movements);
  const salesCash = r.inflows.find((l) => l.key === 'SALE_CASH')?.amount ?? 0;
  const accountingDiff = accountingCashTotal == null ? 0 : Math.round((salesCash - accountingCashTotal) * 100) / 100;

  return (
    <div className={`card ${className}`}>
      <div className="card-header flex items-center justify-between gap-2">
        <span><Calculator className="inline h-4 w-4 align-[-2px]" /> ยอดในเก๊ะปัจจุบัน มาจากไหน</span>
        <span className="text-xs font-normal text-slate-500">นับเฉพาะเงินสดที่เข้า–ออกลิ้นชักจริง</span>
      </div>
      <div className="divide-y divide-slate-100 text-sm">
        <Row label="เงินทอนตั้งต้นตอนเปิดเก๊ะ" amount={r.openingFloat} tone="base" />

        <Section title="เงินสดเข้าเก๊ะ ตั้งแต่เปิดเก๊ะ" total={r.totalIn} sign="+" tone="in">
          {r.inflows.length === 0 && <Empty text="ยังไม่มีเงินสดเข้า" />}
          {r.inflows.map((l) => <Row key={l.key} label={l.label} count={l.count} amount={l.amount} sign="+" tone="in" indent />)}
        </Section>

        <Section title="เงินสดออกจากเก๊ะ" total={r.totalOut} sign="−" tone="out">
          {r.outflows.length === 0 && <Empty text="ยังไม่มีเงินสดออก" />}
          {r.outflows.map((l) => <Row key={l.key} label={l.label} count={l.count} amount={Math.abs(l.amount)} sign="−" tone="out" indent />)}
        </Section>

        <div className="flex items-center justify-between bg-brand-50 px-4 py-3">
          <div>
            <div className="font-semibold text-brand-800">= เงินสดที่ควรอยู่ในเก๊ะตอนนี้</div>
            <div className="text-xs text-brand-700/80">
              {formatTHB(r.openingFloat)} + {formatTHB(r.totalIn)} − {formatTHB(r.totalOut)}
            </div>
          </div>
          <div className="text-2xl font-extrabold tabular-nums text-brand-700">{formatTHB(r.balance)}</div>
        </div>

        {r.nonDrawer.length > 0 && (
          <div className="px-4 py-3">
            <div className="mb-1 text-xs font-semibold text-slate-500">ไม่ได้อยู่ในเก๊ะ (ไม่ต้องนับ) — เข้าบัญชี หรือคนอื่นจ่ายแทน</div>
            {r.nonDrawer.map((l) => (
              <div key={l.key} className="flex items-center justify-between py-0.5 text-xs text-slate-500">
                <span>{l.label} <span className="text-slate-400">· {l.count} รายการ</span></span>
                <span className="tabular-nums">{formatTHB(l.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {accountingCashTotal != null && accountingDiff !== 0 && (
          <div className="flex items-start gap-2 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              การ์ด "สรุปยอดขายตามวันที่บัญชี" นับเงินสด {formatTHB(accountingCashTotal)} ตามวันที่ขายบนบิล
              แต่เงินสดที่เข้าเก๊ะจริงจากการขายคือ {formatTHB(salesCash)}
              (ต่างกัน {accountingDiff > 0 ? '+' : '−'}{formatTHB(Math.abs(accountingDiff))} — มักเกิดจากบิลที่แก้วันที่ขาย
              หรือรับเงินคนละกะ) · การนับเก๊ะให้ยึดตัวเลขในการ์ดนี้
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, total, sign, tone, children }: {
  title: string; total: number; sign: '+' | '−'; tone: 'in' | 'out'; children: React.ReactNode;
}) {
  const color = tone === 'in' ? 'text-emerald-700' : 'text-rose-700';
  return (
    <div className="py-1">
      <div className={`flex items-center justify-between px-4 py-1.5 font-semibold ${color}`}>
        <span>{title}</span>
        <span className="tabular-nums">{sign} {formatTHB(total)}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, count, amount, sign, tone = 'base', indent }: {
  label: string; count?: number; amount: number; sign?: '+' | '−'; tone?: 'in' | 'out' | 'base'; indent?: boolean;
}) {
  const color = tone === 'in' ? 'text-emerald-700' : tone === 'out' ? 'text-rose-700' : 'text-slate-800';
  return (
    <div className={`flex items-center justify-between py-1.5 ${indent ? 'pl-8 pr-4 text-slate-600' : 'px-4 font-medium'}`}>
      <span>{label}{count != null && <span className="ml-1 text-xs text-slate-400">· {count} รายการ</span>}</span>
      <span className={`tabular-nums ${indent ? '' : 'font-semibold'} ${color}`}>{sign ? `${sign} ` : ''}{formatTHB(amount)}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="pl-8 pr-4 py-1 text-xs text-slate-400">{text}</div>;
}
