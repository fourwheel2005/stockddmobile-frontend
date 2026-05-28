import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Wrench, ShieldAlert, Undo2, Search, BatteryMedium } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatDate } from '@/lib/format';
import type { SerializedItemResponse, SerializedStatus, ServiceState } from '@/types/api';

interface Props {
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

/**
 * ช่องส่งซ่อม/เคลมแบบเร็วในหน้า POS:
 * สแกน/พิมพ์ IMEI หรือ Serial → ค้นเครื่อง → ส่งซ่อม / ส่งเคลม / คืนเข้าสต็อก
 * ใช้ flow เดิม (sendToService / backToStock) เหมือนหน้า Inventory
 */
export function RepairServiceModal({ onClose }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [item, setItem] = useState<SerializedItemResponse | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const lookup = useMutation({
    mutationFn: (q: string) => inventoryApi.lookupSerial(q),
    onSuccess: (data) => setItem(data),
    onError: (e) => { setItem(null); toast.error(extractErrorMessage(e)); },
  });

  const invalidate = (variantId: string) => {
    qc.invalidateQueries({ queryKey: ['serials', variantId] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const sendService = useMutation({
    mutationFn: ({ id, state, defect }: { id: string; state: ServiceState; defect: string }) =>
      inventoryApi.sendToService(id, { serviceState: state, defectNote: defect }),
    onSuccess: (data) => {
      toast.success('บันทึกสถานะบริการแล้ว');
      setItem(data);
      invalidate(data.variantId);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const backToStock = useMutation({
    mutationFn: (id: string) => inventoryApi.backToStock(id),
    onSuccess: (data) => {
      toast.success('คืนเครื่องเข้าสต็อกแล้ว');
      setItem(data);
      invalidate(data.variantId);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    lookup.mutate(query.trim());
  };

  const handleService = (id: string, state: ServiceState) => {
    const defect = window.prompt(`${SERVICE_TH[state]} — กรอกอาการเสีย:`);
    if (defect === null) return;
    sendService.mutate({ id, state, defect: defect.trim() });
  };

  const busy = sendService.isPending || backToStock.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wrench className="h-5 w-5 text-amber-600" /> ส่งซ่อม / เคลม เครื่อง
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Search */}
          <form onSubmit={handleSearch}>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              สแกน / พิมพ์ IMEI หรือ Serial
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                className="input flex-1"
                placeholder="ยิงสแกนเนอร์ หรือพิมพ์เลขที่นี่..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={lookup.isPending}>
                <Search className="h-4 w-4" /> ค้นหา
              </button>
            </div>
          </form>

          {/* Result */}
          {item && (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm">{item.imei ?? item.serialNumber}</div>
                  <div className="font-mono text-xs text-slate-500">{item.sku}</div>
                </div>
                <div className="text-right">
                  <span className={STATUS_BADGE[item.status]}>{STATUS_TH[item.status]}</span>
                  {item.serviceState && (
                    <div className="mt-0.5 text-xs text-red-600">{SERVICE_TH[item.serviceState]}</div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>
                  <div className="text-slate-400">สภาพ</div>
                  <div>{CONDITION_TH[item.condition] ?? item.condition}</div>
                </div>
                <div>
                  <div className="text-slate-400">แบต</div>
                  <div>
                    {item.batteryHealth != null
                      ? <span className="inline-flex items-center gap-1">
                          <BatteryMedium className="h-3.5 w-3.5 text-slate-400" />{item.batteryHealth}%
                        </span>
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">รับเข้า</div>
                  <div>{formatDate(item.receivedAt)}</div>
                </div>
              </div>

              {item.defectNote && (
                <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  🔧 อาการ: {item.defectNote}
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                {item.status === 'IN_STOCK' && (
                  <>
                    <button
                      className="btn-secondary flex-1 text-amber-700"
                      disabled={busy}
                      onClick={() => handleService(item.id, 'AWAITING_REPAIR')}>
                      <Wrench className="h-4 w-4" /> ส่งซ่อม
                    </button>
                    <button
                      className="btn-secondary flex-1 text-red-700"
                      disabled={busy}
                      onClick={() => handleService(item.id, 'SENT_CLAIM')}>
                      <ShieldAlert className="h-4 w-4" /> ส่งเคลม
                    </button>
                  </>
                )}
                {item.status === 'DEFECTIVE' && (
                  <button
                    className="btn-secondary flex-1 text-emerald-700"
                    disabled={busy}
                    onClick={() => backToStock.mutate(item.id)}>
                    <Undo2 className="h-4 w-4" /> ซ่อม/เคลมเสร็จ — คืนเข้าสต็อก
                  </button>
                )}
                {item.status !== 'IN_STOCK' && item.status !== 'DEFECTIVE' && (
                  <div className="flex-1 rounded bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                    เครื่องสถานะ “{STATUS_TH[item.status]}” ไม่สามารถส่งซ่อม/เคลมได้
                  </div>
                )}
              </div>
            </div>
          )}

          {!item && !lookup.isPending && (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              สแกนหรือพิมพ์ IMEI/Serial เพื่อค้นหาเครื่องที่ต้องการส่งซ่อม/เคลม
            </div>
          )}
        </div>

        <div className="border-t px-5 py-2 text-xs text-slate-500">
          🔧 ส่งซ่อม · 🛡️ ส่งเคลม · ↩️ คืนเข้าสต็อก (หลังซ่อม/เคลมเสร็จ)
        </div>
      </div>
    </div>
  );
}
