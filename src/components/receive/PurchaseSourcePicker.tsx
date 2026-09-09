import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { purchaseSourcesApi } from '@/api/purchaseSources';
import { extractErrorMessage } from '@/api/client';

export const PURCHASE_SOURCES_QUERY_KEY = ['purchase-sources'] as const;
export const ADD_NEW_SOURCE_OPTION = '__add_new__';
export const PURCHASE_SOURCE_MAX_LENGTH = 120;

interface PurchaseSourcePickerProps {
  value: string;
  onChange: (name: string) => void;
  /** ขนาดตัวอักษรให้เข้ากับฟอร์มที่วาง (ล็อตเครื่องใช้ text-sm) */
  size?: 'sm' | 'base';
  className?: string;
}

/**
 * ช่อง "ซื้อมาจาก" ของหน้ารับเข้า (เครื่อง + อุปกรณ์เสริม) — ไม่บังคับกรอก.
 * เลือกจาก master list หรือกด "+ เพิ่มแหล่งซื้อใหม่" พิมพ์ชื่อแล้วบันทึกเข้า list ใช้ซ้ำครั้งถัดไป.
 * ค่าที่ส่งออกคือ "ชื่อ" (ไม่ใช่ id) เพื่อให้ล็อตเก่ายังอ่านได้แม้แหล่งถูกปิดใช้ภายหลัง.
 */
export function PurchaseSourcePicker({ value, onChange, size = 'base', className = '' }: PurchaseSourcePickerProps) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const { data: sources = [] } = useQuery({
    queryKey: PURCHASE_SOURCES_QUERY_KEY,
    queryFn: purchaseSourcesApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: (name: string) => purchaseSourcesApi.create(name),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: PURCHASE_SOURCES_QUERY_KEY });
      onChange(created.name);
      setAdding(false);
      setDraft('');
      toast.success(`เพิ่มแหล่งซื้อ "${created.name}" แล้ว`, { duration: 1500 });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const textSize = size === 'sm' ? 'text-sm' : '';
  // ค่าเดิมที่ไม่อยู่ใน list (เช่น แหล่งถูกปิดใช้) ยังต้องโชว์ให้เลือกค้างไว้ได้
  const options = value && !sources.some((s) => s.name === value)
    ? [{ id: 'current', name: value, active: true }, ...sources]
    : sources;

  const submitDraft = () => {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) { toast.error('พิมพ์ชื่อแหล่งซื้อก่อนบันทึก'); return; }
    create.mutate(name);
  };

  if (adding) {
    return (
      <div className={`flex gap-1 ${className}`}>
        <input
          autoFocus
          className={`input ${textSize}`}
          placeholder="ชื่อร้าน / ซัพพลายเออร์ / ลูกค้า"
          maxLength={PURCHASE_SOURCE_MAX_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitDraft(); }
            if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setDraft(''); }
          }}
        />
        <button type="button" onClick={submitDraft} disabled={create.isPending}
                className="rounded-lg bg-emerald-600 px-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                title="บันทึกแหล่งซื้อใหม่ (Enter)">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { setAdding(false); setDraft(''); }}
                className="rounded-lg border border-slate-300 px-2 text-slate-500 hover:bg-slate-100"
                title="ยกเลิก (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      <select
        className={`input ${textSize}`}
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_NEW_SOURCE_OPTION) { setAdding(true); return; }
          onChange(e.target.value);
        }}>
        <option value="">— ไม่ระบุ —</option>
        {options.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        <option value={ADD_NEW_SOURCE_OPTION}>+ เพิ่มแหล่งซื้อใหม่…</option>
      </select>
      <button type="button" onClick={() => setAdding(true)}
              className="shrink-0 rounded-lg border border-dashed border-emerald-400 px-2 text-emerald-700 hover:bg-emerald-50"
              title="เพิ่มแหล่งซื้อใหม่">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
