import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BatteryMedium, ChevronDown, ChevronRight, Search, Smartphone, Wrench } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { repairApi } from '@/api/repair';
import { useBranchStore } from '@/stores/branchStore';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { accessoriesText, batteryText, batteryTone } from '@/lib/techStock';
import { CHECK_ITEMS, CHECK_STATUS } from '@/lib/deviceCheck';
import type { SerializedItemResponse } from '@/types/api';

type Condition = 'NEW' | 'SECOND_HAND';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  IN_STOCK: { text: 'พร้อมขาย', cls: 'badge-green' },
  PENDING_INTAKE: { text: 'รอลงสต๊อก', cls: 'badge-amber' },
  RESERVED: { text: 'จองแล้ว', cls: 'badge-amber' },
  DEFECTIVE: { text: 'เสีย/ซ่อม', cls: 'badge-red' },
  RETURNED: { text: 'รับคืนรอตรวจ', cls: 'badge-slate' },
};

const SERVICE_STATE_LABEL: Record<string, string> = { AWAITING_REPAIR: 'รอซ่อม', SENT_CLAIM: 'ส่งเคลม' };

const BATTERY_CLS: Record<ReturnType<typeof batteryTone>, string> = {
  good: 'text-emerald-700',
  fair: 'text-amber-700',
  replace: 'font-semibold text-red-600',
  unknown: 'text-slate-400',
};

/**
 * สต็อกเครื่องสำหรับช่าง (FIX-234) — ทุกเครื่องที่ยังอยู่ในร้าน (พร้อมขาย + จอง + เสีย/ซ่อม + รอตรวจ)
 * ข้อมูลเครื่องครบ (IMEI/SN/แบต/สภาพ/ผลตรวจ/ประวัติซ่อม) แต่ไม่มีราคา — backend ตัด field เงินให้ช่างอยู่แล้ว
 */
