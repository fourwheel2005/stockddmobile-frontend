import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wrench, Printer, Play, CheckCircle2, HandCoins, Ban, X, Pencil, ReceiptText } from 'lucide-react';
import { repairApi } from '@/api/repair';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDateTime } from '@/lib/format';
import { shopDayKey, formatInShopZone } from '@/lib/datetime';
import { RepairBillPrintView } from '@/components/RepairBillPrintView';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { buildRepairSlip, type RepairSlipMode } from '@/lib/escpos/repairEscpos';
import type { PaymentMethod, RepairStatus, RepairTicket, UpdateRepairRequest } from '@/types/api';

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
  const [editTarget, setEditTarget] = useState<RepairTicket | null>(null);
  const [printView, setPrintView] = useState<{ ticket: RepairTicket; mode: RepairSlipMode } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['repair-tickets', statusFilter],
    queryFn: () => repairApi.list({ status: statusFilter || undefined, size: 100 }),
  });

  // จัดกลุ่มงานซ่อมเป็น "รายวัน" ตามวันรับเข้า (โซนร้าน) — list เรียงใหม่→เก่าจาก backend อยู่แล้ว
  const dayGroups = useMemo(() => {
    const groups: Array<{ key: string; tickets: RepairTicket[]; count: number; total: number }> = [];
    const byKey = new Map<string, (typeof groups)[number]>();
    for (const t of data?.content ?? []) {
      const key = shopDayKey(t.receivedAt);
      let g = byKey.get(key);
      if (!g) { g = { key, tickets: [], count: 0, total: 0 }; byKey.set(key, g); groups.push(g); }
      g.tickets.push(t);
      g.count += 1;
      g.total += t.repairCost ?? 0;
    }
    return groups;
  }, [data]);

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

  const updateDetails = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRepairRequest }) => repairApi.update(id, body),
    onSuccess: () => {
      toast.success('แก้ไขใบซ่อมแล้ว');
      qc.invalidateQueries({ queryKey: ['repair-tickets'] });
      setEditTarget(null);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // พิมพ์ใบซ่อม/ใบเสร็จ ผ่านเครื่องปริ้นความร้อน (bridge → pull-agent → browser fallback = HTML)
  const printRepair = async (t: RepairTicket, mode: RepairSlipMode) => {
    try {
      printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
      const { strategy } = await printOrchestrator.print(
        buildRepairSlip(t, mode),
        { billNo: t.ticketNo },
        { browserPrint: async () => {
          setPrintView({ ticket: t, mode });
          await new Promise((resolve) => setTimeout(resolve, 250));
          window.print();
        } },
      );
      toast.success(strategy === 'PULL_AGENT' ? 'ส่งเข้าคิวปริ้นแล้ว ☁️' : `พิมพ์แล้ว (${strategy})`);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

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
              {dayGroups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="bg-slate-100/70">
                    <td colSpan={6} className="px-4 py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">
                          📅 {formatInShopZone(g.key, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-slate-500">{g.count} งาน · รวมค่าซ่อม {formatTHB(g.total)}</span>
                      </div>
                    </td>
                  </tr>
                  {g.tickets.map((t) => (
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
                    {t.outsourced && (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        ส่งช่าง{t.technicianName ? `: ${t.technicianName}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold">{formatTHB(t.repairCost)}</div>
                    {t.depositAmount > 0 && <div className="text-xs text-slate-500">มัดจำ {formatTHB(t.depositAmount)}</div>}
                    {t.outsourced && (t.outsourceCost ?? 0) > 0 && (
                      <div className="text-xs text-slate-400">จ่ายช่าง {formatTHB(t.outsourceCost!)}</div>
                    )}
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
                      {t.status !== 'PICKED_UP' && t.status !== 'CANCELLED' && (
                        <button className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="แก้ไข/เพิ่มอาการ"
                                onClick={() => setEditTarget(t)}><Pencil className="h-4 w-4" /></button>
                      )}
                      <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="พิมพ์ใบรับซ่อม"
                              onClick={() => printRepair(t, 'INTAKE')}><Printer className="h-4 w-4" /></button>
                      {(t.status === 'DONE' || t.status === 'PICKED_UP') && (
                        <button className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50" title="พิมพ์ใบเสร็จค่าซ่อม"
                                onClick={() => printRepair(t, 'RECEIPT')}><ReceiptText className="h-4 w-4" /></button>
                      )}
                      {t.status !== 'PICKED_UP' && t.status !== 'CANCELLED' && (
                        <button className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ยกเลิก"
                                onClick={() => cancel(t)}><Ban className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
                  ))}
                </Fragment>
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

      {/* แก้ไข/เพิ่มอาการ ระหว่างทาง */}
      {editTarget && (
        <EditRepairDialog
          ticket={editTarget}
          pending={updateDetails.isPending}
          onClose={() => setEditTarget(null)}
          onSave={(body) => updateDetails.mutate({ id: editTarget.id, body })}
        />
      )}

      {/* Hidden printout — browser fallback (bridge/pull-agent ใช้ ESC/POS) */}
      {printView && <RepairBillPrintView ticket={printView.ticket} mode={printView.mode} />}
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

// ─── แก้ไข/เพิ่มอาการ ระหว่างทาง ──────────────────────────────────────────────
function EditRepairDialog({ ticket, pending, onClose, onSave }: {
  ticket: RepairTicket; pending: boolean;
  onClose: () => void; onSave: (body: UpdateRepairRequest) => void;
}) {
  const [f, setF] = useState({
    customerName: ticket.customerName, customerPhone: ticket.customerPhone ?? '',
    deviceBrand: ticket.deviceBrand ?? '', deviceModel: ticket.deviceModel, deviceColor: ticket.deviceColor ?? '',
    imei: ticket.imei ?? '', serialNumber: ticket.serialNumber ?? '', screenCode: ticket.screenCode ?? '',
    reportedSymptom: ticket.reportedSymptom, workDescription: ticket.workDescription ?? '',
    estimatedCost: ticket.estimatedCost ?? 0, repairCost: ticket.repairCost, depositAmount: ticket.depositAmount,
    outsourced: ticket.outsourced, technicianName: ticket.technicianName ?? '', outsourceCost: ticket.outsourceCost ?? 0,
    note: ticket.note ?? '',
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">แก้ไข/เพิ่มอาการ — {ticket.ticketNo}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">อาการที่ลูกค้าแจ้ง</label>
            <textarea className="input" rows={2} value={f.reportedSymptom}
                      onChange={(e) => set({ reportedSymptom: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-amber-700">🔧 อาการที่ช่างเจอเพิ่ม / งานที่ซ่อม</label>
            <textarea className="input" rows={3} placeholder="เช่น เจอบอร์ดช็อตเพิ่ม, เปลี่ยนจอ+แบต"
                      value={f.workDescription} onChange={(e) => set({ workDescription: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">ประเมินค่าซ่อม</label>
              <input type="number" min={0} className="input text-sm" value={f.estimatedCost}
                     onChange={(e) => set({ estimatedCost: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">ค่าซ่อมจริง</label>
              <input type="number" min={0} className="input text-sm" value={f.repairCost}
                     onChange={(e) => set({ repairCost: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">มัดจำ</label>
              <input type="number" min={0} className="input text-sm" value={f.depositAmount}
                     onChange={(e) => set({ depositAmount: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input text-sm" placeholder="ยี่ห้อ" value={f.deviceBrand} onChange={(e) => set({ deviceBrand: e.target.value })} />
            <input className="input text-sm" placeholder="รุ่น" value={f.deviceModel} onChange={(e) => set({ deviceModel: e.target.value })} />
            <input className="input text-sm" placeholder="สี" value={f.deviceColor} onChange={(e) => set({ deviceColor: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm font-mono" placeholder="IMEI" value={f.imei} onChange={(e) => set({ imei: e.target.value })} />
            <input className="input text-sm" placeholder="รหัสหน้าจอ" value={f.screenCode} onChange={(e) => set({ screenCode: e.target.value })} />
          </div>
          {/* ส่งซ่อมช่างนอก (FIX-093) */}
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
            <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <input type="checkbox" checked={f.outsourced}
                     onChange={(e) => set({ outsourced: e.target.checked })} />
              🔧 ส่งซ่อมช่างอื่น
            </label>
            {f.outsourced && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="input text-sm" placeholder="ชื่อช่าง" value={f.technicianName}
                       onChange={(e) => set({ technicianName: e.target.value })} />
                <input type="number" min={0} className="input text-sm" placeholder="ราคาส่งซ่อม (จ่ายช่าง)"
                       value={f.outsourceCost} onChange={(e) => set({ outsourceCost: Number(e.target.value) || 0 })} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="ชื่อลูกค้า" value={f.customerName} onChange={(e) => set({ customerName: e.target.value })} />
            <input className="input text-sm" placeholder="เบอร์โทร" value={f.customerPhone} onChange={(e) => set({ customerPhone: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={pending || !f.customerName.trim() || !f.deviceModel.trim() || !f.reportedSymptom.trim()}
                  onClick={() => onSave({
                    customerName: f.customerName, customerPhone: f.customerPhone,
                    deviceBrand: f.deviceBrand, deviceModel: f.deviceModel, deviceColor: f.deviceColor,
                    imei: f.imei, serialNumber: f.serialNumber, screenCode: f.screenCode,
                    reportedSymptom: f.reportedSymptom, workDescription: f.workDescription,
                    estimatedCost: f.estimatedCost, repairCost: f.repairCost, depositAmount: f.depositAmount,
                    outsourced: f.outsourced,
                    technicianName: f.outsourced ? f.technicianName : '',
                    outsourceCost: f.outsourced ? f.outsourceCost : 0,
                    note: f.note,
                  })}>
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
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
