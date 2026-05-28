import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wrench, Printer, Play, CheckCircle2, HandCoins, Ban, X } from 'lucide-react';
import { repairApi } from '@/api/repair';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDateTime } from '@/lib/format';
import { RepairBillPrintView } from '@/components/RepairBillPrintView';
import type { PaymentMethod, RepairStatus, RepairTicket } from '@/types/api';

const STATUS_TH: Record<RepairStatus, string> = {
  RECEIVED: 'รับเครื่อง',
  IN_PROGRESS: 'กำลังซ่อม',
  DONE: 'ซ่อมเสร็จ',
  PICKED_UP: 'รับคืนแล้ว',
  CANCELLED: 'ยกเลิก',
};

const STATUS_BADGE: Record<RepairStatus, string> = {
  RECEIVED: 'badge-blue',
  IN_PROGRESS: 'badge-amber',
  DONE: 'badge-green',
  PICKED_UP: 'badge-slate',
  CANCELLED: 'badge-red',
};

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอนเงิน / QR' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
];

const FILTERS: { value: RepairStatus | ''; label: string }[] = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'RECEIVED', label: 'รับเครื่อง' },
  { value: 'IN_PROGRESS', label: 'กำลังซ่อม' },
  { value: 'DONE', label: 'ซ่อมเสร็จ' },
  { value: 'PICKED_UP', label: 'รับคืนแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
];

