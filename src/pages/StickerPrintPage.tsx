import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Printer, Search, StickyNote } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { useDeviceLabelPrinter } from '@/hooks/useDeviceLabelPrinter';
import { formatInShopZone } from '@/lib/datetime';
import { formatArrivalDay, groupArrivalsByDay, type ArrivalDay } from '@/lib/stickerArrivals';
import { useBranchStore } from '@/stores/branchStore';
import type { SerializedItemResponse } from '@/types/api';

const PAGE_SIZE = 200;

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดีมาก', REFURBISHED: 'ปรับสภาพ', DEFECTIVE: 'ชำรุด',
};

function itemCode(item: SerializedItemResponse): string {
  return item.stockCode ?? item.imei ?? item.serialNumber;
}

/**
 * ปริ้นสติ๊กเกอร์เครื่องเข้าใหม่ (FIX-227) — เครื่องพร้อมขายเรียงตามวันรับเข้า ใหม่สุดก่อน
 * แต่ละวันเป็นหัวข้อของตัวเอง: ติ๊กเลือกรายเครื่อง/ทั้งวัน หรือกด "ปริ้นทั้งวัน" ได้ทันที
 * สติ๊กเกอร์ออก TSC TTP-247 ผ่าน Local Bridge ด้วย layout เดียวกับปุ่มใน "เครื่องในรุ่นนี้".
 */
export function StickerPrintPage() {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printed, setPrinted] = useState<Set<string>>(new Set());
  const [wantedDays, setWantedDays] = useState(1);
  const { isPrinting, printItems } = useDeviceLabelPrinter();

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // เปลี่ยนสาขา/คำค้น = รายการชุดใหม่ → ล้างที่ติ๊กไว้ กันปริ้นเครื่องที่มองไม่เห็นบนจอ
  useEffect(() => {
    setSelected(new Set());
    setWantedDays(1);
  }, [activeBranchId, q]);

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['sticker-arrivals', { activeBranchId, q }],
      initialPageParam: 0,
      queryFn: ({ pageParam }) => inventoryApi.listNewArrivals({
        page: pageParam, size: PAGE_SIZE, branchId: activeBranchId || undefined, q: q || undefined,
      }),
      getNextPageParam: (lastPage) => (lastPage.last ? undefined : lastPage.page + 1),
    });

  const { days } = useMemo(
    () => groupArrivalsByDay(data?.pages.flatMap((page) => page.content) ?? [], Boolean(hasNextPage)),
    [data, hasNextPage],
  );

  // วันเก่าสุดที่ยังโหลดไม่ครบจะไม่ถูกแสดง — โหลดต่อเองจนได้จำนวนวัน (ครบทั้งวัน) ตามที่ขอ
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && days.length < wantedDays) void fetchNextPage();
  }, [days.length, wantedDays, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const visibleItems = useMemo(() => days.flatMap((day) => day.items), [days]);
  const selectedItems = visibleItems.filter((item) => selected.has(item.id));

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleDay = (day: ArrivalDay, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const item of day.items) {
      if (checked) next.add(item.id); else next.delete(item.id);
    }
    return next;
  });

  const print = async (items: SerializedItemResponse[]) => {
    if (!(await printItems(items))) return;
    const ids = items.map((item) => item.id);
    setPrinted((current) => new Set([...current, ...ids]));
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const printDay = (day: ArrivalDay) => {
    const confirmed = window.confirm(
      `ปริ้นสติ๊กเกอร์ทั้งหมด ${day.items.length} เครื่อง ที่เข้า${formatArrivalDay(day.dayKey)} ใช่หรือไม่?`,
    );
    if (confirmed) void print(day.items);
  };

  const loading = isLoading || (days.length === 0 && Boolean(hasNextPage));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <StickyNote className="h-6 w-6 text-brand-600" /> ปริ้นสติ๊กเกอร์เครื่องเข้าใหม่
        </h1>
        <p className="text-sm text-slate-500">
          เครื่อง<strong>พร้อมขาย</strong>เรียงตามวันที่รับเข้า (ใหม่สุดอยู่บน) — ติ๊กเลือกเครื่องที่ต้องการ
          หรือกด <strong>ปริ้นทั้งวัน</strong> เพื่อออกสติ๊กเกอร์ติดหลังเครื่องของทุกเครื่องที่เข้าวันนั้น
        </p>
      </div>

      <div className="card sticky top-0 z-10">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="ค้นหา รหัสเครื่อง / IMEI / Serial / ชื่อรุ่น"
                   aria-label="ค้นหาเครื่องเข้าใหม่"
                   value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          </div>
          <div className="text-sm text-slate-600">
            เลือกไว้ <strong className="text-lg text-brand-700">{selectedItems.length}</strong> เครื่อง
          </div>
          <button className="btn-secondary" disabled={selectedItems.length === 0 || isPrinting}
                  onClick={() => setSelected(new Set())}>
            ล้างที่เลือก
          </button>
          <button className="btn-primary" disabled={selectedItems.length === 0 || isPrinting}
                  onClick={() => void print(selectedItems)}>
            <Printer className="h-4 w-4" />
            {isPrinting ? 'กำลังพิมพ์...' : `ปริ้นที่เลือก ${selectedItems.length} เครื่อง`}
          </button>
        </div>
      </div>

      {isError && (
        <div className="card flex items-center justify-between gap-3 p-5 text-sm text-red-700">
          โหลดรายการเครื่องเข้าใหม่ไม่สำเร็จ
          <button className="btn-secondary" disabled={isRefetching} onClick={() => void refetch()}>ลองใหม่</button>
        </div>
      )}

      {loading && !isError && <div className="card p-8 text-center text-slate-400">กำลังโหลด...</div>}

      {!loading && !isError && days.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          {q ? `ไม่พบเครื่องพร้อมขายที่ตรงกับ "${q}"` : 'ยังไม่มีเครื่องพร้อมขาย — รับเครื่องเข้าก่อนจึงจะปริ้นสติ๊กเกอร์ได้'}
        </div>
      )}

      {days.map((day) => (
        <ArrivalDayCard key={day.dayKey} day={day} selected={selected} printed={printed}
                        isPrinting={isPrinting} onToggle={toggle} onToggleDay={toggleDay}
                        onPrintDay={printDay} onPrintOne={(item) => void print([item])} />
      ))}

      {hasNextPage && days.length > 0 && (
        <div className="text-center">
          <button className="btn-secondary" disabled={isFetchingNextPage}
                  onClick={() => setWantedDays(days.length + 1)}>
            <CalendarDays className="h-4 w-4" />
            {isFetchingNextPage ? 'กำลังโหลด...' : 'โหลดวันก่อนหน้า'}
          </button>
        </div>
      )}
    </div>
  );
}

