import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Wrench, ShieldAlert, Undo2, BatteryMedium, Pencil, Save, Plus, Trash2, ArrowLeftRight, QrCode, PackageOpen } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { posApi } from '@/api/pos';
import { productsApi } from '@/api/products';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { buildDeviceLabelTspl } from '@/lib/tspl/deviceLabel';
import { deviceProductUrl } from '@/lib/storefront';
import { formatDate, formatTHB } from '@/lib/format';
import { acqLabel, ACQ_ORDER, ACQ_INFO } from '@/lib/acquisition';
import { RepairIntakeModal } from '@/components/RepairIntakeModal';
import { ReturnDeviceModal } from '@/components/ReturnDeviceModal';
import { SecurityCodeModal } from '@/components/SecurityCodeModal';
import { ImageEditor } from '@/components/MultiImageUpload';
import type { SerializedStatus, ServiceState, SerializedItemResponse, SerializedCondition, AcquisitionType, DeviceServiceType, VariantResponse, SalesOrderResponse } from '@/types/api';

interface Props {
  variantId: string;
  productName: string;
  sku: string;
  onClose: () => void;
  /** ไฮไลต์เครื่องที่ค้นเจอ (เปิดจากผลค้นหา IMEI) */
  highlightId?: string;
  /** SKU อื่นของรุ่นเดียวกัน — ใช้เป็นปลายทาง "ย้าย SKU" (แก้ลงผิดมือ 1/2) */
  productVariants?: VariantResponse[];
}

const STATUS_BADGE: Record<SerializedStatus, string> = {
  IN_STOCK: 'badge-green',
  PENDING_INTAKE: 'badge-amber',
  RESERVED: 'badge-blue',
  SOLD: 'badge-slate',
  DEFECTIVE: 'badge-red',
  RETURNED: 'badge-amber',
  TRANSFERRED: 'badge-slate',
};

