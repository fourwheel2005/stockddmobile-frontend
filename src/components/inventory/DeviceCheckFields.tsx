import { ClipboardCheck } from 'lucide-react';
import { CHECK_ITEMS, CHECK_STATUS, GRADE_OPTIONS, type DeviceCheckForm } from '@/lib/deviceCheck';
import type { DeviceCheckStatus, DeviceGrade } from '@/types/api';

/**
 * ช่องกรอกผลตรวจสภาพเครื่องมือสอง (FIX-220) — ทุกช่องไม่บังคับ
 * ใช้ที่: รับเข้า (สินค้า + คลัง / ลงทะเบียนรุ่น) · เครื่องมัดจำถึง · แก้ไขเครื่อง
 * ข้อมูลไปขึ้นกล่อง "ข้อมูลสภาพเครื่อง" บนเว็บ · "ตรวจเมื่อ" ระบบประทับเวลาเอง
 */
export function DeviceCheckFields({ value, onChange, compact }: {
  value: DeviceCheckForm;
  onChange: (next: DeviceCheckForm) => void;
  /** ในแถวรับเข้า — ตัดคำอธิบายหัวข้อให้สั้น */
  compact?: boolean;
}) {
  const set = (patch: Partial<DeviceCheckForm>) => onChange({ ...value, ...patch });
  const toggle = (key: (typeof CHECK_ITEMS)[number]['key'], status: DeviceCheckStatus) =>
    set({ [key]: value[key] === status ? '' : status } as Partial<DeviceCheckForm>);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 font-semibold text-slate-700">
          <ClipboardCheck className="h-4 w-4 text-emerald-600" /> ผลตรวจสภาพ
        </span>
        {!compact && <span className="text-xs text-slate-500">โชว์ลูกค้าบนเว็บ · ไม่บังคับ · ช่องที่ไม่กรอกขึ้นว่า “ยังไม่ได้ระบุ”</span>}
      </div>

      <label className="block">
        <span className="mb-0.5 block text-xs font-semibold text-slate-600">เกรดสภาพ</span>
        <select className="input" value={value.grade} onChange={(e) => set({ grade: e.target.value as DeviceGrade | '' })}>
          <option value="">— ไม่ระบุ —</option>
          {GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </label>

      {CHECK_ITEMS.map((it) => (
        <div key={it.key} className="grid items-center gap-1.5 sm:grid-cols-[8.5rem_auto_1fr]">
          <span className="text-xs font-semibold text-slate-600">{it.label}</span>
          <div className="flex gap-1" role="group" aria-label={`ผลตรวจ${it.label}`}>
            {CHECK_STATUS.map((st) => (
              <button key={st.value} type="button" aria-pressed={value[it.key] === st.value}
                      onClick={() => toggle(it.key, st.value)}
                      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium ${
                        value[it.key] === st.value ? st.cls : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}>
                {st.label}
              </button>
            ))}
          </div>
          <input className="input py-1 text-xs" maxLength={120} placeholder="รายละเอียดเพิ่ม (ไม่บังคับ)"
                 aria-label={`รายละเอียด${it.label}`}
                 value={value[it.noteKey]} onChange={(e) => set({ [it.noteKey]: e.target.value } as Partial<DeviceCheckForm>)} />
        </div>
      ))}

      <label className="block">
        <span className="mb-0.5 block text-xs font-semibold text-slate-600">ตำหนิ/หมายเหตุ (โชว์ลูกค้า)</span>
        <textarea className="input min-h-[2.5rem] text-xs" rows={2} maxLength={500}
                  placeholder="เช่น มีรอยขนแมวหลังเครื่อง · เปลี่ยนแบตแล้ว"
                  value={value.conditionNote} onChange={(e) => set({ conditionNote: e.target.value })} />
      </label>
    </div>
  );
}
