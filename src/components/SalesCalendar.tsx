import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';
import { posApi } from '@/api/pos';
import { formatTHB } from '@/lib/format';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

interface Props {
  /** วันที่เลือกอยู่ (YYYY-MM-DD) หรือ null = ทั้งหมด */
  selected: string | null;
  onSelect: (date: string | null) => void;
}

/**
 * ปฏิทินยอดขาย — มาร์กวันที่มีการขาย (จุด + จำนวนบิล) กดวันเพื่อ filter.
 * แก้ปัญหา dd/mm/yyyy พิมพ์ยาก → เห็นภาพรวมทั้งเดือน คลิกวันที่มีของได้เลย.
 */
export function SalesCalendar({ selected, onSelect }: Props) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(() => {
    if (selected) { const [y, m] = selected.split('-').map(Number); return { y, m: m - 1 }; }
    return { y: today.getFullYear(), m: today.getMonth() };
  });

  const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
  const first = iso(ym.y, ym.m, 1);
  const last = iso(ym.y, ym.m, lastDay);
  const todayStr = iso(today.getFullYear(), today.getMonth(), today.getDate());

  const { data } = useQuery({
    queryKey: ['sales-calendar', first, last],
    enabled: open,
    queryFn: () => posApi.salesCalendar(first, last),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    (data ?? []).forEach((d) => m.set(d.date, { count: d.count, total: d.total }));
    return m;
  }, [data]);

  const firstWeekday = new Date(ym.y, ym.m, 1).getDay();
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  const buttonLabel = selected
    ? new Date(selected).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'ปฏิทินยอดขาย';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
          selected ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'
        }`}>
        <CalendarDays className="h-4 w-4" />
        {buttonLabel}
        {selected && (
          <span role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onSelect(null); }}
                className="rounded p-0.5 hover:bg-brand-100">
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <>
          {/* คลิกนอกเพื่อปิด */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
            {/* header เดือน */}
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1 hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-semibold">{MONTHS_TH[ym.m]} {ym.y + 543}</div>
              <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1 hover:bg-slate-100">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* weekday header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
              {WEEKDAYS.map((w) => <div key={w} className="py-0.5">{w}</div>)}
            </div>

            {/* days */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const ds = iso(ym.y, ym.m, day);
                const sale = byDay.get(ds);
                const isSel = selected === ds;
                const isToday = ds === todayStr;
                return (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => { onSelect(ds); setOpen(false); }}
                    title={sale ? `${sale.count} บิล · ${formatTHB(sale.total)}` : 'ไม่มีการขาย'}
                    className={`relative flex h-9 flex-col items-center justify-center rounded text-xs transition-colors ${
                      isSel ? 'bg-brand-600 text-white'
                        : sale ? 'bg-emerald-50 font-semibold text-emerald-700 hover:bg-emerald-100'
                        : 'text-slate-500 hover:bg-slate-100'
                    } ${isToday && !isSel ? 'ring-1 ring-brand-300' : ''}`}>
                    {day}
                    {sale && (
                      <span className={`mt-0.5 text-[9px] leading-none ${isSel ? 'text-white' : 'text-emerald-600'}`}>
                        {sale.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
              <span className="flex items-center gap-1 text-slate-400">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100" /> วันที่มีการขาย
              </span>
              <button type="button"
                onClick={() => { onSelect(null); setOpen(false); }}
                className="text-brand-600 hover:underline">
                ดูทั้งหมด
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
