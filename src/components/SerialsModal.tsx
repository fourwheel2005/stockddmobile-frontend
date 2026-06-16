import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Wrench, ShieldAlert, Undo2, BatteryMedium, Pencil, Save } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatDate } from '@/lib/format';
import { acqLabel } from '@/lib/acquisition';
import type { SerializedStatus, ServiceState, SerializedItemResponse, SerializedCondition } from '@/types/api';

interface Props {
  variantId: string;
  productName: string;
  sku: string;
  onClose: () => void;
}

const STATUS_BADGE: Record<SerializedStatus, string> = {
  IN_STOCK: 'badge-green',
  RESERVED: 'badge-blue',
  SOLD: 'badge-slate',
  DEFECTIVE: 'badge-red',
  RETURNED: 'badge-amber',
  TRANSFERRED: 'badge-slate',
};

const STATUS_TH: Record<SerializedStatus, string> = {
  IN_STOCK: 'พร้อมขาย',
  RESERVED: 'จองแล้ว',
  SOLD: 'ขายแล้ว',
  DEFECTIVE: 'ชำรุด/บริการ',
  RETURNED: 'คืน',
  TRANSFERRED: 'ย้ายสาขา',
};

const SERVICE_TH: Record<ServiceState, string> = {
  AWAITING_REPAIR: 'รอซ่อม',
  SENT_CLAIM: 'ส่งเคลม',
};

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1',
  SECOND_HAND: 'มือ 2',
  LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'ปรับสภาพ',
  DEFECTIVE: 'ชำรุด',
};

