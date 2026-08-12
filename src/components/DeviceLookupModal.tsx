import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, X, Smartphone } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { formatInShopZone } from '@/lib/datetime';
import type { SerializedItemResponse } from '@/types/api';

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

/**
 * เช็ครายละเอียดเครื่องด้วยการยิง IMEI — โชว์ข้อมูลครบเพื่อตอบลูกค้า.
 * ⚠️ ไม่โชว์ต้นทุน (purchasePrice/purchasePriceCode) · ไม่เพิ่มลงตะกร้า.
 */
export function DeviceLookupModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [device, setDevice] = useState<SerializedItemResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = useMutation({
    mutationFn: (query: string) => inventoryApi.lookupSerial(query),
    onSuccess: (d) => { setDevice(d); setQ(''); inputRef.current?.focus(); },
    onError: (e) => { setDevice(null); alert(extractErrorMessage(e) || 'ไม่พบเครื่องนี้'); inputRef.current?.focus(); },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v) lookup.mutate(v);
  };

  const spec = device ? [device.deviceColor, device.deviceStorage].filter(Boolean).join(' / ') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Search className="h-5 w-5 text-brand-600" /> เช็ครายละเอียดสินค้า (ยิง IMEI/Serial)
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-5">
          <form onSubmit={submit}>
            <div className="flex gap-2">
              <input ref={inputRef} autoFocus className="input flex-1 font-mono"
                     placeholder="ยิงบาร์โค้ด / IMEI / Serial / รหัสสินค้า"
                     value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="submit" className="btn-primary" disabled={lookup.isPending}>
                {lookup.isPending ? '...' : 'ค้นหา'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">ดูอย่างเดียว ไม่เพิ่มลงตะกร้า · ยิงเครื่องถัดไปได้เรื่อยๆ</p>
          </form>

          {device && (
            <div className="rounded-lg border border-slate-200">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <Smartphone className="h-4 w-4 text-brand-600" />
                    {device.productName ?? device.sku}
                  </div>
                  {spec && <div className="text-sm text-slate-600">{spec}</div>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TH[device.status]?.cls ?? 'bg-slate-200 text-slate-600'}`}>
                  {STATUS_TH[device.status]?.text ?? device.status}
                </span>
              </div>
              <dl className="divide-y divide-slate-100 text-sm">
                <Row label="สภาพ" value={CONDITION_TH[device.condition] ?? device.condition} />
                {device.condition !== 'NEW' && device.batteryHealth != null && (
                  <Row label="แบตเตอรี่" value={`${device.batteryHealth}%`} />
                )}
                {device.deviceColor && <Row label="สี" value={device.deviceColor} />}
                {device.deviceStorage && <Row label="ความจุ" value={device.deviceStorage} />}
                {device.modelNumber && <Row label="เลขรุ่น" value={device.modelNumber} mono />}
                {device.warrantyTerms && <Row label="ประกัน" value={device.warrantyTerms} />}
                {device.warrantyExpire && <Row label="ประกันถึง" value={formatInShopZone(device.warrantyExpire, { year: 'numeric', month: '2-digit', day: '2-digit' })} />}
                <Row label="IMEI" value={device.imei ?? '-'} mono />
                <Row label="Serial" value={device.serialNumber} mono />
                {device.stockCode && <Row label="รหัสสินค้า" value={device.stockCode} mono />}
                {device.branchName && <Row label="สาขา" value={device.branchName} />}
                <Row label="ราคาขาย" value={device.sellingPrice != null ? formatTHB(device.sellingPrice) : '-'} strong />
              </dl>
              <div className="px-4 py-2 text-center text-[11px] text-slate-400">
                * สำหรับดูข้อมูล/ตอบลูกค้า — ไม่แสดงต้นทุน
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 px-4 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''} ${strong ? 'text-base font-semibold text-emerald-700' : 'text-slate-800'}`}>{value}</dd>
    </div>
  );
}
