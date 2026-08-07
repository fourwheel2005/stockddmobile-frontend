import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PackageOpen, Pencil, ArrowDownToLine, ImageOff, BatteryMedium } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { EditSerialModal } from '@/components/SerialsModal';
import type { SerializedItemResponse } from '@/types/api';
import { extractErrorMessage } from '@/api/client';
import { formatTHB, formatDateTime } from '@/lib/format';

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก', REFURBISHED: 'ปรับสภาพ', DEFECTIVE: 'ชำรุด',
};

/**
 * รอลงสต็อก (FIX-142) — เครื่องที่ตีเทิร์นเข้ามาจะพักที่นี่ (status PENDING_INTAKE) ยังไม่นับสต็อก/ขายไม่ได้
 * แก้ข้อมูลได้ทุก field + เพิ่มรูป (ฟอร์มเดียวกับแก้เครื่อง) แล้วกด "รับเข้าสต็อก" → พร้อมขาย (+1)
 */
export function PendingIntakePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pending-intake'],
    queryFn: () => inventoryApi.listSerials({ status: 'PENDING_INTAKE', size: 200 }),
  });
  const items = data?.content ?? [];

  const [editing, setEditing] = useState<SerializedItemResponse | null>(null);

  const receive = useMutation({
    mutationFn: (id: string) => inventoryApi.backToStock(id),
    onSuccess: (_r, id) => {
      const it = items.find((i) => i.id === id);
      toast.success(`รับเข้าสต็อกแล้ว — ${it?.productName ?? 'เครื่อง'} พร้อมขาย`);
      qc.invalidateQueries({ queryKey: ['pending-intake'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-serials'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <PackageOpen className="h-6 w-6 text-amber-600" /> รอลงสต็อก (เครื่องเทิร์น)
        </h1>
        <p className="text-sm text-slate-500">
          เครื่องที่ตีเทิร์นเข้ามา — <strong>ยังไม่นับสต็อก / ขายไม่ได้</strong> · แก้ข้อมูล + เพิ่มรูปให้ครบ
          แล้วกด <strong>รับเข้าสต็อก</strong> จึงจะพร้อมขายและนับสต็อก
        </p>
      </div>

      {isLoading && <div className="card p-8 text-center text-slate-400">กำลังโหลด...</div>}

      {!isLoading && items.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          ไม่มีเครื่องรอลงสต็อก — เครื่องที่ตีเทิร์นตอนขายจะมาโผล่ที่นี่
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((it) => {
          const noPhoto = !it.imageUrls || it.imageUrls.length === 0;
          const noPrice = it.sellingPrice == null;
          const cover = it.imageUrls && it.imageUrls.length > 0 ? it.imageUrls[0] : null;
          return (
            <div key={it.id} className="card p-3">
              <div className="flex gap-3">
                {/* รูปปก / ป้ายยังไม่มีรูป */}
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {cover ? (
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-amber-500">
                      <ImageOff className="h-5 w-5" />
                      <span className="text-[10px]">ยังไม่มีรูป</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-800">
                    {it.productName ?? '—'}
                  </div>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono">{it.sku}</span> · {CONDITION_TH[it.condition] ?? it.condition}
                    {it.deviceColor ? ` · ${it.deviceColor}` : ''}{it.deviceStorage ? ` ${it.deviceStorage}` : ''}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {it.imei ? `IMEI ${it.imei}` : `SN ${it.serialNumber}`}
                    {it.batteryHealth != null && (
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <BatteryMedium className="h-3.5 w-3.5" />{it.batteryHealth}%
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    รับเข้า {formatDateTime(it.receivedAt)} · ทุน {it.purchasePriceCode ?? (it.purchasePrice != null ? formatTHB(it.purchasePrice) : '—')}
                    {' · ราคาขาย '}{it.sellingPrice != null ? formatTHB(it.sellingPrice) : '(ใช้ราคารุ่น)'}
                  </div>

                  {(noPhoto || noPrice) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {noPhoto && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">ยังไม่มีรูป</span>}
                      {noPrice && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">ยังไม่ตั้งราคาขาย</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditing(it)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <Pencil className="h-4 w-4" /> แก้ไข / เพิ่มรูป
                </button>
                <button type="button" onClick={() => receive.mutate(it.id)} disabled={receive.isPending}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <ArrowDownToLine className="h-4 w-4" /> รับเข้าสต็อก
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditSerialModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['pending-intake'] });
          }}
        />
      )}
    </div>
  );
}
