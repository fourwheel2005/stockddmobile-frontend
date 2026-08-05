import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wallet, DoorOpen, DoorClosed, Plus, RefreshCw, ArrowDownCircle, ArrowUpCircle,
  Users, AlertTriangle,
} from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { formatTHB, formatDateTime } from '@/lib/format';
import { useBranchStore } from '@/stores/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { OpenSessionModal } from '@/components/OpenSessionModal';
import { CloseSessionModal } from '@/components/CloseSessionModal';
import { CashMovementModal } from '@/components/CashMovementModal';
import { PaymentBreakdownCard } from '@/components/cash/PaymentBreakdownCard';
import { OrphanSessionBanner } from '@/components/cash/OrphanSessionBanner';
import type { CashMovementType, PaidFrom } from '@/types/api';

const TYPE_TH: Record<CashMovementType, string> = {
  OPENING_FLOAT:           'เปิดเก๊ะ',
  SALE_CASH:               'ขายเงินสด',
  SALE_TRANSFER:           'ขายโดยรับโอน',
  SALE_CARD:               'รูดบัตร',
  SALE_QR:                 'รับ QR',
  FINANCE_PAYOUT_RECEIVED: 'ไฟแนนซ์โอนคืน',
  REFUND_CASH:             'คืนเงินสด',
  REFUND_TRANSFER:         'คืนผ่านโอน',
  PAYOUT_SHIPPING:         'ค่าจัดส่ง',
  PAYOUT_EXPENSE:          'จ่ายค่าใช้จ่าย',
  CASH_IN:                 'เติมเงินสด',
  SAFE_DROP:               'เก็บเข้าตู้นิรภัย',
  PETTY_CASH_FROM_OWNER:   'ตา/ยายใส่เงิน',
  ADJUSTMENT:              'ปรับปรุง',
};

const PAID_FROM_TH: Record<PaidFrom, string> = {
  REGISTER:      'เก๊ะ',
  OWNER_GRANDPA: '👴 ตา',
  OWNER_GRANDMA: '👵 ยาย',
  CUSTOMER:      'ลูกค้า',
  BANK:          '🏦 บัญชีร้าน',
};

