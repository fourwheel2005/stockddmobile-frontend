import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeftRight, Plus, X, Check, Search, Printer } from 'lucide-react';
import { transfersApi } from '@/api/transfers';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { EscPosBuilder } from '@/lib/escpos/EscPosBuilder';
import { branchesApi } from '@/api/branches';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { useBranchStore } from '@/stores/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/lib/format';
import type { TransferStatus, SerializedItemResponse, Transfer } from '@/types/api';

/** สร้าง ESC/POS ใบโอนสาขา (Thai CP874 = codepage 26 เหมือนใบเสร็จ) */
function buildTransferSlip(t: Transfer): Uint8Array {
  const b = new EscPosBuilder().init().codepage(26)
    .align('C').size(2, 2).bold(true).textln('DDMobile').bold(false).size(1, 1)
    .textln('ใบโอนสาขา').textln(t.transferNo)
    .separator('=', 48).align('L')
    .textln(`จาก : ${t.fromBranchName}`)
    .textln(`ไป  : ${t.toBranchName}`)
    .textln(`วันที่: ${formatDateTime(t.createdAt)}`)
    .textln(`โดย : ${t.createdBy}`)
    .separator('-', 48);
  t.items.forEach((it, i) => {
    b.textln(`${i + 1}. ${it.stockCode ?? it.imei ?? it.serialNumber}`);
    const spec = [it.productName, it.deviceColor, it.deviceStorage].filter(Boolean).join(' ');
    if (spec) b.textln(`   ${spec}`);
  });
  return b.separator('-', 48).textln(`รวม ${t.itemCount} เครื่อง`)
    .align('C').textln('ผู้รับ ___________________')
    .feedAndCut(4).build();
}

async function printTransferSlip(t: Transfer) {
  try {
    const { strategy } = await printOrchestrator.print(buildTransferSlip(t), { billNo: t.transferNo });
    toast.success(strategy === 'PULL_AGENT' ? 'ส่งใบโอนเข้าคิวปริ้นแล้ว ☁️' : `พิมพ์ใบโอนแล้ว (${strategy})`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'พิมพ์ใบโอนไม่สำเร็จ');
  }
}