const STATUS_TH: Record<SerializedStatus, string> = {
  IN_STOCK: 'พร้อมขาย',
  PENDING_INTAKE: 'รอลงสต็อก',
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

export function SerialsModal({ variantId, productName, sku, onClose, highlightId, productVariants }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<SerializedStatus | ''>('');
  const [editing, setEditing] = useState<SerializedItemResponse | null>(null);
  const [repairFor, setRepairFor] = useState<SerializedItemResponse | null>(null);
  const [moveFor, setMoveFor] = useState<SerializedItemResponse | null>(null);
  // SKU อื่นของรุ่นเดียวกันที่ย้ายไปได้ (active + ไม่ใช่ตัวปัจจุบัน)
  const moveTargets = (productVariants ?? []).filter((v) => v.id !== variantId && v.active);
  // มือของ SKU ปัจจุบัน (FIX-115) — ใช้เตือนเมื่อแก้มือเครื่องแล้วไม่ตรงกับ SKU
  const variantCondition = (productVariants ?? []).find((v) => v.id === variantId)?.condition ?? null;

  // ปุ่มพิมพ์ป้ายสติกเกอร์แปะเครื่อง — เฉพาะ ADMIN (FIX-104)
  // FIX-149: ป้ายออกเครื่อง TSC TTP-247 (ภาษา TSPL) ผ่าน Local Bridge เท่านั้น —
  // ห้ามใช้ orchestrator fallback (WebUSB/คิว = Epson ESC/POS จะพิมพ์ TSPL เป็นขยะ)
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'));
  const printLabel = async (s: SerializedItemResponse) => {
    try {
      printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
      const bridge = printOrchestrator.getLocalBridge();
      if (!(await bridge.isReady())) {
        toast.error('พิมพ์ป้ายต้องต่อผ่าน Local Bridge (เครื่องที่เสียบ TSC TTP-247) — เปิด Bridge แล้วลองใหม่');
        return;
      }
      const bytes = buildDeviceLabelTspl(s, deviceProductUrl(s.id));
      await bridge.print(bytes, { billNo: s.stockCode ?? s.imei ?? s.id, target: 'label' });
      toast.success('พิมพ์ป้ายแล้ว (TSC)');
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

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

  // FIX-143: รับเครื่องคืน (ผ่อนไม่ไหว) จากหน้าเครื่องในคลัง — เครื่อง SOLD ที่มีบิลผ่อน
  const canReturn = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER', 'STAFF'));
  const [returnOrder, setReturnOrder] = useState<SalesOrderResponse | null>(null);
  const [pendingReturn, setPendingReturn] = useState<{ order: SalesOrderResponse; refundAmount: number; reason: string } | null>(null);
  const loadReturn = useMutation({
    mutationFn: (serialId: string) => posApi.findInstallmentBySerial(serialId),
    onSuccess: (order) => {
      if (!order) { toast.error('ไม่พบบิลผ่อนของเครื่องนี้ (อาจไม่ได้ขายแบบผ่อน)'); return; }
      setReturnOrder(order);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const returnDevice = useMutation({
    mutationFn: ({ id, refundAmount, reason, securityCode }:
                 { id: string; refundAmount: number; reason: string; securityCode: string }) =>
      posApi.returnDevice(id, refundAmount, securityCode, reason),
    onSuccess: (order) => {
      toast.success(`รับเครื่องคืนบิล ${order.billNo} สำเร็จ — เครื่องเข้าสต็อกแล้ว`);
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

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="serials-modal-title"
        className="flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl sm:max-h-[90vh]"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div className="min-w-0">
            <h2 id="serials-modal-title" className="truncate font-semibold">เครื่องในรุ่นนี้ — {productName}</h2>
            <p className="font-mono text-xs text-slate-500">{sku}</p>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 rounded p-1 hover:bg-slate-100" aria-label="ปิดหน้าต่างรายการเครื่อง">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b px-5 py-2">
          <select className="input w-56" value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as SerializedStatus | '')}>
            <option value="">ทุกสถานะ</option>
            <option value="IN_STOCK">พร้อมขาย</option>
            <option value="SOLD">ขายแล้ว</option>
            <option value="DEFECTIVE">ชำรุด/บริการ</option>
            <option value="RETURNED">คืน</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <colgroup>
              <col className="w-[190px]" />
              <col className="w-[160px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[130px]" />
              <col className="w-[120px]" />
              <col className="w-[190px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5">IMEI / SN</th>
                <th className="whitespace-nowrap px-4 py-2.5">สี / ความจุ</th>
                <th className="whitespace-nowrap px-4 py-2.5">สภาพ</th>
                <th className="whitespace-nowrap px-4 py-2.5">แบต</th>
                <th className="whitespace-nowrap px-4 py-2.5">ที่มา</th>
                <th className="whitespace-nowrap px-4 py-2.5">สถานะ</th>
                <th className="whitespace-nowrap px-4 py-2.5">รับเข้า</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((s) => (
                <tr key={s.id} className={s.id === highlightId ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : 'hover:bg-slate-50'}>
                  <td className="align-top px-4 py-2.5">
                    {s.stockCode && (
                      <div className="mb-0.5 inline-block rounded bg-brand-100 px-1.5 font-mono text-[11px] font-semibold text-brand-700">
                        {s.stockCode}
                      </div>
                    )}
                    <div className="font-mono text-xs">{s.imei ?? '-'}</div>
                    <div className="font-mono text-xs text-slate-500">{s.serialNumber}</div>
                  </td>
                  <td className="align-top px-4 py-2.5">
                    <div className="break-words">{s.deviceColor ?? '-'}</div>
                    {s.deviceStorage && <div className="text-xs text-slate-500">{s.deviceStorage}</div>}
                  </td>
                  <td className="whitespace-nowrap align-top px-4 py-2.5">{CONDITION_TH[s.condition] ?? s.condition}</td>
                  <td className="whitespace-nowrap align-top px-4 py-2.5">
                    {s.batteryHealth != null
                      ? <span className="inline-flex items-center gap-1">
                          <BatteryMedium className="h-3.5 w-3.5 text-slate-400" />{s.batteryHealth}%
                        </span>
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap align-top px-4 py-2.5 text-xs">{acqLabel(s.acquisitionType)}</td>
                  <td className="align-top px-4 py-2.5">
                    <span className={`${STATUS_BADGE[s.status]} whitespace-nowrap`}>{STATUS_TH[s.status]}</span>
                    {s.serviceState && (
                      <div className="mt-0.5 text-xs text-red-600">{SERVICE_TH[s.serviceState]}</div>
                    )}
                    {s.defectNote && (
                      <div className="mt-0.5 text-xs text-slate-500" title={s.defectNote}>
                        🔧 {s.defectNote.length > 24 ? s.defectNote.slice(0, 24) + '…' : s.defectNote}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap align-top px-4 py-2.5 text-xs text-slate-500">{formatDate(s.receivedAt)}</td>
                  <td className="align-top px-4 py-2.5">
                    <div className="flex min-w-[158px] flex-nowrap items-center justify-end gap-1">
                      <button className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                              title="แก้ไขข้อมูลเครื่อง (IMEI/สี/แบต)"
                              onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      {isAdmin && (
                        <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                                title="พิมพ์ป้าย QR แปะหลังเครื่อง (ลิงก์เว็บ + บาร์โค้ด)"
                                onClick={() => printLabel(s)}>
                          <QrCode className="h-4 w-4" />
                        </button>
                      )}
                      {s.status === 'IN_STOCK' && (
                        <>
                          {moveTargets.length > 0 && (
                            <button className="rounded p-1.5 text-indigo-700 hover:bg-indigo-50"
                                    title="ย้ายไป SKU อื่น (แก้ลงผิดมือ 1/มือ 2)"
                                    onClick={() => setMoveFor(s)}>
                              <ArrowLeftRight className="h-4 w-4" />
                            </button>
                          )}
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
                      {(s.status === 'DEFECTIVE' || s.status === 'RETURNED') && (
                        <button className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                                title={s.status === 'RETURNED'
                                  ? 'รับคืนจากลูกค้า ตรวจสภาพผ่าน — คืนเข้าสต็อก'
                                  : 'ซ่อม/เคลมเสร็จ — คืนเข้าสต็อก'}
                                onClick={() => backToStock.mutate(s.id)}>
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                      {s.status === 'SOLD' && canReturn && (
                        <button className="rounded p-1.5 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                                title="รับเครื่องคืน (ผ่อนไม่ไหว)"
                                disabled={loadReturn.isPending}
                                onClick={() => loadReturn.mutate(s.id)}>
                          <PackageOpen className="h-4 w-4" />
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

        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t px-5 py-2 text-xs text-slate-500">
          <span>✏️ แก้ไข</span>
          <span>🔧 ส่งซ่อม</span>
          <span>🛡️ ส่งเคลม</span>
          <span>↩️ คืนเข้าสต็อกหลังตรวจผ่าน</span>
          <span>📦 เครื่องขายแล้ว (ผ่อน) = รับเครื่องคืน · 🔧 เปิดใบรับซ่อมลูกค้า</span>
        </div>
      </div>
    </div>

    {editing && (
      <EditSerialModal
        item={editing}
        variantCondition={variantCondition}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['serials', variantId] });
          qc.invalidateQueries({ queryKey: ['inventory'] });
        }}
        // แก้มือเครื่องแล้วไม่ตรงมือ SKU → เปิด modal ย้าย SKU ต่อทันที (กัน "ผสม 1+2" ค้าง — FIX-115)
        onConditionMismatch={(updated) => {
          if (moveTargets.length > 0 && updated.status === 'IN_STOCK') setMoveFor(updated);
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

    {moveFor && (
      <MoveVariantModal
        item={moveFor}
        targets={moveTargets}
        onClose={() => setMoveFor(null)}
        onMoved={() => {
          setMoveFor(null);
          qc.invalidateQueries({ queryKey: ['serials', variantId] });
          qc.invalidateQueries({ queryKey: ['inventory'] });
          qc.invalidateQueries({ queryKey: ['product'] });
        }}
      />
    )}

    {/* FIX-143: รับเครื่องคืน (ผ่อนไม่ไหว) — flow เดียวกับหน้าประวัติบิล */}
    {returnOrder && (
      <ReturnDeviceModal
        order={returnOrder}
        loading={returnDevice.isPending}
        onClose={() => setReturnOrder(null)}
        onConfirm={(refundAmount, reason) => {
          setPendingReturn({ order: returnOrder, refundAmount, reason });
          setReturnOrder(null);
        }}
      />
    )}
    {pendingReturn && (
      <SecurityCodeModal
        action={`รับเครื่องคืนบิล ${pendingReturn.order.billNo}`}
        warning="เครื่องจะกลับเข้าสต็อกและยอดที่ชำระถูกปรับ — ย้อนกลับไม่ได้"
        pending={returnDevice.isPending}
        onClose={() => setPendingReturn(null)}
        onConfirm={(securityCode) => {
          returnDevice.mutate(
            { id: pendingReturn.order.id, refundAmount: pendingReturn.refundAmount, reason: pendingReturn.reason, securityCode },
            { onSuccess: () => setPendingReturn(null) },
          );
        }}
      />
    )}
    </>,
    document.body,
  );
}

/* ─── ย้ายเครื่องไป SKU อื่นของรุ่นเดียวกัน (แก้ลงผิดมือ 1/2) ─────────── */
function MoveVariantModal({ item, targets, onClose, onMoved }: {
  item: SerializedItemResponse;
  targets: VariantResponse[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [targetId, setTargetId] = useState('');
  const move = useMutation({
    mutationFn: () => inventoryApi.moveSerialToVariant(item.id, targetId),
    onSuccess: () => { toast.success('ย้าย SKU แล้ว'); onMoved(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // ย้ายไป "รุ่นอื่น" — แก้เพิ่มผิดรุ่น (FIX-120): backend จับ SKU ปลายทางตามมือ+สี+ความจุให้เอง
  const [prodSearch, setProdSearch] = useState('');
  const [targetProductId, setTargetProductId] = useState('');
  const { data: productList } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 0, size: 500 }),
    staleTime: 60_000,
  });
  const currentProductId = targets[0]?.productId;
  const productMatches = (prodSearch.trim().length >= 2 ? (productList?.content ?? []) : [])
    .filter((p) => p.active !== false && p.serialized && p.id !== currentProductId)
    .filter((p) => (p.name ?? '').toLowerCase().includes(prodSearch.trim().toLowerCase()))
    .slice(0, 6);
  const targetProduct = (productList?.content ?? []).find((p) => p.id === targetProductId) ?? null;
  const moveProduct = useMutation({
    mutationFn: () => inventoryApi.moveSerialToProduct(item.id, targetProductId),
    onSuccess: () => {
      toast.success(`ย้ายไปรุ่น "${targetProduct?.name ?? ''}" แล้ว — ระบบจับ SKU ตามมือ+สี+ความจุให้เรียบร้อย`);
      onMoved();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  // ปลายทางเรียง "มือตรงกับเครื่อง" ขึ้นก่อน + มือไม่ตรงกดไม่ได้ (backend กันอีกชั้นด้วย FIX-113)
  const itemGroup = item.condition === 'NEW' ? 'NEW' : 'SECOND_HAND';
  const handTh = (c?: 'NEW' | 'SECOND_HAND' | null) =>
    c === 'NEW' ? 'มือ 1' : c === 'SECOND_HAND' ? 'มือ 2' : 'ยังไม่ผูกมือ';
  const rank = (v: VariantResponse) => (v.condition === itemGroup ? 0 : v.condition == null ? 1 : 2);
  const sortedTargets = [...targets].sort((a, b) => rank(a) - rank(b));
  const mismatched = (v: VariantResponse) => v.condition != null && v.condition !== itemGroup;
  const label = (v: VariantResponse) =>
    `${v.sku} · ${[v.color, v.storage].filter(Boolean).join(' ') || '-'} · ${handTh(v.condition)}`
    + (mismatched(v) ? ' (มือไม่ตรง)' : '');

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">ย้ายเครื่องไป SKU อื่น</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            เครื่อง: <span className="font-mono">{item.imei || item.serialNumber}</span>
            {item.stockCode && <span className="ml-1 text-slate-400">({item.stockCode})</span>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">ย้ายไป SKU (รุ่นเดียวกัน)</label>
            <select className="input" value={targetId}
                    onChange={(e) => { setTargetId(e.target.value); if (e.target.value) setTargetProductId(''); }}>
              <option value="">— เลือก SKU ปลายทาง —</option>
              {sortedTargets.map((v) => (
                <option key={v.id} value={v.id} disabled={mismatched(v)}>{label(v)}</option>
              ))}
            </select>
          </div>

          {/* ย้ายไป "รุ่นอื่น" — เคสเพิ่มผิดรุ่น เช่น iPhone 13 หลุดไปอยู่ 13 Pro Max (FIX-120) */}
          <div className="border-t border-slate-200 pt-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              หรือย้ายไป "รุ่นอื่น" <span className="font-normal text-slate-400">(กรณีเพิ่มผิดรุ่น)</span>
            </label>
            <input className="input text-sm" placeholder="พิมพ์ค้นชื่อรุ่นปลายทาง เช่น iPhone 13"
                   value={prodSearch}
                   onChange={(e) => { setProdSearch(e.target.value); setTargetProductId(''); }} />
            {prodSearch.trim().length >= 2 && !targetProductId && (
              <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {productMatches.map((p) => (
                  <button key={p.id} type="button"
                          onClick={() => { setTargetProductId(p.id); setTargetId(''); }}
                          className="block w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-sm hover:border-brand-400 hover:bg-brand-50">
                    {p.name} <span className="text-xs text-slate-400">· {p.categoryName}</span>
                  </button>
                ))}
                {productMatches.length === 0 && (
                  <p className="px-1 text-xs text-slate-400">ไม่พบรุ่นที่ตรง</p>
                )}
              </div>
            )}
            {targetProduct && (
              <div className="mt-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
                ✅ ปลายทาง: <strong>{targetProduct.name}</strong> — ระบบจะจับ SKU ตาม
                <strong> มือ+สี+ความจุ</strong> ของเครื่อง ({item.deviceColor ?? '?'} / {item.deviceStorage ?? '?'})
                ให้อัตโนมัติ · ไม่มี SKU ตรง = สร้างใหม่ให้พร้อมประทับมือ
                <button type="button" onClick={() => { setTargetProductId(''); setProdSearch(''); }}
                        className="ml-2 text-emerald-700 underline">เปลี่ยน</button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            ระบบจะย้ายสต๊อกเครื่องนี้ + บันทึกประวัติ · ราคา/สภาพรายเครื่องคงเดิม (แก้เพิ่มได้ที่ ✏️)
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button type="button"
                  disabled={(!targetId && !targetProductId) || move.isPending || moveProduct.isPending}
                  onClick={() => (targetProductId ? moveProduct.mutate() : move.mutate())}
                  className="btn-primary">
            <ArrowLeftRight className="h-4 w-4" />
            {move.isPending || moveProduct.isPending ? 'กำลังย้าย...'
              : targetProductId ? 'ย้ายไปรุ่นนี้' : 'ย้าย'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── แก้ไขข้อมูลเครื่อง (typo correction) ──────────────────────────── */
const EDIT_CONDITIONS: SerializedCondition[] = ['NEW', 'SECOND_HAND', 'LIKE_NEW', 'REFURBISHED', 'DEFECTIVE'];

export function EditSerialModal({ item, variantCondition, onClose, onSaved, onConditionMismatch }: {
  item: SerializedItemResponse;
  /** มือของ SKU ที่เครื่องอยู่ (null = ยังไม่ผูกมือ) — ใช้เตือนตอนแก้มือเครื่องไม่ตรง SKU (FIX-115) */
  variantCondition?: 'NEW' | 'SECOND_HAND' | null;
  onClose: () => void;
  onSaved: () => void;
  onConditionMismatch?: (updated: SerializedItemResponse) => void;
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
  const [instTerms, setInstTerms] = useState<{ months: string; monthly: string; down: string }[]>(() => {
    try {
      const arr = item.installmentTerms ? JSON.parse(item.installmentTerms) : [];
      return Array.isArray(arr) && arr.length
        ? arr.map((t: { months?: number; monthly?: number; down?: number }) =>
            ({ months: String(t.months ?? ''), monthly: String(t.monthly ?? ''), down: t.down != null ? String(t.down) : '' }))
        : [];
    } catch { return []; }
  });
  const addTerm = () => setInstTerms((a) => [...a, { months: '', monthly: '', down: '' }]);
  const patchTerm = (i: number, patch: Partial<{ months: string; monthly: string; down: string }>) =>
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
          .map((t) => {
            const down = t.down.trim() === '' ? undefined : Number(t.down);
            return { months: Number(t.months), monthly: Number(t.monthly),
                     ...(down != null && Number.isFinite(down) && down >= 0 ? { down } : {}) };
          })
          .filter((t) => Number.isFinite(t.months) && t.months > 0 && Number.isFinite(t.monthly) && t.monthly >= 0);
        return clean.length ? JSON.stringify(clean) : null;
      })(),
      installmentPromo: instPromo.trim() || null,
    }),
    onSuccess: () => {
      toast.success('แก้ไขเครื่องแล้ว');
      onSaved();
      onClose();
      // มือของเครื่องหลังแก้ ไม่ตรงกับมือของ SKU → ชวนย้าย SKU ทันที (กันตกค้างเป็น "ผสม 1+2" — FIX-115)
      const group = condition === 'NEW' ? 'NEW' : 'SECOND_HAND';
      if (variantCondition && group !== variantCondition) {
        toast(`⚠️ เครื่องนี้ตอนนี้เป็น${group === 'NEW' ? 'มือ 1' : 'มือ 2'} แต่ SKU เป็น${variantCondition === 'NEW' ? 'มือ 1' : 'มือ 2'} — เลือก SKU ปลายทางเพื่อย้าย`,
              { duration: 6000 });
        onConditionMismatch?.({ ...item, condition });
      }
    },
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
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input type="number" min={1} className="input w-20" placeholder="งวด"
                           value={t.months} onChange={(e) => patchTerm(i, { months: e.target.value })} />
                    <span className="text-xs text-slate-500">เดือน ×</span>
                    <input type="number" min={0} className="input w-28" placeholder="บาท/เดือน"
                           value={t.monthly} onChange={(e) => patchTerm(i, { monthly: e.target.value })} />
                    <span className="text-xs text-slate-500">· ดาวน์</span>
                    <input type="number" min={0} className="input w-28" placeholder="เว้น=ค่าเริ่มต้น"
                           value={t.down} onChange={(e) => patchTerm(i, { down: e.target.value })}
                           title="เงินดาวน์เฉพาะงวดนี้ · เว้นว่าง = ใช้ดาวน์เริ่มต้นด้านบน" />
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