export function CashRegisterPage() {
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showMovement, setShowMovement] = useState(false);

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const sessionQuery = useQuery({
    queryKey: ['cash-session', 'current', activeBranchId],
    queryFn: () => cashRegisterApi.current(activeBranchId ?? undefined),
    refetchInterval: 30_000,
  });

  const canSeeOwnerLedger = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const ledgerQuery = useQuery({
    queryKey: ['owner-ledger', 'today'],
    queryFn: () => cashRegisterApi.ownerLedger(),
    enabled: canSeeOwnerLedger,   // STAFF เรียกแล้วจะได้ 403 (backend ปิด) — อย่ายิงตั้งแต่แรก
  });

  const session = sessionQuery.data;
  const ledger = ledgerQuery.data;

  // คำนวณ live balance = sum(movements)
  const balance = (session?.movements ?? [])
    .reduce((s, m) => s + Number(m.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Wallet className="h-6 w-6 text-brand-600" />
            จัดการเก๊ะ
          </h1>
          <p className="page-subtitle">เปิด · ปิด · บันทึกเงินเข้า-ออก · รายงานตา/ยาย</p>
        </div>
        <button
          onClick={() => sessionQuery.refetch()}
          className="btn-secondary"
          title="รีเฟรช">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* P4 — Orphan session banner (ADMIN/MANAGER) */}
      <OrphanSessionBanner currentSessionId={session?.id} />

      {/* Current session card */}
      {!session && (
        <div className="card border-2 border-amber-300">
          <div className="card-body text-center py-10">
            <Wallet className="mx-auto h-12 w-12 text-amber-400" />
            <h2 className="mt-3 text-lg font-semibold text-amber-800">ยังไม่มี session เปิดอยู่</h2>
            <p className="mt-1 text-sm text-slate-600">
              ต้องเปิดเก๊ะก่อนเริ่มขายของ — ระบบจะ block POS checkout จนกว่าจะเปิด
            </p>
            <button
              onClick={() => setShowOpen(true)}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 mt-4">
              <DoorOpen className="h-4 w-4" />
              เปิดเก๊ะวันใหม่
            </button>
          </div>
        </div>
      )}

      {session && (
        <>
          <div className="card border-2 border-emerald-300">
            <div className="card-body">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Stat label="Session" value={session.sessionNo} mono />
                <Stat label="เปิดโดย" value={`${session.openedBy} · ${formatDateTime(session.openedAt)}`} small />
                <Stat label="เงินทอนตั้งต้น" value={formatTHB(session.openingFloat)} />
                <Stat
                  label="ยอดในเก๊ะปัจจุบัน"
                  value={formatTHB(balance)}
                  highlight
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setShowMovement(true)}
                  className="btn-secondary">
                  <Plus className="h-4 w-4" />
                  บันทึกเงินเข้า-ออก
                </button>
                <button
                  onClick={() => setShowClose(true)}
                  className="btn-primary bg-rose-600 hover:bg-rose-700 ml-auto">
                  <DoorClosed className="h-4 w-4" />
                  ปิดเก๊ะ (สิ้นวัน)
                </button>
              </div>
            </div>
          </div>

          {/* V31 — สรุปสด/โอน/บัตร/QR ตอบ requirement "เย็นนี้สรุปยอด" */}
          <PaymentBreakdownCard breakdown={session.breakdown ?? null} />

          {/* Movements log */}
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <span>📋 รายการเคลื่อนไหวเงินสด ({session.movements?.length ?? 0})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-2">เวลา</th>
                    <th className="px-4 py-2">ประเภท</th>
                    <th className="px-4 py-2">จาก</th>
                    <th className="px-4 py-2">อ้างอิง</th>
                    <th className="px-4 py-2 text-right">ยอด</th>
                    <th className="px-4 py-2">โดย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!session.movements?.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        ยังไม่มี movement
                      </td>
                    </tr>
                  )}
                  {/* แสดงล่าสุดอยู่บนสุด (เรียง createdAt จากใหม่→เก่า) — copy ก่อน sort ไม่กระทบ balance */}
                  {[...(session.movements ?? [])]
                    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                    .map((m) => {
                    // แยก "กระทบเก๊ะ" (amount) ออกจาก "ยอดที่แสดง" (displayAmount)
                    // โอน/บัตร/QR: amount=0 (ไม่กระทบเก๊ะ) แต่โชว์ยอดจริงแบบสีเทา + ป้าย "เข้าบัญชี" กันเข้าใจผิดว่าเงินสดเพิ่ม
                    const disp = m.displayAmount ?? m.amount;
                    const affectsDrawer = m.amount !== 0;
                    const positive = disp >= 0;
                    const amountCls = !affectsDrawer
                      ? 'text-slate-400'                                  // ไม่กระทบเก๊ะ = เทา
                      : positive ? 'text-emerald-700' : 'text-rose-700';
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(m.createdAt)}</td>
                        <td className="px-4 py-2">{TYPE_TH[m.type]}</td>
                        <td className="px-4 py-2">{PAID_FROM_TH[m.paidFrom]}</td>
                        <td className="px-4 py-2 text-xs font-mono text-slate-600">
                          {m.referenceNo ?? '-'}
                          {m.note && <div className="font-sans text-slate-400">{m.note}</div>}
                        </td>
                        <td className={`px-4 py-2 text-right font-bold ${amountCls}`}>
                          <span className="inline-flex items-center gap-1">
                            {affectsDrawer && (positive
                              ? <ArrowDownCircle className="h-3.5 w-3.5" />
                              : <ArrowUpCircle className="h-3.5 w-3.5" />)}
                            {formatTHB(Math.abs(disp))}
                            {!affectsDrawer && disp !== 0 && (
                              <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-500">
                                {positive ? 'เข้าบัญชี' : 'ออกบัญชี'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">{m.createdBy ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Owner ledger — เงินเจ้าของ: STAFF ไม่เห็น (FIX-102) */}
      {canSeeOwnerLedger && (
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <Users className="h-5 w-5 text-amber-600" />
          ตา/ยาย — เงินที่ออกแทนเก๊ะ (วันนี้)
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="👴 ตา" value={formatTHB(ledger?.totalGrandpa ?? 0)} highlight />
            <Stat label="👵 ยาย" value={formatTHB(ledger?.totalGrandma ?? 0)} highlight />
            <Stat label="รวม" value={formatTHB(ledger?.totalAll ?? 0)} highlight />
          </div>
          {ledger && ledger.entries.length > 0 && (
            <div className="mt-3 max-h-60 overflow-y-auto rounded border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5">เวลา</th>
                    <th className="px-3 py-1.5">จาก</th>
                    <th className="px-3 py-1.5">บิล</th>
                    <th className="px-3 py-1.5 text-right">ยอด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-1.5">{formatDateTime(e.createdAt)}</td>
                      <td className="px-3 py-1.5">{PAID_FROM_TH[e.paidFrom]}</td>
                      <td className="px-3 py-1.5 font-mono">{e.referenceNo ?? '-'}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{formatTHB(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ledger?.totalAll === 0 && (
            <p className="mt-2 text-xs text-slate-500">— ยังไม่มีการใช้เงินจากตา/ยายวันนี้ —</p>
          )}
        </div>
      </div>
      )}

      {showOpen && <OpenSessionModal onClose={() => setShowOpen(false)} />}
      {showClose && session && <CloseSessionModal session={session} onClose={() => setShowClose(false)} />}
      {showMovement && session && <CashMovementModal sessionId={session.id} onClose={() => setShowMovement(false)} />}
    </div>
  );
}

function Stat({ label, value, mono, small, highlight }: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`${mono ? 'font-mono' : ''} ${small ? 'text-xs' : 'text-lg'} ${highlight ? 'font-bold text-brand-700' : 'font-semibold'}`}>
        {value}
      </div>
    </div>
  );
}

// Unused imports cleanup
void AlertTriangle;