export function SerialsModal({ variantId, productName, sku, onClose }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<SerializedStatus | ''>('');
  const [editing, setEditing] = useState<SerializedItemResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['serials', variantId, statusFilter],
    queryFn: () => inventoryApi.getSerials(variantId, {
      status: statusFilter || undefined, size: 100,
    }),
  });

  const sendService = useMutation({
    mutationFn: ({ id, state, defect }: { id: string; state: ServiceState; defect: string }) =>
      inventoryApi.sendToService(id, { serviceState: state, defectNote: defect }),
    onSuccess: () => {
      toast.success('บันทึกสถานะบริการแล้ว');
      qc.invalidateQueries({ queryKey: ['serials', variantId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const backToStock = useMutation({
    mutationFn: (id: string) => inventoryApi.backToStock(id),
    onSuccess: () => {
      toast.success('คืนเครื่องเข้าสต็อกแล้ว');
      qc.invalidateQueries({ queryKey: ['serials', variantId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleService = (id: string, state: ServiceState) => {
    const defect = window.prompt(
      `${SERVICE_TH[state]} — กรอกอาการเสีย:`,
    );
    if (defect === null) return;
    sendService.mutate({ id, state, defect: defect.trim() });
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="font-semibold">เครื่องในรุ่นนี้ — {productName}</h2>
            <p className="font-mono text-xs text-slate-500">{sku}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b px-5 py-2">
          <select className="input w-56" value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as SerializedStatus | '')}>
            <option value="">ทุกสถานะ</option>
            <option value="IN_STOCK">พร้อมขาย</option>
            <option value="SOLD">ขายแล้ว</option>
            <option value="DEFECTIVE">ชำรุด/บริการ</option>
            <option value="RETURNED">คืน</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">IMEI / SN</th>
                <th className="px-4 py-2.5">สี / ความจุ</th>
                <th className="px-4 py-2.5">สภาพ</th>
                <th className="px-4 py-2.5">แบต</th>
                <th className="px-4 py-2.5">ที่มา</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5">รับเข้า</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs">{s.imei ?? '-'}</div>
                    <div className="font-mono text-xs text-slate-500">{s.serialNumber}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div>{s.deviceColor ?? '-'}</div>
                    {s.deviceStorage && <div className="text-xs text-slate-500">{s.deviceStorage}</div>}
                  </td>
                  <td className="px-4 py-2">{CONDITION_TH[s.condition] ?? s.condition}</td>
                  <td className="px-4 py-2">
                    {s.batteryHealth != null
                      ? <span className="inline-flex items-center gap-1">
                          <BatteryMedium className="h-3.5 w-3.5 text-slate-400" />{s.batteryHealth}%
                        </span>
                      : '-'}
                  </td>
                  <td className="px-4 py-2 text-xs">{acqLabel(s.acquisitionType)}</td>
                  <td className="px-4 py-2">
                    <span className={STATUS_BADGE[s.status]}>{STATUS_TH[s.status]}</span>
                    {s.serviceState && (
                      <div className="mt-0.5 text-xs text-red-600">{SERVICE_TH[s.serviceState]}</div>
                    )}
                    {s.defectNote && (
                      <div className="mt-0.5 text-xs text-slate-500" title={s.defectNote}>
                        🔧 {s.defectNote.length > 24 ? s.defectNote.slice(0, 24) + '…' : s.defectNote}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{formatDate(s.receivedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                              title="แก้ไขข้อมูลเครื่อง (IMEI/สี/แบต)"
                              onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      {s.status === 'IN_STOCK' && (
                        <>
                          <button className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                                  title="ส่งซ่อม"
                                  onClick={() => handleService(s.id, 'AWAITING_REPAIR')}>
                            <Wrench className="h-4 w-4" />
                          </button>
                          <button className="rounded p-1.5 text-red-700 hover:bg-red-50"
                                  title="ส่งเคลม"
                                  onClick={() => handleService(s.id, 'SENT_CLAIM')}>
                            <ShieldAlert className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {s.status === 'DEFECTIVE' && (
                        <button className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                                title="ซ่อม/เคลมเสร็จ — คืนเข้าสต็อก"
                                onClick={() => backToStock.mutate(s.id)}>
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">ไม่มีเครื่องในสถานะนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-5 py-2 text-xs text-slate-500">
          ✏️ แก้ไข · 🔧 ส่งซ่อม · 🛡️ ส่งเคลม · ↩️ คืนเข้าสต็อก (หลังซ่อม/เคลมเสร็จ)
        </div>
      </div>
    </div>

    {editing && (
      <EditSerialModal
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['serials', variantId] });
          qc.invalidateQueries({ queryKey: ['inventory'] });
        }}
      />
    )}
    </>
  );
}

/* ─── แก้ไขข้อมูลเครื่อง (typo correction) ──────────────────────────── */
const EDIT_CONDITIONS: SerializedCondition[] = ['NEW', 'SECOND_HAND', 'LIKE_NEW', 'REFURBISHED', 'DEFECTIVE'];

function EditSerialModal({ item, onClose, onSaved }: {
  item: SerializedItemResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [imei, setImei] = useState(item.imei ?? '');
  const [serialNumber, setSerialNumber] = useState(item.serialNumber);
  const [deviceColor, setDeviceColor] = useState(item.deviceColor ?? '');
  const [modelNumber, setModelNumber] = useState(item.modelNumber ?? '');
  const [deviceStorage, setDeviceStorage] = useState(item.deviceStorage ?? '');
  const [deviceNetwork, setDeviceNetwork] = useState(item.deviceNetwork ?? '');
  const [warrantyTerms, setWarrantyTerms] = useState(item.warrantyTerms ?? '');
  const [battery, setBattery] = useState(item.batteryHealth != null ? String(item.batteryHealth) : '');
  const [condition, setCondition] = useState<SerializedCondition>(
    (item.condition as SerializedCondition) ?? 'SECOND_HAND');

  const save = useMutation({
    mutationFn: () => inventoryApi.updateSerial(item.id, {
      imei: imei.trim() || undefined,
      serialNumber: serialNumber.trim(),
      deviceColor: deviceColor.trim() || undefined,
      modelNumber: modelNumber.trim() || undefined,
      deviceStorage: deviceStorage.trim() || undefined,
      deviceNetwork: deviceNetwork.trim() || undefined,
      warrantyTerms: warrantyTerms.trim() || undefined,
      batteryHealth: battery === '' ? undefined : Number(battery),
      condition,
    }),
    onSuccess: () => { toast.success('แก้ไขเครื่องแล้ว'); onSaved(); onClose(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialNumber.trim()) { toast.error('Serial ห้ามว่าง'); return; }
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">แก้ไขเครื่อง</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">IMEI</label>
            <input className="input font-mono" value={imei} onChange={(e) => setImei(e.target.value)}
                   placeholder="35xxxxxxxxxxxxx" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">Serial *</label>
            <input className="input font-mono" value={serialNumber}
                   onChange={(e) => setSerialNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">สี</label>
              <input className="input" value={deviceColor} onChange={(e) => setDeviceColor(e.target.value)}
                     placeholder="เช่น Black" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">แบต %</label>
              <input type="number" min={0} max={100} className="input" value={battery}
                     onChange={(e) => setBattery(e.target.value)} placeholder="0-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">ความจุ</label>
              <input className="input" value={deviceStorage}
                     onChange={(e) => setDeviceStorage(e.target.value)} placeholder="เช่น 256GB" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">เครือข่าย</label>
              <input className="input" value={deviceNetwork}
                     onChange={(e) => setDeviceNetwork(e.target.value)} placeholder="เช่น TH, DS" />
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">เลขรุ่น</label>
            <input className="input font-mono" value={modelNumber}
                   onChange={(e) => setModelNumber(e.target.value)} placeholder="เช่น MQ9Q3ZP/A" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">ประกัน</label>
            <input className="input" value={warrantyTerms}
                   onChange={(e) => setWarrantyTerms(e.target.value)} placeholder="เช่น ประกันศูนย์ 1 ปี (Apple)" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold text-slate-600">สภาพ</label>
            <select className="input" value={condition}
                    onChange={(e) => setCondition(e.target.value as SerializedCondition)}>
              {EDIT_CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_TH[c] ?? c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            <Save className="h-4 w-4" /> {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
