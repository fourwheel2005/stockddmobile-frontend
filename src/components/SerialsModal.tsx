import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Wrench, ShieldAlert, Undo2, BatteryMedium, Pencil, Save, Plus, Trash2 } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatDate, formatTHB } from '@/lib/format';
import { acqLabel, ACQ_ORDER, ACQ_INFO } from '@/lib/acquisition';
import { RepairIntakeModal } from '@/components/RepairIntakeModal';
import { ImageEditor } from '@/components/MultiImageUpload';
import type { SerializedStatus, ServiceState, SerializedItemResponse, SerializedCondition, AcquisitionType, DeviceServiceType } from '@/types/api';

interface Props {
  variantId: string;
  productName: string;
  sku: string;
  onClose: () => void;
  /** ไฮไลต์เครื่องที่ค้นเจอ (เปิดจากผลค้นหา IMEI) */
  highlightId?: string;
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

export function SerialsModal({ variantId, productName, sku, onClose, highlightId }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<SerializedStatus | ''>('');
  const [editing, setEditing] = useState<SerializedItemResponse | null>(null);
  const [repairFor, setRepairFor] = useState<SerializedItemResponse | null>(null);

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
                <tr key={s.id} className={s.id === highlightId ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-2">
                    {s.stockCode && (
                      <div className="mb-0.5 inline-block rounded bg-brand-100 px-1.5 font-mono text-[11px] font-semibold text-brand-700">
                        {s.stockCode}
                      </div>
                    )}
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
                      {s.status === 'SOLD' && (
                        <button className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                                title="ลูกค้าส่งเครื่องกลับมาซ่อม (เปิดใบรับซ่อม)"
                                onClick={() => setRepairFor(s)}>
                          <Wrench className="h-4 w-4" />
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
          ✏️ แก้ไข · 🔧 ส่งซ่อม · 🛡️ ส่งเคลม · ↩️ คืนเข้าสต็อก (หลังซ่อม/เคลมเสร็จ) · 🔧 เครื่องขายแล้ว = เปิดใบรับซ่อมลูกค้า
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

    {/* เครื่องที่ขายแล้วกลับมาซ่อม → เปิดใบรับซ่อม (prefill ข้อมูลเครื่อง) */}
    {repairFor && (
      <RepairIntakeModal
        onClose={() => setRepairFor(null)}
        onCreated={() => setRepairFor(null)}
        initial={{
          deviceBrand: 'Apple',
          deviceModel: repairFor.productName ?? productName ?? '',
          deviceColor: repairFor.deviceColor ?? '',
          imei: repairFor.imei ?? '',
          serialNumber: repairFor.serialNumber ?? '',
          reportedSymptom: '',
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
  const [imei2, setImei2] = useState(item.imei2 ?? '');
  const [serialNumber, setSerialNumber] = useState(item.serialNumber);
  const [deviceColor, setDeviceColor] = useState(item.deviceColor ?? '');
  const [modelNumber, setModelNumber] = useState(item.modelNumber ?? '');
  const [deviceStorage, setDeviceStorage] = useState(item.deviceStorage ?? '');
  const [deviceNetwork, setDeviceNetwork] = useState(item.deviceNetwork ?? '');
  const [warrantyTerms, setWarrantyTerms] = useState(item.warrantyTerms ?? '');
  const [warrantyExpire, setWarrantyExpire] = useState(item.warrantyExpire ? item.warrantyExpire.slice(0, 10) : '');
  const [battery, setBattery] = useState(item.batteryHealth != null ? String(item.batteryHealth) : '');
  const [condition, setCondition] = useState<SerializedCondition>(
    (item.condition as SerializedCondition) ?? 'SECOND_HAND');
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>(
    (item.acquisitionType as AcquisitionType) ?? 'PURCHASE');
  const [sourceCustomer, setSourceCustomer] = useState(item.sourceCustomer ?? '');
  const [purchasePrice, setPurchasePrice] = useState(item.purchasePrice != null ? String(item.purchasePrice) : '');
  const [sellingPrice, setSellingPrice] = useState(item.sellingPrice != null ? String(item.sellingPrice) : '');
  const [imageUrls, setImageUrls] = useState<string[]>(item.imageUrls ?? []);
  // ผ่อนดาวน์ มือ 2 (รายเครื่อง) — กรอกที่นี่ เว็บหน้าร้านดึงไปแสดง
  const [downPayment, setDownPayment] = useState(item.downPayment != null ? String(item.downPayment) : '');
  const [instPromo, setInstPromo] = useState(item.installmentPromo ?? '');
  const [instTerms, setInstTerms] = useState<{ months: string; monthly: string }[]>(() => {
    try {
      const arr = item.installmentTerms ? JSON.parse(item.installmentTerms) : [];
      return Array.isArray(arr) && arr.length
        ? arr.map((t: { months?: number; monthly?: number }) => ({ months: String(t.months ?? ''), monthly: String(t.monthly ?? '') }))
        : [];
    } catch { return []; }
  });
  const addTerm = () => setInstTerms((a) => [...a, { months: '', monthly: '' }]);
  const patchTerm = (i: number, patch: Partial<{ months: string; monthly: string }>) =>
    setInstTerms((a) => a.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const removeTerm = (i: number) => setInstTerms((a) => a.filter((_, j) => j !== i));

  // STAFF ไม่มีสิทธิ์เห็นต้นทุน (purchasePrice = null แต่มี purchasePriceCode) → ซ่อนช่องราคาทุน กันบันทึกทับเป็น 0
  const canSeeCost = item.purchasePrice != null || item.purchasePriceCode == null;

  const save = useMutation({
    mutationFn: () => inventoryApi.updateSerial(item.id, {
      imei: imei.trim() || undefined,
      imei2: imei2.trim() || undefined,
      serialNumber: serialNumber.trim(),
      deviceColor: deviceColor.trim() || undefined,
      modelNumber: modelNumber.trim() || undefined,
      deviceStorage: deviceStorage.trim() || undefined,
      deviceNetwork: deviceNetwork.trim() || undefined,
      warrantyTerms: warrantyTerms.trim() || undefined,
      warrantyExpire: warrantyExpire || undefined,
      batteryHealth: battery === '' ? undefined : Number(battery),
      condition,
      acquisitionType,
      // ส่งชื่อลูกค้าเฉพาะ RETURN_CREDIT · เคสอื่นล้างเป็นค่าว่าง
      sourceCustomer: acquisitionType === 'RETURN_CREDIT' ? (sourceCustomer.trim() || '') : '',
      purchasePrice: !canSeeCost || purchasePrice === '' ? undefined : Number(purchasePrice),
      sellingPrice: sellingPrice === '' ? undefined : Number(sellingPrice),
      imageUrls,   // แทนที่รูปทั้งชุด (รูปแรก = ปก)
      // ตารางผ่อน มือ 2 (installmentProvided = ให้ backend เซ็ต/ล้างตามที่ส่งมา)
      installmentProvided: true,
      downPayment: downPayment.trim() === '' ? null : Number(downPayment),
      installmentTerms: (() => {
        const clean = instTerms
          .map((t) => ({ months: Number(t.months), monthly: Number(t.monthly) }))
          .filter((t) => Number.isFinite(t.months) && t.months > 0 && Number.isFinite(t.monthly) && t.monthly >= 0);
        return clean.length ? JSON.stringify(clean) : null;
      })(),
      installmentPromo: instPromo.trim() || null,
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
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">แก้ไขเครื่อง</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">IMEI</label>
              <input className="input font-mono" value={imei} onChange={(e) => setImei(e.target.value)}
                     placeholder="35xxxxxxxxxxxxx" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">IMEI 2 <span className="font-normal text-slate-400">(dual-sim)</span></label>
              <input className="input font-mono" value={imei2} onChange={(e) => setImei2(e.target.value)}
                     placeholder="ถ้ามี" />
            </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">ประกัน</label>
              <input className="input" value={warrantyTerms}
                     onChange={(e) => setWarrantyTerms(e.target.value)} placeholder="เช่น ประกันศูนย์ 1 ปี" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">วันหมดประกัน</label>
              <input type="date" className="input" value={warrantyExpire}
                     onChange={(e) => setWarrantyExpire(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">สภาพ</label>
              <select className="input" value={condition}
                      onChange={(e) => setCondition(e.target.value as SerializedCondition)}>
                {EDIT_CONDITIONS.map((c) => (
                  <option key={c} value={c}>{CONDITION_TH[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">แหล่งที่มา</label>
              <select className="input" value={acquisitionType}
                      onChange={(e) => setAcquisitionType(e.target.value as AcquisitionType)}>
                {ACQ_ORDER.map((a) => (
                  <option key={a} value={a}>{ACQ_INFO[a]?.th ?? a}</option>
                ))}
              </select>
            </div>
          </div>
          {acquisitionType === 'RETURN_CREDIT' && (
            <div>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">ชื่อลูกค้าที่คืนเครื่อง</label>
              <input className="input" value={sourceCustomer}
                     onChange={(e) => setSourceCustomer(e.target.value)}
                     placeholder="เช่น คุณสมชาย (เครื่องคืน มีเครดิต)" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {canSeeCost && (
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">ราคาทุน (บาท)</label>
                <input type="number" min={0} className="input" value={purchasePrice}
                       onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0" />
              </div>
            )}
            <div className={canSeeCost ? '' : 'col-span-2'}>
              <label className="mb-0.5 block text-xs font-semibold text-slate-600">ราคาขาย (บาท)</label>
              <input type="number" min={0} className="input" value={sellingPrice}
                     onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              รูปเครื่องนี้ <span className="font-normal text-slate-400">(เพิ่ม/ลบ/ตั้งปกได้)</span>
            </label>
            <ImageEditor value={imageUrls} onChange={setImageUrls} />
          </div>

          {/* ตารางผ่อน มือ 2 (รายเครื่อง) — กรอกที่นี่ เว็บหน้าร้านดึงไปแสดง */}
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              💳 ผ่อนเครื่องนี้ (มือ 2) <span className="text-xs font-normal text-amber-700">— โชว์บนเว็บ · เว้นว่าง = ไม่ผ่อน</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">เงินดาวน์ (บาท)</label>
                <input type="number" min={0} className="input" value={downPayment}
                       onChange={(e) => setDownPayment(e.target.value)} placeholder="เช่น 3900" />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-semibold text-slate-600">โปรโมชัน (ถ้ามี)</label>
                <input className="input" value={instPromo}
                       onChange={(e) => setInstPromo(e.target.value)} placeholder="เช่น ฟรีเคส" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">ค่างวด (เพิ่มได้หลายช่วง)</label>
              <div className="space-y-2">
                {instTerms.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" min={1} className="input w-24" placeholder="งวด"
                           value={t.months} onChange={(e) => patchTerm(i, { months: e.target.value })} />
                    <span className="text-xs text-slate-500">เดือน ×</span>
                    <input type="number" min={0} className="input w-32" placeholder="บาท/เดือน"
                           value={t.monthly} onChange={(e) => patchTerm(i, { monthly: e.target.value })} />
                    <button type="button" className="rounded p-1 text-red-500 hover:bg-red-50"
                            onClick={() => removeTerm(i)} title="ลบช่วงนี้">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addTerm}
                        className="text-sm font-medium text-amber-700 hover:text-amber-900">+ เพิ่มงวด</button>
              </div>
            </div>
          </div>

          {/* ประวัติซ่อม/อะไหล่ (เครื่องมือสอง) — ค่าซ่อมรวมเข้าต้นทุน */}
          <DeviceServiceLogSection serialItemId={item.id} canSeeCost={canSeeCost} />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            <Save className="h-4 w-4" /> {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── ประวัติซ่อม/อะไหล่รายเครื่อง (เครื่องมือสอง) ──────────────────────
   ทุกครั้งที่เพิ่ม/ลบ → backend sync refurbCost = ผลรวมค่าซ่อม → ต้นทุนรวมอัปเดตเอง */
function DeviceServiceLogSection({ serialItemId, canSeeCost }: { serialItemId: string; canSeeCost: boolean }) {
  const qc = useQueryClient();
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['device-service-logs', serialItemId],
    queryFn: () => inventoryApi.listServiceLogs(serialItemId),
  });

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DeviceServiceType>('SELF');
  const [detail, setDetail] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [cost, setCost] = useState('');
  const [servicedAt, setServicedAt] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['device-service-logs', serialItemId] });
    qc.invalidateQueries({ queryKey: ['serials'] });          // อัปเดตต้นทุนรวมในตาราง
    qc.invalidateQueries({ queryKey: ['inventory-serials'] });
  };

  const add = useMutation({
    mutationFn: () => inventoryApi.addServiceLog(serialItemId, {
      type,
      detail: detail.trim(),
      vendorName: type === 'OUTSOURCED' ? (vendorName.trim() || undefined) : undefined,
      cost: Number(cost) || 0,
      servicedAt: servicedAt || undefined,
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('เพิ่มประวัติซ่อมแล้ว');
      setDetail(''); setVendorName(''); setCost(''); setNote(''); setServicedAt(''); setOpen(false);
      refresh();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteServiceLog(id),
    onSuccess: () => { toast.success('ลบรายการแล้ว'); refresh(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const submit = () => {
    if (!detail.trim()) { toast.error(type === 'SELF' ? 'กรอกชื่ออะไหล่' : 'กรอกอาการ'); return; }
    if (cost === '' || Number(cost) < 0) { toast.error('กรอกราคาให้ถูกต้อง'); return; }
    add.mutate();
  };

  const total = logs.reduce((s, l) => s + (l.cost ?? 0), 0);
  const hasCost = logs.every((l) => l.cost != null);   // true = เห็นราคาจริง (ADMIN/MANAGER)

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-800">
          🔧 ประวัติซ่อม/อะไหล่ (เครื่องมือสอง)
          {canSeeCost && hasCost && total > 0 && (
            <span className="ml-1 font-normal text-indigo-600">· ค่าซ่อมรวม {formatTHB(total)} (บวกเข้าต้นทุน)</span>
          )}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-white px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-50">
          <Plus className="h-3 w-3" /> เพิ่มรายการ
        </button>
      </div>

      {open && (
        <div className="mb-2 space-y-2 rounded border border-indigo-200 bg-white p-2">
          <div className="flex gap-1.5">
            {(['SELF', 'OUTSOURCED'] as DeviceServiceType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                      className={`flex-1 rounded border px-2 py-1 text-xs ${type === t
                        ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
                        : 'border-slate-200 text-slate-600'}`}>
                {t === 'SELF' ? 'ซ่อมเอง (เปลี่ยนอะไหล่)' : 'ส่งช่างนอก'}
              </button>
            ))}
          </div>
          <input className="input text-sm" value={detail} onChange={(e) => setDetail(e.target.value)}
                 placeholder={type === 'SELF' ? 'อะไหล่ที่เปลี่ยน เช่น จอ, แบต, ก้นชาร์จ' : 'อาการที่ส่งซ่อม เช่น เปิดไม่ติด'} />
          {type === 'OUTSOURCED' && (
            <input className="input text-sm" value={vendorName} onChange={(e) => setVendorName(e.target.value)}
                   placeholder="ชื่อช่าง/ร้าน" />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} className="input text-sm" value={cost}
                   onChange={(e) => setCost(e.target.value)} placeholder="ราคา (บาท)" />
            <input type="date" className="input text-sm" value={servicedAt}
                   onChange={(e) => setServicedAt(e.target.value)} title="วันที่ซ่อม (ว่าง = วันนี้)" />
          </div>
          <input className="input text-sm" value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="โน้ตเพิ่มเติม (ถ้ามี)" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-3 py-1 text-xs">ยกเลิก</button>
            <button type="button" onClick={submit} disabled={add.isPending}
                    className="btn-primary px-3 py-1 text-xs">
              {add.isPending ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-400">กำลังโหลด...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-slate-400">ยังไม่มีประวัติซ่อม/เปลี่ยนอะไหล่</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                  l.type === 'SELF' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {l.type === 'SELF' ? 'ซ่อมเอง' : 'ส่งช่าง'}
                </span>
                <span className="font-medium text-slate-700">{l.detail}</span>
                {l.vendorName && <span className="text-slate-500"> · {l.vendorName}</span>}
                <div className="text-[11px] text-slate-400">
                  {formatDate(l.servicedAt)}{l.note ? ` · ${l.note}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="font-semibold text-slate-700">
                  {l.cost != null ? formatTHB(l.cost) : l.costCode ?? '-'}
                </span>
                <button type="button" onClick={() => del.mutate(l.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50" title="ลบรายการนี้">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