interface ArrivalDayCardProps {
  day: ArrivalDay;
  selected: Set<string>;
  printed: Set<string>;
  isPrinting: boolean;
  onToggle: (id: string) => void;
  onToggleDay: (day: ArrivalDay, checked: boolean) => void;
  onPrintDay: (day: ArrivalDay) => void;
  onPrintOne: (item: SerializedItemResponse) => void;
}

function ArrivalDayCard({
  day, selected, printed, isPrinting, onToggle, onToggleDay, onPrintDay, onPrintOne,
}: ArrivalDayCardProps) {
  const selectedCount = day.items.filter((item) => selected.has(item.id)).length;
  const allSelected = selectedCount === day.items.length;
  const dayCheckbox = useRef<HTMLInputElement>(null);
  const title = formatArrivalDay(day.dayKey);

  useEffect(() => {
    if (dayCheckbox.current) dayCheckbox.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  return (
    <section className="card overflow-hidden" aria-label={`เครื่องเข้า${title}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input ref={dayCheckbox} type="checkbox" className="h-4 w-4 shrink-0"
                 aria-label={`เลือกทุกเครื่องที่เข้า${title}`}
                 checked={allSelected} onChange={(event) => onToggleDay(day, event.target.checked)} />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="truncate">เครื่องเข้า{title}</span>
            </span>
            <span className="block text-xs text-slate-500">
              {day.items.length} เครื่อง{selectedCount > 0 ? ` · เลือกไว้ ${selectedCount}` : ''}
            </span>
          </span>
        </label>
        <button className="btn-primary shrink-0" disabled={isPrinting} onClick={() => onPrintDay(day)}>
          <Printer className="h-4 w-4" /> ปริ้นทั้งวัน ({day.items.length})
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-[48px]" />
            <col className="w-[120px]" />
            <col />
            <col className="w-[190px]" />
            <col className="w-[130px]" />
            <col className="w-[80px]" />
            <col className="w-[64px]" />
          </colgroup>
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2"></th>
              <th className="px-3 py-2">รหัสเครื่อง</th>
              <th className="px-3 py-2">รุ่น</th>
              <th className="px-3 py-2">IMEI / Serial</th>
              <th className="px-3 py-2">สภาพ</th>
              <th className="px-3 py-2">เวลาเข้า</th>
              <th className="px-3 py-2 text-center">ปริ้น</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {day.items.map((item) => {
              const code = itemCode(item);
              const isSelected = selected.has(item.id);
              const condition = CONDITION_TH[item.condition] ?? item.condition;
              return (
                <tr key={item.id} onClick={() => onToggle(item.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${isSelected ? 'bg-brand-50/60' : ''}`}>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" className="h-4 w-4" aria-label={`เลือก ${code} สำหรับปริ้นสติ๊กเกอร์`}
                           checked={isSelected} onChange={() => onToggle(item.id)}
                           onClick={(event) => event.stopPropagation()} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">
                    {item.stockCode ?? '-'}
                    {printed.has(item.id) && (
                      <span className="mt-0.5 flex items-center gap-1 font-sans text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> ปริ้นแล้ว
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="truncate font-medium text-slate-900">{item.productName ?? item.sku}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[item.deviceColor, item.deviceStorage].filter(Boolean).join(' · ') || '-'}
                    </div>
                  </td>
                  <td className="truncate px-3 py-2 font-mono text-xs">{item.imei ?? item.serialNumber}</td>
                  <td className="px-3 py-2 text-xs">
                    {condition}
                    {item.condition !== 'NEW' && item.batteryHealth != null ? ` · แบต ${item.batteryHealth}%` : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {formatInShopZone(item.receivedAt, { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40"
                            title={`ปริ้นสติ๊กเกอร์ ${code} 1 ดวง`} aria-label={`ปริ้นสติ๊กเกอร์ ${code} 1 ดวง`}
                            disabled={isPrinting}
                            onClick={(event) => { event.stopPropagation(); onPrintOne(item); }}>
                      <Printer className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