export function RepairListPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RepairStatus | ''>('');
  const [doneTarget, setDoneTarget] = useState<RepairTicket | null>(null);
  const [pickupTarget, setPickupTarget] = useState<RepairTicket | null>(null);
  const [ticketToPrint, setTicketToPrint] = useState<RepairTicket | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['repair-tickets', statusFilter],
    queryFn: () => repairApi.list({ status: statusFilter || undefined, size: 100 }),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof repairApi.updateStatus>[1] }) =>
      repairApi.updateStatus(id, body),
    onSuccess: () => {
      toast.success('อัปเดตสถานะแล้ว');
      qc.invalidateQueries({ queryKey: ['repair-tickets'] });
      setDoneTarget(null);
      setPickupTarget(null);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // พิมพ์ใบรับซ่อมเมื่อเลือก
  useEffect(() => {
    if (!ticketToPrint) return;
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, [ticketToPrint]);

  const start = (t: RepairTicket) => update.mutate({ id: t.id, body: { status: 'IN_PROGRESS' } });
  const cancel = (t: RepairTicket) => {
    if (window.confirm(`ยกเลิกงานซ่อม ${t.ticketNo}?`)) {
      update.mutate({ id: t.id, body: { status: 'CANCELLED' } });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Wrench className="h-6 w-6 text-amber-600" /> งานซ่อม / เคลม (Repair Tickets)
        </h1>
        <p className="text-sm text-slate-500">ติดตามงานรับซ่อมเครื่องของลูกค้า</p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.value || 'all'}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    statusFilter === f.value
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">เลขใบ / ลูกค้า</th>
                <th className="px-4 py-3">เครื่อง / อาการ</th>
                <th className="px-4 py-3 text-right">ค่าซ่อม / มัดจำ</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">รับเข้า</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-semibold">{t.ticketNo}</div>
                    <div>{t.customerName}</div>
                    {t.customerPhone && <div className="text-xs text-slate-500">{t.customerPhone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {[t.deviceBrand, t.deviceModel, t.deviceColor].filter(Boolean).join(' ')}
                    </div>
                    {t.imei && <div className="text-xs text-slate-500 font-mono">IMEI: {t.imei}</div>}
                    <div className="text-xs text-slate-600">🔧 {t.reportedSymptom}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold">{formatTHB(t.repairCost)}</div>
                    {t.depositAmount > 0 && <div className="text-xs text-slate-500">มัดจำ {formatTHB(t.depositAmount)}</div>}
                    {t.status === 'DONE' && <div className="text-xs text-amber-700">ค้าง {formatTHB(t.balanceDue)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[t.status]}>{STATUS_TH[t.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(t.receivedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {t.status === 'RECEIVED' && (
                        <button className="rounded p-1.5 text-amber-700 hover:bg-amber-50" title="เริ่มซ่อม"
                                onClick={() => start(t)}><Play className="h-4 w-4" /></button>
                      )}
                      {(t.status === 'RECEIVED' || t.status === 'IN_PROGRESS') && (
                        <button className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50" title="ซ่อมเสร็จ"
                                onClick={() => setDoneTarget(t)}><CheckCircle2 className="h-4 w-4" /></button>
                      )}
                      {t.status === 'DONE' && (
                        <button className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50" title="รับเครื่องคืน / จ่ายเงิน"
                                onClick={() => setPickupTarget(t)}><HandCoins className="h-4 w-4" /></button>
                      )}
                      <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="พิมพ์ใบรับซ่อม"
                              onClick={() => setTicketToPrint(t)}><Printer className="h-4 w-4" /></button>
                      {t.status !== 'PICKED_UP' && t.status !== 'CANCELLED' && (
                        <button className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ยกเลิก"
                                onClick={() => cancel(t)}><Ban className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">ไม่มีงานซ่อมในสถานะนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ปิดงานซ่อม — กรอกค่าซ่อมจริง + งานที่ทำ */}
      {doneTarget && (
        <DoneDialog
          ticket={doneTarget}
          pending={update.isPending}
          onClose={() => setDoneTarget(null)}
          onConfirm={(repairCost, workDescription) =>
            update.mutate({ id: doneTarget.id, body: { status: 'DONE', repairCost, workDescription } })}
        />
      )}

      {/* รับเครื่องคืน — เลือกวิธีชำระ */}
      {pickupTarget && (
        <PickupDialog
          ticket={pickupTarget}
          pending={update.isPending}
          onClose={() => setPickupTarget(null)}
          onConfirm={(paymentMethod) =>
            update.mutate({ id: pickupTarget.id, body: { status: 'PICKED_UP', paymentMethod } })}
        />
      )}

      {/* Hidden printout */}
      {ticketToPrint && <RepairBillPrintView ticket={ticketToPrint} />}
    </div>
  );
}

// ─── Done dialog ────────────────────────────────────────────────────────────

function DoneDialog({ ticket, pending, onClose, onConfirm }: {
  ticket: RepairTicket; pending: boolean;
  onClose: () => void; onConfirm: (cost: number, work: string) => void;
}) {
  const [cost, setCost] = useState<number>(ticket.repairCost || ticket.estimatedCost || 0);
  const [work, setWork] = useState('');
  return (
    <Dialog title={`ปิดงานซ่อม — ${ticket.ticketNo}`} onClose={onClose}>
      <label className="mb-1 block text-sm font-medium">ค่าซ่อมจริง (บาท)</label>
      <input type="number" min={0} step="0.01" className="input"
             value={cost} onChange={(e) => setCost(Number(e.target.value) || 0)} />
      <label className="mb-1 mt-3 block text-sm font-medium">งานที่ซ่อม / อะไหล่</label>
      <textarea className="input" rows={3} placeholder="เช่น เปลี่ยนจอแท้, เปลี่ยนแบต..."
                value={work} onChange={(e) => setWork(e.target.value)} />
      {ticket.depositAmount > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          มัดจำแล้ว {formatTHB(ticket.depositAmount)} · ค้างชำระ {formatTHB(Math.max(0, cost - ticket.depositAmount))}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" disabled={pending} onClick={() => onConfirm(cost, work)}>
          ยืนยันซ่อมเสร็จ
        </button>
      </div>
    </Dialog>
  );
}

// ─── Pickup dialog ──────────────────────────────────────────────────────────

function PickupDialog({ ticket, pending, onClose, onConfirm }: {
  ticket: RepairTicket; pending: boolean;
  onClose: () => void; onConfirm: (method: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  return (
    <Dialog title={`รับเครื่องคืน — ${ticket.ticketNo}`} onClose={onClose}>
      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><span>ค่าซ่อม:</span><span>{formatTHB(ticket.repairCost)}</span></div>
        <div className="flex justify-between"><span>มัดจำ:</span><span>- {formatTHB(ticket.depositAmount)}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold">
          <span>ต้องชำระเพิ่ม:</span><span>{formatTHB(ticket.balanceDue)}</span>
        </div>
      </div>
      <label className="mb-1 mt-3 block text-sm font-medium">วิธีชำระเงิน</label>
      <div className="grid grid-cols-1 gap-2">
        {PAYMENT_OPTIONS.map((o) => (
          <button key={o.value} type="button" onClick={() => setMethod(o.value)}
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    method === o.value
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}>{o.label}</button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" disabled={pending} onClick={() => onConfirm(method)}>
          ยืนยันรับเครื่องคืน
        </button>
      </div>
    </Dialog>
  );
}

// ─── Generic small dialog ─────────────────────────────────────────────────────

function Dialog({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
