import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { repairPartsApi } from '@/api/repairParts';
import { REPAIR_PARTS_KEY } from '@/components/repair/RepairPartModals';
import { Hint } from '@/components/ui/Hint';
import { formatTHB } from '@/lib/format';
import { linesTotal, partLabel, setLineQty, suggestGroupId } from '@/lib/repairParts';
import type { RepairPart, RepairPartLine, RepairTicketPart } from '@/types/api';

/** จำนวนที่ใบงานนี้ใช้อยู่แล้ว (ตอนเปิด) — นับเป็นของที่ "จองไว้" ให้งานนี้ */
export function linesFromTicket(parts: RepairTicketPart[] | undefined): RepairPartLine[] {
  return (parts ?? []).map((p) => ({ partId: p.partId, quantity: p.quantity }));
}

/**
 * เลือกอะไหล่ที่ใช้ในใบงานซ่อม (FIX-235) — เลือกรุ่น (เดาจากชื่อเครื่องในใบงาน) → กด + ที่ชิ้นที่ใช้
 * จำนวนเกินของที่มี = เตือนทันที (backend ปฏิเสธซ้ำ ไม่ตัดสต็อกบางส่วน)
 */
export function RepairPartsPicker({ deviceText, value, onChange, original }: {
  deviceText: string;
  value: RepairPartLine[];
  /** ส่งยอดรวมราคาเปลี่ยนกลับด้วย (ใช้เติมค่าซ่อม) */
  onChange: (lines: RepairPartLine[], total: number) => void;
  /** อะไหล่ที่ใบงานใช้อยู่ก่อนเปิดหน้าต่าง (เพื่อคำนวณของที่ยังเพิ่มได้) */
  original: RepairPartLine[];
}) {
  const catalog = useQuery({ queryKey: REPAIR_PARTS_KEY, queryFn: repairPartsApi.catalog });
  const groups = catalog.data ?? [];
  const suggested = useMemo(() => suggestGroupId(deviceText, groups), [deviceText, groups]);
  const [picked, setPicked] = useState<string | null>(null);
  const groupId = picked ?? suggested ?? groups[0]?.id ?? '';
  const group = groups.find((g) => g.id === groupId);
  const [q, setQ] = useState('');

  const partsById = useMemo(() => {
    const m = new Map<string, RepairPart & { groupName: string }>();
    groups.forEach((g) => g.parts.forEach((p) => m.set(p.id, { ...p, groupName: g.name })));
    return m;
  }, [groups]);
  const originalQty = (id: string) => original.find((l) => l.partId === id)?.quantity ?? 0;
  const chosenQty = (id: string) => value.find((l) => l.partId === id)?.quantity ?? 0;
  const available = (p: RepairPart) => p.quantity + originalQty(p.id);

  const setQty = (partId: string, qty: number) => {
    const next = setLineQty(value, partId, qty);
    onChange(next, linesTotal(next, partsById));
  };

  const visibleParts = (group?.parts ?? []).filter((p) => `${p.name} ${p.grade ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const total = linesTotal(value, partsById);
  const short = value.filter((l) => { const p = partsById.get(l.partId); return p && l.quantity > available(p); });

  if (catalog.isLoading) return <p className="text-xs text-slate-400">กำลังโหลดตารางอะไหล่...</p>;
  if (groups.length === 0) return <Hint>ยังไม่มีตารางอะไหล่ — ให้ช่างเพิ่มที่เมนู "อะไหล่ / ราคาซ่อม" ก่อน</Hint>;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-sm" value={groupId} onChange={(e) => setPicked(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === suggested ? ' (ตรงกับใบงาน)' : ''}</option>)}
        </select>
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-8 text-sm" placeholder="ค้นชิ้น เช่น จอ" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {!suggested && deviceText.trim() && <Hint>ไม่พบรุ่น "{deviceText}" ในตาราง — เลือกรุ่นเองจากรายการ</Hint>}
      <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-100">
        {visibleParts.length === 0 && <div className="px-3 py-3 text-xs text-slate-400">ไม่มีอะไหล่ในรุ่นนี้</div>}
        {visibleParts.map((p) => {
          const left = available(p) - chosenQty(p.id);
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{partLabel(p)}</div>
                <div className="text-xs text-slate-500">{p.replacePrice > 0 ? formatTHB(p.replacePrice) : 'ยังไม่ตั้งราคา'} · {left > 0 ? `เหลือ ${left}` : <span className="text-red-600">หมด</span>}</div>
              </div>
              <button type="button" className="btn-secondary shrink-0 px-2 py-1 text-xs" disabled={left <= 0}
                      title={left <= 0 ? 'ของหมด — รับเข้าสต็อกก่อน' : 'เพิ่มชิ้นนี้'}
                      onClick={() => setQty(p.id, chosenQty(p.id) + 1)}><Plus className="h-3.5 w-3.5" /> ใช้</button>
            </div>
          );
        })}
      </div>

      <div className="text-xs font-semibold text-slate-600">อะไหล่ที่ใช้ในงานนี้</div>
      {value.length === 0 && <div className="text-xs text-slate-400">ยังไม่ได้เลือก — ไม่ใช้อะไหล่ก็เว้นว่างได้</div>}
      {value.map((l) => {
        const p = partsById.get(l.partId);
        return (
          <div key={l.partId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{p ? `${p.groupName} · ${partLabel(p)}` : 'อะไหล่ที่ถูกลบ'}</span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setQty(l.partId, l.quantity - 1)} title="ลด"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-6 text-center tabular-nums">{l.quantity}</span>
              <button type="button" className="rounded p-1 hover:bg-slate-100" disabled={!p || l.quantity >= available(p)} onClick={() => setQty(l.partId, l.quantity + 1)} title="เพิ่ม"><Plus className="h-3.5 w-3.5" /></button>
              <span className="w-24 text-right tabular-nums">{formatTHB((p?.replacePrice ?? 0) * l.quantity)}</span>
              <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => setQty(l.partId, 0)} title="เอาออก"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          </div>
        );
      })}
      {value.length > 0 && (
        <div className="flex justify-between border-t pt-1.5 text-sm font-semibold"><span>รวมราคาเปลี่ยน (อะไหล่ + ค่าแรง)</span><span className="tabular-nums">{formatTHB(total)}</span></div>
      )}
      {short.length > 0 && <Hint tone="warning">อะไหล่ไม่พอ — รับเข้าสต็อกที่เมนู "อะไหล่ / ราคาซ่อม" ก่อน</Hint>}
    </div>
  );
}
