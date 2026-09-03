import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { X, Smartphone, BatteryMedium, Wrench, ShieldCheck, History, PackageOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { inventoryApi } from '@/api/inventory';
import { repairApi } from '@/api/repair';
import { posApi } from '@/api/pos';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDate } from '@/lib/format';
import { formatInShopZone } from '@/lib/datetime';
import type { RefundMethod, RepairStatus, SalesOrderResponse } from '@/types/api';
import { ReturnDeviceModal } from '@/components/ReturnDeviceModal';
import { SecurityCodeModal } from '@/components/SecurityCodeModal';
import { useAuthStore } from '@/stores/authStore';

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1 (ใหม่)', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก',
  REFURBISHED: 'รีเฟอร์บิช', DEFECTIVE: 'มีตำหนิ',
};
const STATUS_TH: Record<string, { text: string; cls: string }> = {
  IN_STOCK:   { text: 'พร้อมขาย',   cls: 'bg-emerald-100 text-emerald-700' },
  PENDING_INTAKE: { text: 'รอลงสต็อก', cls: 'bg-amber-100 text-amber-700' },
  RESERVED:   { text: 'จองแล้ว',    cls: 'bg-amber-100 text-amber-700' },
  IN_TRANSIT: { text: 'กำลังโอน',   cls: 'bg-blue-100 text-blue-700' },
  SOLD:       { text: 'ขายแล้ว',    cls: 'bg-slate-200 text-slate-600' },
  DEFECTIVE:  { text: 'ส่งซ่อม/เคลม', cls: 'bg-red-100 text-red-700' },
  RETURNED:   { text: 'คืนสินค้า',  cls: 'bg-slate-200 text-slate-600' },
  TRANSFERRED:{ text: 'โอนออกแล้ว', cls: 'bg-slate-200 text-slate-600' },
};
const REPAIR_STATUS_TH: Record<RepairStatus, { text: string; cls: string }> = {
  RECEIVED:    { text: 'รับเครื่อง', cls: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { text: 'กำลังซ่อม', cls: 'bg-amber-100 text-amber-700' },
  DONE:        { text: 'ซ่อมเสร็จ', cls: 'bg-emerald-100 text-emerald-700' },
  PICKED_UP:   { text: 'รับคืนแล้ว', cls: 'bg-slate-200 text-slate-600' },
  CANCELLED:   { text: 'ยกเลิก',    cls: 'bg-red-100 text-red-700' },
};

export interface ScannedDeviceRef {
  serialItemId: string | null;
  imei: string | null;
  serialNumber: string | null;
  /** true = เครื่องนี้ยิงเข้าตะกร้าไม่ได้ (ขายแล้ว/ไม่พร้อมขาย) — โชว์รายละเอียดอย่างเดียว */
  lookupOnly?: boolean;
}

/**
 * การ์ดรายละเอียดเครื่องที่เพิ่งสแกนที่ POS (battery + ประวัติซ่อม/อะไหล่ + ใบรับซ่อม).
 * ต้นทุน/ค่าอะไหล่/เงินจ่ายช่าง = backend mask ให้ STAFF อยู่แล้ว (canSeeSensitive).
 */
export function DeviceScanDetailPanel({ device, onClose }: { device: ScannedDeviceRef; onClose: () => void }) {
  const lookupKey = device.imei || device.serialNumber || '';

  const detail = useQuery({
    queryKey: ['scan-detail', lookupKey],
    queryFn: () => inventoryApi.lookupSerial(lookupKey),
    enabled: !!lookupKey,
  });

  const logs = useQuery({
    queryKey: ['scan-service-logs', device.serialItemId],
    queryFn: () => inventoryApi.listServiceLogs(device.serialItemId!),
    enabled: !!device.serialItemId,
  });

  const repairs = useQuery({
    queryKey: ['scan-repairs', device.imei, device.serialNumber],
    queryFn: () => repairApi.listByDevice({
      imei: device.imei || undefined,
      serial: device.serialNumber || undefined,
    }),
    enabled: !!(device.imei || device.serialNumber),
  });

  const d = detail.data;
  const spec = d ? [d.deviceColor, d.deviceStorage].filter(Boolean).join(' / ') : '';
  const st = d ? STATUS_TH[d.status] : null;

  // FIX-143: "รับเครื่องคืน (ผ่อนไม่ไหว)" จากหน้า device — หาบิลผ่อนของเครื่อง (เฉพาะเครื่องที่ SOLD)
  const qc = useQueryClient();
  const canReturn = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER', 'STAFF'));
  const serialId = d?.id ?? device.serialItemId ?? null;
  const instOrder = useQuery({
    queryKey: ['device-installment-order', serialId],
    queryFn: () => posApi.findInstallmentBySerial(serialId!),
    enabled: !!serialId && d?.status === 'SOLD',
  });
  const [returnOrder, setReturnOrder] = useState<SalesOrderResponse | null>(null);
  const [pendingReturn, setPendingReturn] = useState<{ order: SalesOrderResponse; refundAmount: number; reason: string; refundMethod: RefundMethod } | null>(null);
  const returnDevice = useMutation({
    mutationFn: ({ id, refundAmount, reason, securityCode, refundMethod }:
                 { id: string; refundAmount: number; reason: string; securityCode: string; refundMethod: RefundMethod }) =>
      posApi.returnDevice(id, refundAmount, securityCode, reason, refundMethod),
    onSuccess: (order) => {
      toast.success(`รับเครื่องคืนบิล ${order.billNo} สำเร็จ — เครื่องเข้าสต็อกแล้ว`);
      qc.invalidateQueries({ queryKey: ['scan-detail'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['device-installment-order'] });
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="rounded-lg border border-brand-200 bg-white shadow-sm">
      {/* header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-brand-50/60 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <Smartphone className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="truncate">{d?.productName ?? d?.sku ?? (detail.isLoading ? 'กำลังโหลด…' : 'รายละเอียดเครื่อง')}</span>
            {device.lookupOnly && (
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">ดูอย่างเดียว</span>
            )}
          </div>
          {spec && <div className="text-xs text-slate-600">{spec}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {st && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>}
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="ปิด">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {detail.isError ? (
        <div className="px-4 py-3 text-sm text-slate-500">ไม่พบรายละเอียดเครื่องนี้ในระบบ</div>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {/* ── ข้อมูลเครื่อง ── */}
          <div className="space-y-1.5 text-sm md:col-span-1">
            {d?.batteryHealth != null && (
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <BatteryMedium className="h-4 w-4 text-emerald-600" /> แบตเตอรี่ {d.batteryHealth}%
              </div>
            )}
            <Fact label="สภาพ" value={d ? (CONDITION_TH[d.condition] ?? d.condition) : '—'} />
            {d?.modelNumber && <Fact label="เลขรุ่น" value={d.modelNumber} mono />}
            <Fact label="IMEI" value={d?.imei ?? device.imei ?? '-'} mono />
            <Fact label="Serial" value={d?.serialNumber ?? device.serialNumber ?? '-'} mono />
            {d?.stockCode && <Fact label="รหัสสินค้า" value={d.stockCode} mono />}
            {d?.branchName && <Fact label="สาขา" value={d.branchName} />}
            {d?.warrantyTerms && (
              <div className="flex items-start gap-1.5 text-xs text-slate-600">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                <span>{d.warrantyTerms}{d.warrantyExpire ? ` · ถึง ${formatInShopZone(d.warrantyExpire, { year: 'numeric', month: '2-digit', day: '2-digit' })}` : ''}</span>
              </div>
            )}
            {/* ต้นทุน (FIX-107) — head/ADMIN เห็นตัวเลขจริง · STAFF เห็นรหัสต้นทุน (backend mask ให้) */}
            {(d?.purchasePrice != null || d?.purchasePriceCode) && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">ราคาทุน</span>
                <span className="text-right font-semibold text-amber-700">
                  {d.purchasePrice != null ? formatTHB(d.purchasePrice) : d.purchasePriceCode}
                </span>
              </div>
            )}
            {d?.refurbCost != null && d.refurbCost > 0 && d.totalCost != null && (
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-slate-400">ต้นทุนรวม (+ค่าซ่อม {formatTHB(d.refurbCost)})</span>
                <span className="text-right font-medium text-amber-600">{formatTHB(d.totalCost)}</span>
              </div>
            )}
            {d?.sellingPrice != null && (
              <div className="flex items-end justify-between gap-3 pt-1">
                <span className="text-xs text-slate-500">ราคาขาย</span>
                <div className="text-right">
                  <div className="text-base font-bold text-emerald-700">{formatTHB(d.sellingPrice)}</div>
                  {/* กำไรขั้นต้น = ราคาขาย − ต้นทุนรวม (เห็นเฉพาะคนที่เห็นทุน) */}
                  {(d.totalCost ?? d.purchasePrice) != null && (
                    <div className="text-[11px] text-slate-500">
                      กำไร {formatTHB(d.sellingPrice - (d.totalCost ?? d.purchasePrice ?? 0))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── ประวัติซ่อม/อะไหล่ (device_service_logs) ── */}
          <div className="md:col-span-1">
            <SectionTitle icon={<Wrench className="h-3.5 w-3.5" />} text="ซ่อม / เปลี่ยนอะไหล่" />
            {logs.isLoading ? <Muted text="กำลังโหลด…" />
              : (logs.data?.length ?? 0) === 0 ? <Muted text="— ไม่มีประวัติ" />
              : (
                <ul className="space-y-1.5">
                  {logs.data!.map((l) => (
                    <li key={l.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                          l.type === 'SELF' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {l.type === 'SELF' ? 'เปลี่ยนอะไหล่' : 'ส่งช่างนอก'}
                        </span>
                        <span className="font-semibold text-slate-600">
                          {l.cost != null ? formatTHB(l.cost) : (l.costCode ?? '')}
                        </span>
                      </div>
                      <div className="mt-0.5 font-medium text-slate-700">{l.detail}</div>
                      <div className="text-[11px] text-slate-400">
                        {formatDate(l.servicedAt)}{l.vendorName ? ` · ${l.vendorName}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          {/* ── ใบรับซ่อมของเครื่องนี้ (repair_tickets) ── */}
          <div className="md:col-span-1">
            <SectionTitle icon={<History className="h-3.5 w-3.5" />} text="ใบรับซ่อมของเครื่องนี้" />
            {repairs.isLoading ? <Muted text="กำลังโหลด…" />
              : (repairs.data?.length ?? 0) === 0 ? <Muted text="— ยังไม่เคยเปิดใบซ่อม" />
              : (
                <ul className="space-y-1.5">
                  {repairs.data!.map((t) => {
                    const rs = REPAIR_STATUS_TH[t.status];
                    return (
                      <li key={t.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-slate-600">{t.ticketNo}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${rs.cls}`}>{rs.text}</span>
                        </div>
                        <div className="mt-0.5 text-slate-700"><Wrench className="inline h-4 w-4 align-[-2px]" /> {t.reportedSymptom}</div>
                        {t.workDescription && <div className="text-[11px] text-slate-500">{t.workDescription}</div>}
                        <div className="text-[11px] text-slate-400">
                          {formatDate(t.receivedAt)} · ค่าซ่อม {formatTHB(t.repairCost)}
                          {t.outsourced && t.technicianName ? ` · ช่าง ${t.technicianName}` : ''}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>
      )}

      {/* FIX-143: รับเครื่องคืน (ผ่อนไม่ไหว) — โชว์เมื่อเครื่องขายแล้วและมีบิลผ่อน (ทำงานเหมือนหน้าประวัติบิล) */}
      {canReturn && instOrder.data && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <button
            onClick={() => setReturnOrder(instOrder.data!)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
            <PackageOpen className="h-4 w-4" /> รับเครื่องคืน (ผ่อนไม่ไหว) — บิล {instOrder.data.billNo}
          </button>
        </div>
      )}

      {returnOrder && (
        <ReturnDeviceModal
          order={returnOrder}
          loading={returnDevice.isPending}
          onClose={() => setReturnOrder(null)}
          onConfirm={(refundAmount, reason, refundMethod) => {
            setPendingReturn({ order: returnOrder, refundAmount, reason, refundMethod });
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
              { id: pendingReturn.order.id, refundAmount: pendingReturn.refundAmount, reason: pendingReturn.reason, securityCode,
                refundMethod: pendingReturn.refundMethod },
              { onSuccess: () => setPendingReturn(null) },
            );
          }}
        />
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
      {icon} {text}
    </div>
  );
}
function Muted({ text }: { text: string }) {
  return <p className="text-xs text-slate-400">{text}</p>;
}
