import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bookmark, PackageCheck, PackagePlus, Search, ShoppingCart, Wallet, XCircle } from 'lucide-react';
import { deviceDepositsApi } from '@/api/deviceDeposits';
import { formatTHB, formatDateTime } from '@/lib/format';
import {
  DepositArrivalModal, DepositCancelModal, DepositPaymentModal, OrderDeviceModal, ReserveDeviceModal,
} from '@/components/deposits/DepositModals';
import type { DeviceDeposit, DeviceDepositStatus } from '@/types/api';

/**
 * มัดจำ/จองเครื่อง (FIX-214) — รวมใบจองเครื่องในร้าน + มัดจำสั่งเครื่อง
 * รอเครื่องถึง → กด "เครื่องถึงแล้ว" (เข้าสต็อก) · พร้อมขาย → กด "ขาย" ไป POS (หักมัดจำให้อัตโนมัติ)
 */
type Tab = 'WAITING' | 'READY' | 'CLOSED';

const STATUS_LABEL: Record<DeviceDepositStatus, string> = {
  WAITING_ARRIVAL: 'รอเครื่องถึง',
  READY: 'พร้อมขาย (กันเครื่องไว้แล้ว)',
  COMPLETED: 'ขายแล้ว',
  CANCELLED: 'ยกเลิก',
};