const STATUS_LABEL: Record<TransferStatus, { text: string; cls: string }> = {
  PENDING: { text: 'กำลังโอน (รอรับ)', cls: 'bg-amber-100 text-amber-700' },
  RECEIVED: { text: 'รับแล้ว', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { text: 'ยกเลิก', cls: 'bg-slate-200 text-slate-500' },
};

export function TransfersPage() {
  const qc = useQueryClient();
  const isManager = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const [filter, setFilter] = useState<TransferStatus | ''>('');
  const [creating, setCreating] = useState(false);

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['transfers', filter],
    queryFn: () => transfersApi.list(filter || undefined),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'receive' | 'cancel' }) =>
      action === 'receive' ? transfersApi.receive(id) : transfersApi.cancel(id),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'receive' ? 'รับเครื่องเข้าสาขาแล้ว' : 'ยกเลิกใบโอนแล้ว');
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 page-title">
          <ArrowLeftRight className="h-6 w-6 text-brand-600" /> โอนสาขา
        </h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> สร้างใบโอน
        </button>
      </div>

      <div className="flex gap-2 text-sm">
        {([['', 'ทั้งหมด'], ['PENDING', 'รอรับ'], ['RECEIVED', 'รับแล้ว'], ['CANCELLED', 'ยกเลิก']] as const).map(
          ([v, label]) => (
            <button key={v} onClick={() => setFilter(v)}
                    className={`rounded-full px-3 py-1 ${filter === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {label}
            </button>
          ))}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400">กำลังโหลด…</div>
      ) : (transfers ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-slate-400">
          ยังไม่มีใบโอน
        </div>
      ) : (
        <div className="space-y-2">
          {(transfers ?? []).map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{t.transferNo}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_LABEL[t.status].cls}`}>
                      {STATUS_LABEL[t.status].text}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {t.fromBranchName} <span className="text-slate-400">→</span> <strong>{t.toBranchName}</strong>
                    {' · '}{t.itemCount} เครื่อง
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    สร้างโดย {t.createdBy} · {formatDateTime(t.createdAt)}
                    {t.receivedAt && ` · รับโดย ${t.receivedBy} · ${formatDateTime(t.receivedAt)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs" title="พิมพ์ใบโอน"
                          onClick={() => printTransferSlip(t)}>
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  {t.status === 'PENDING' && (
                    <>
                      <button className="btn-primary text-xs" disabled={act.isPending}
                              onClick={() => act.mutate({ id: t.id, action: 'receive' })}>
                        <Check className="h-3.5 w-3.5" /> รับเข้า
                      </button>
                      {isManager && (
                        <button className="btn-secondary text-xs" disabled={act.isPending}
                                onClick={() => { if (confirm('ยกเลิกใบโอนนี้? เครื่องจะกลับเข้าต้นทาง')) act.mutate({ id: t.id, action: 'cancel' }); }}>
                          ยกเลิก
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.items.map((it) => (
                  <span key={it.serialItemId} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                    {it.stockCode ?? it.imei ?? it.serialNumber}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateTransferModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateTransferModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const [toBranchId, setToBranchId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');

  const { data: branches } = useQuery({ queryKey: ['branches', 'active'], queryFn: () => branchesApi.list(false) });
  const { data: devices } = useQuery({
    queryKey: ['transfer-devices', activeBranchId],
    enabled: !!activeBranchId,
    queryFn: () => inventoryApi.listSerials({ status: 'IN_STOCK', branchId: activeBranchId!, size: 200 }),
  });

  const sourceName = branches?.find((b) => b.id === activeBranchId)?.name;
  const list = useMemo<SerializedItemResponse[]>(() => {
    const all = devices?.content ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((d) =>
      [d.imei, d.serialNumber, d.stockCode, d.productName].some((x) => x?.toLowerCase().includes(term)));
  }, [devices, q]);

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const create = useMutation({
    mutationFn: () => transfersApi.create({ toBranchId, serialItemIds: [...selected], note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success('สร้างใบโอนแล้ว — เครื่องกำลังโอน');
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">สร้างใบโอนสาขา</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-5">
          {!activeBranchId ? (
            <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
              เลือก <strong>สาขาต้นทาง</strong> ที่แถบซ้ายก่อน (ตอนนี้เป็น "ทุกสาขา") — โอนต้องรู้ว่าส่งจากสาขาไหน
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-600">
                ต้นทาง: <strong>{sourceName ?? '—'}</strong>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">โอนไปสาขา <span className="text-red-500">*</span></label>
                <select className="input" value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
                  <option value="">— เลือกปลายทาง —</option>
                  {(branches ?? []).filter((b) => b.id !== activeBranchId).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  เลือกเครื่อง ({selected.size} เครื่อง)
                </label>
                <div className="relative mb-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <input className="input pl-8 text-sm" placeholder="ค้นหา IMEI / รหัส / รุ่น"
                         value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
                  {list.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">ไม่มีเครื่องในสต๊อกสาขานี้</div>
                  ) : list.map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                      <span className="font-mono text-xs font-semibold text-brand-700">{d.stockCode ?? '—'}</span>
                      <span className="flex-1 truncate">{d.productName ?? d.sku}
                        <span className="text-slate-400"> · {[d.deviceColor, d.deviceStorage].filter(Boolean).join(' ')}</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">{d.imei ?? d.serialNumber}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เว้นว่างได้" />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary"
                  disabled={!activeBranchId || !toBranchId || selected.size === 0 || create.isPending}
                  onClick={() => create.mutate()}>
            {create.isPending ? 'กำลังสร้าง…' : `โอน ${selected.size} เครื่อง`}
          </button>
        </div>
      </div>
    </div>
  );
}
