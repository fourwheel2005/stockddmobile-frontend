import { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import type { TermCell } from '@/lib/installmentTable';
import { validateNewMonth } from '@/lib/installmentTable';

/**
 * ช่องกรอก 1 คอลัมน์เดือนของตารางผ่อน (มือ 1 / มือ 2) — ค่างวด + ดาวน์เฉพาะงวด (FIX-200)
 * ใช้ร่วมกันสองหน้าเพื่อให้พฤติกรรมเหมือนกัน
 */
export function TermCellInput({ cell, rowDown, onChange, compact }: {
  cell: TermCell | undefined;
  /** ดาวน์หลักของแถว — โชว์เป็น placeholder ให้รู้ว่าเว้นแล้วได้ค่าไหน */
  rowDown: string;
  onChange: (next: TermCell) => void;
  compact?: boolean;
}) {
  const value: TermCell = cell ?? { monthly: '', down: '' };
  const size = compact ? 'text-sm' : '';
  return (
    <div className="flex flex-col gap-1">
      <input type="number" min={0} className={`input w-24 text-right ${size}`} placeholder="—"
             title="ค่างวดต่อเดือน (บาท)"
             value={value.monthly}
             onChange={(e) => onChange({ ...value, monthly: e.target.value })} />
      <input type="number" min={0} className={`input w-24 text-right text-xs ${size}`}
             placeholder={rowDown.trim() !== '' ? `ดาวน์ ${rowDown}` : 'ดาวน์=หลัก'}
             title="เงินดาวน์เฉพาะงวดนี้ · เว้นว่าง = ใช้ดาวน์หลักของแถว"
             value={value.down}
             onChange={(e) => onChange({ ...value, down: e.target.value })} />
    </div>
  );
}

/** ปุ่ม "+ เดือน" เพิ่มคอลัมน์จำนวนเดือนใหม่ให้ตาราง (เช่น 20/24/36) */
export function AddMonthColumn({ existing, onAdd }: { existing: readonly number[]; onAdd: (months: number) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const submit = () => {
    const result = validateNewMonth(draft, existing);
    if ('error' in result) { toast.error(result.error); return; }
    onAdd(result.months);
    setDraft('');
    setOpen(false);
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              title="เพิ่มคอลัมน์จำนวนเดือน เช่น 24 หรือ 36">
        <Plus className="h-3.5 w-3.5" /> เพิ่มเดือน
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1">
      <input autoFocus type="number" min={1} max={60} className="input w-20 text-sm" placeholder="เช่น 24"
             value={draft} onChange={(e) => setDraft(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter') { e.preventDefault(); submit(); }
               if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setDraft(''); }
             }} />
      <span className="text-xs text-slate-500">เดือน</span>
      <button type="button" onClick={submit} className="rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">เพิ่ม</button>
      <button type="button" onClick={() => { setOpen(false); setDraft(''); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">ยกเลิก</button>
    </div>
  );
}