export function DeviceDepositsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('READY');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<
    | { kind: 'reserve' } | { kind: 'order' }
    | { kind: 'arrive' | 'pay' | 'cancel'; deposit: DeviceDeposit } | null
  >(null);

  const open = useQuery({ queryKey: ['device-deposits', 'OPEN'], queryFn: () => deviceDepositsApi.list('OPEN') });
  const closed = useQuery({
    queryKey: ['device-deposits', 'CLOSED'], queryFn: () => deviceDepositsApi.list('CLOSED'), enabled: tab === 'CLOSED',
  });

  const waiting = (open.data ?? []).filter((d) => d.status === 'WAITING_ARRIVAL');
  const ready = (open.data ?? []).filter((d) => d.status === 'READY');
  const source = tab === 'WAITING' ? waiting : tab === 'READY' ? ready : (closed.data ?? []);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return source;
    return source.filter((d) => [d.depositNo, d.customerName, d.customerPhone, d.productName, d.imei, d.serialNumber, d.stockCode]
      .some((v) => (v ?? '').toLowerCase().includes(term)));
  }, [source, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title flex items-center gap-2"><Bookmark className="h-6 w-6 text-brand-600" /> มัดจำ / จองเครื่อง</h1>
          <p className="page-subtitle">จองเครื่องในร้าน · มัดจำสั่งเครื่อง · เครื่องถึงแล้วเข้าสต็อก · ขายหักมัดจำ</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sky-700" onClick={() => setModal({ kind: 'reserve' })}>
            <Bookmark className="h-4 w-4" /> จองเครื่อง
          </button>
          <button className="btn-secondary text-violet-700" onClick={() => setModal({ kind: 'order' })}>
            <PackagePlus className="h-4 w-4" /> มัดจำสั่งเครื่อง
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <TabButton active={tab === 'READY'} onClick={() => setTab('READY')}>พร้อมขาย ({ready.length})</TabButton>
          <TabButton active={tab === 'WAITING'} onClick={() => setTab('WAITING')}>รอเครื่องถึง ({waiting.length})</TabButton>
          <TabButton active={tab === 'CLOSED'} onClick={() => setTab('CLOSED')}>ปิดแล้ว</TabButton>
        </div>
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-8" placeholder="ค้นหา เลขที่ใบ / ลูกค้า / เบอร์ / รุ่น / IMEI" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {(open.isLoading || (tab === 'CLOSED' && closed.isLoading)) && <div className="card card-body text-center text-slate-500">กำลังโหลด...</div>}
      {!open.isLoading && rows.length === 0 && (
        <div className="card card-body text-center text-slate-400">ไม่มีรายการ</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((d) => (
          <div key={d.id} className="card">
            <div className="card-body space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-slate-500">{d.depositNo} · {formatDateTime(d.createdAt)}</div>
                  <div className="font-semibold">{d.customerName} {d.customerPhone && <span className="font-normal text-slate-500">· {d.customerPhone}</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${d.kind === 'ORDER' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
                    {d.kind === 'ORDER' ? 'มัดจำสั่งเครื่อง' : 'จองเครื่อง'}
                  </span>
                  <span className="text-[11px] text-slate-500">{STATUS_LABEL[d.status]}</span>
                </div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <div className="font-medium">{d.productName}</div>
                <div className="text-xs text-slate-600">
                  {[d.deviceColor, d.deviceStorage, d.condition === 'NEW' ? 'มือ 1' : d.condition ? 'มือ 2' : null].filter(Boolean).join(' / ')}
                  {d.stockCode && <> · {d.stockCode}</>}
                </div>
                <div className="font-mono text-xs text-slate-500">IMEI {d.imei ?? 'ยังไม่ระบุ'}</div>
                {d.expectedDate && d.status === 'WAITING_ARRIVAL' && <div className="text-xs text-violet-700">คาดว่าถึง {d.expectedDate}</div>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Money label="ราคาตกลง" value={d.agreedPrice} />
                <Money label="มัดจำแล้ว" value={d.balance} tone="text-emerald-700" />
                <Money label={d.status === 'COMPLETED' ? 'หักในบิล' : 'คงเหลือ'} value={d.status === 'COMPLETED' ? (d.appliedAmount ?? 0) : d.remaining} tone="text-amber-700" />
              </div>
              {d.billNo && <div className="text-xs text-slate-500">บิลขาย {d.billNo}</div>}
              {d.cancelReason && <div className="text-xs text-rose-700">ยกเลิก: {d.cancelReason}</div>}
              {d.note && <div className="text-xs text-slate-500">หมายเหตุ: {d.note}</div>}

              {(d.status === 'WAITING_ARRIVAL' || d.status === 'READY') && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {d.status === 'WAITING_ARRIVAL' && (
                    <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" onClick={() => setModal({ kind: 'arrive', deposit: d })}>
                      <PackageCheck className="h-4 w-4" /> เครื่องถึงแล้ว
                    </button>
                  )}
                  {d.status === 'READY' && (
                    <button className="btn-primary" onClick={() => navigate(`/pos?deposit=${d.id}`)}>
                      <ShoppingCart className="h-4 w-4" /> ขาย (หักมัดจำ)
                    </button>
                  )}
                  {d.remaining > 0 && (
                    <button className="btn-secondary" onClick={() => setModal({ kind: 'pay', deposit: d })}>
                      <Wallet className="h-4 w-4" /> รับเงินเพิ่ม
                    </button>
                  )}
                  <button className="btn-secondary text-rose-700" onClick={() => setModal({ kind: 'cancel', deposit: d })}>
                    <XCircle className="h-4 w-4" /> ยกเลิก
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal?.kind === 'reserve' && <ReserveDeviceModal onClose={() => setModal(null)} />}
      {modal?.kind === 'order' && <OrderDeviceModal onClose={() => setModal(null)} />}
      {modal?.kind === 'arrive' && <DepositArrivalModal deposit={modal.deposit} onClose={() => setModal(null)} />}
      {modal?.kind === 'pay' && <DepositPaymentModal deposit={modal.deposit} onClose={() => setModal(null)} />}
      {modal?.kind === 'cancel' && <DepositCancelModal deposit={modal.deposit} onClose={() => setModal(null)} />}
    </div>
  );
}

function Money({ label, value, tone = 'text-slate-800' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-slate-100 px-2 py-1.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`font-bold tabular-nums ${tone}`}>{formatTHB(value)}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
      {children}
    </button>
  );
}