export function TechStockPage() {
  const branchId = useBranchStore((s) => s.activeBranchId) ?? undefined;
  const [condition, setCondition] = useState<Condition>('SECOND_HAND');
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['inventory', 'tech-stock', condition, branchId ?? 'all', page, q],
    queryFn: () => inventoryApi.stockCheckDevices({
      condition, branchId, includeHeld: true, q: q || undefined, page, size: 50,
    }),
  });

  const switchCondition = (next: Condition) => { setCondition(next); setPage(0); setOpenId(null); };
  const search = () => { setPage(0); setOpenId(null); setQ(searchInput.trim()); };
  const totalPages = list.data?.totalPages ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <Smartphone className="h-6 w-6 text-brand-600" /> สต็อกเครื่อง
        </h1>
        <p className="text-sm text-slate-500">
          เครื่องที่อยู่ในร้านตอนนี้ (พร้อมขาย / จอง / เสีย-ซ่อม / รอตรวจ){branchId ? ' · สาขาที่เลือก' : ' · ทุกสาขา'} — กดแถวเพื่อดูผลตรวจและประวัติซ่อม
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['SECOND_HAND', 'NEW'] as const).map((c) => (
          <button key={c} onClick={() => switchCondition(c)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    condition === c ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
            {c === 'NEW' ? 'มือ 1 (ใหม่)' : 'มือ 2 (มือสอง)'}
          </button>
        ))}
        <form className="ml-auto flex w-full max-w-md gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="ค้นหารุ่น / รหัส DD / IMEI / Serial"
                   value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <button type="submit" className="btn-secondary"><Search className="h-4 w-4" /> ค้นหา</button>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b px-4 py-2.5 text-sm text-slate-600">
          <span>พบ <strong className="text-slate-900">{list.data ? formatNumber(list.data.totalElements) : '—'} เครื่อง</strong></span>
          {totalPages > 1 && (
            <span className="flex items-center gap-2">
              <button className="btn-secondary px-2 py-1 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              หน้า {page + 1}/{totalPages}
              <button className="btn-secondary px-2 py-1 text-xs" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2.5" />
                <th className="px-3 py-2.5">รหัส</th>
                <th className="px-3 py-2.5">รุ่น</th>
                <th className="px-3 py-2.5">สี / ความจุ</th>
                <th className="px-3 py-2.5">IMEI / Serial</th>
                <th className="px-3 py-2.5 text-right">แบต</th>
                <th className="px-3 py-2.5">สภาพ</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">สาขา</th>
                <th className="px-3 py-2.5">รับเข้า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isLoading && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">กำลังโหลด...</td></tr>}
              {list.isError && <tr><td colSpan={10} className="px-4 py-10 text-center text-red-600">โหลดรายการไม่สำเร็จ ลองรีเฟรชหน้า</td></tr>}
              {list.data?.content.map((item) => {
                const open = openId === item.id;
                const status = STATUS_LABEL[item.status] ?? { text: item.status, cls: 'badge-slate' };
                return (
                  <Fragment key={item.id}>
                    <tr className={`cursor-pointer hover:bg-slate-50 ${open ? 'bg-brand-50/40' : ''}`}
                        onClick={() => setOpenId(open ? null : item.id)}>
                      <td className="px-2 py-3 text-slate-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-3 py-3"><span className="rounded bg-brand-100 px-1.5 font-mono text-xs font-semibold text-brand-700">{item.stockCode ?? '—'}</span></td>
                      <td className="px-3 py-3 font-medium">{item.productName ?? item.sku}{item.modelNumber && <div className="font-mono text-[11px] text-slate-400">{item.modelNumber}</div>}</td>
                      <td className="px-3 py-3 text-slate-600">{[item.deviceColor, item.deviceStorage].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-3 py-3">
                        <div className="font-mono text-xs">{item.imei ?? 'ไม่มี IMEI'}</div>
                        <div className="font-mono text-xs text-slate-400">SN: {item.serialNumber}</div>
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums ${BATTERY_CLS[batteryTone(item.batteryHealth)]}`}>{batteryText(item.batteryHealth)}</td>
                      <td className="px-3 py-3 text-xs">
                        {item.grade && <span className="badge-blue mr-1">เกรด {item.grade}</span>}
                        {item.defectNote && <div className="mt-0.5 text-amber-700">{item.defectNote}</div>}
                        {!item.grade && !item.defectNote && <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={status.cls}>{status.text}</span>
                        {item.serviceState && <div className="mt-0.5 text-[11px] text-red-600">{SERVICE_STATE_LABEL[item.serviceState] ?? item.serviceState}</div>}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{item.branchName ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{formatDateTime(item.receivedAt)}</td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={10} className="px-4 py-3"><DeviceDetail item={item} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {list.data && list.data.content.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">ไม่พบเครื่อง</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** รายละเอียดรายเครื่อง: สเปก + ผลตรวจสภาพ + ประวัติซ่อม/อะไหล่ + ใบงานซ่อมที่เคยรับ (ไม่มีราคา) */
function DeviceDetail({ item }: { item: SerializedItemResponse }) {
  const logs = useQuery({
    queryKey: ['inventory', 'service-logs', item.id],
    queryFn: () => inventoryApi.listServiceLogs(item.id),
  });
  const repairs = useQuery({
    queryKey: ['repair-tickets', 'by-device', item.imei, item.serialNumber],
    queryFn: () => repairApi.listByDevice({ imei: item.imei ?? undefined, serial: item.serialNumber || undefined }),
    enabled: !!(item.imei || item.serialNumber),
  });
  const inspection = item.inspection;

  const spec: [string, string][] = [
    ['IMEI 2', item.imei2 ?? '—'],
    ['เครือข่าย', item.deviceNetwork ?? '—'],
    ['อุปกรณ์', accessoriesText(item.hasBox, item.hasCharger)],
    ['ประกัน', [item.warrantyTerms, item.warrantyExpire ? `ถึง ${formatDate(item.warrantyExpire)}` : null].filter(Boolean).join(' · ') || '—'],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2 text-sm">
        <div className="font-semibold text-slate-700">ข้อมูลเครื่อง</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {spec.map(([k, v]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></Fragment>)}
        </dl>
        {inspection ? (
          <div className="mt-2 space-y-1 text-xs">
            <div className="font-semibold text-slate-700">ผลตรวจสภาพ{inspection.inspectedAt && <span className="font-normal text-slate-400"> · {formatDateTime(inspection.inspectedAt)}</span>}</div>
            {CHECK_ITEMS.map((c) => {
              const value = inspection[c.key];
              if (!value) return null;
              const st = CHECK_STATUS.find((s) => s.value === value);
              const note = inspection[c.noteKey];
              return <div key={c.key}><span className="text-slate-500">{c.label}:</span> <span className="font-medium">{st?.label ?? value}</span>{note && <span className="text-slate-600"> — {note}</span>}</div>;
            })}
            {inspection.conditionNote && <div className="text-amber-700">{inspection.conditionNote}</div>}
          </div>
        ) : <div className="text-xs text-slate-400">ยังไม่มีผลตรวจสภาพ</div>}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700"><BatteryMedium className="h-4 w-4" /> ประวัติซ่อม / อะไหล่</div>
        {logs.isLoading && <div className="text-xs text-slate-400">กำลังโหลด...</div>}
        {logs.data && logs.data.length === 0 && <div className="text-xs text-slate-400">ไม่มีประวัติ</div>}
        <ul className="space-y-1.5 text-xs">
          {logs.data?.map((l) => (
            <li key={l.id} className="rounded border border-slate-200 bg-white px-2 py-1.5">
              <div className="font-medium">{l.detail}</div>
              <div className="text-slate-500">
                {formatDate(l.servicedAt)} · {l.type === 'OUTSOURCED' ? `ส่งช่างนอก${l.vendorName ? `: ${l.vendorName}` : ''}` : 'ซ่อมเอง'}
                {l.note && ` · ${l.note}`}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700"><Wrench className="h-4 w-4" /> ใบงานซ่อมของเครื่องนี้</div>
        {repairs.isLoading && <div className="text-xs text-slate-400">กำลังโหลด...</div>}
        {repairs.data && repairs.data.length === 0 && <div className="text-xs text-slate-400">ไม่เคยเข้างานซ่อม</div>}
        <ul className="space-y-1.5 text-xs">
          {repairs.data?.map((r) => (
            <li key={r.id} className="rounded border border-slate-200 bg-white px-2 py-1.5">
              <div className="font-mono font-semibold">{r.ticketNo} <span className="font-sans font-normal text-slate-500">· {formatDate(r.receivedAt)}</span></div>
              <div>{r.reportedSymptom}</div>
              {r.workDescription && <div className="text-emerald-700">{r.workDescription}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
