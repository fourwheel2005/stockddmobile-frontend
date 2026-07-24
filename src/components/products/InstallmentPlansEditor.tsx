import { Plus, X, CreditCard, Copy } from 'lucide-react';
import type { InstallmentPlan } from '@/lib/installment';
import { emptyPlan } from '@/lib/installment';

interface Props {
  value: InstallmentPlan[];
  onChange: (next: InstallmentPlan[]) => void;
}

/**
 * ตัวแก้ "แผนผ่อนหลายแบบ" ต่อรุ่นย่อย (ปุ่มเลือก) — ตั้งครั้งเดียวที่รุ่น เว็บหน้าร้านดึงไปแสดง.
 * แต่ละแผน = ดาวน์ 1 ค่า + งวดหลายช่วง (เดือน × บาท/เดือน) + โปรโม (ถ้ามี).
 * ใช้ร่วมกันระหว่างหน้า "ลงทะเบียนสินค้า" และ modal "แก้รุ่น" (กัน drift).
 */
export function InstallmentPlansEditor({ value, onChange }: Props) {
  const patchPlan = (i: number, patch: Partial<InstallmentPlan>) =>
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPlan = () => onChange([...value, emptyPlan()]);
  const removePlan = (i: number) => onChange(value.filter((_, j) => j !== i));
  const duplicatePlan = (i: number) =>
    onChange([...value.slice(0, i + 1), { ...value[i], terms: value[i].terms.map((t) => ({ ...t })) }, ...value.slice(i + 1)]);

  const patchTerm = (pi: number, ti: number, patch: Partial<{ months: string; monthly: string }>) =>
    patchPlan(pi, { terms: value[pi].terms.map((t, j) => (j === ti ? { ...t, ...patch } : t)) });
  const addTerm = (pi: number) =>
    patchPlan(pi, { terms: [...value[pi].terms, { months: '', monthly: '' }] });
  const removeTerm = (pi: number, ti: number) =>
    patchPlan(pi, { terms: value[pi].terms.filter((_, j) => j !== ti) });

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <CreditCard className="h-4 w-4" />
        แผนผ่อน (หลายแบบ) — ตั้งครั้งเดียวที่รุ่นนี้ เว็บหน้าร้านดึงไปแสดงเป็นปุ่มเลือก
      </div>

      {value.length === 0 && (
        <p className="text-xs text-amber-700">ยังไม่มีแผนผ่อน — กด “เพิ่มแผนผ่อน” เพื่อกำหนด เช่น “ดาวน์ 0”, “ดาวน์ 3000”</p>
      )}

      {value.map((plan, pi) => (
        <div key={pi} className="space-y-2 rounded-md border border-amber-300 bg-white p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white">
              {pi + 1}
            </span>
            <input
              className="input flex-1 text-sm"
              placeholder={`ชื่อแผน (เช่น "ดาวน์ ${plan.down || 0}") — เว้นได้`}
              value={plan.label}
              onChange={(e) => patchPlan(pi, { label: e.target.value })}
            />
            <button type="button" onClick={() => duplicatePlan(pi)} title="ทำซ้ำแผนนี้"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
              <Copy className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => removePlan(pi)} title="ลบแผนนี้"
              className="rounded p-1.5 text-red-500 hover:bg-red-50">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-xs text-slate-500">เงินดาวน์ (บาท)</label>
              <input type="number" step="0.01" min="0" className="input text-sm"
                placeholder="0"
                value={plan.down}
                onChange={(e) => patchPlan(pi, { down: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-slate-500">โปรโมชัน (ถ้ามี)</label>
              <input className="input text-sm"
                placeholder="เช่น ฟรีเคส+ฟิล์ม"
                value={plan.promo}
                onChange={(e) => patchPlan(pi, { promo: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">งวดผ่อน</span>
            {plan.terms.map((t, ti) => (
              <div key={ti} className="flex items-center gap-2">
                <input type="number" min="1" className="input w-24 text-sm"
                  placeholder="งวด"
                  value={t.months}
                  onChange={(e) => patchTerm(pi, ti, { months: e.target.value })}
                />
                <span className="text-xs text-slate-400">เดือน ×</span>
                <input type="number" step="0.01" min="0" className="input flex-1 text-sm"
                  placeholder="บาท/เดือน"
                  value={t.monthly}
                  onChange={(e) => patchTerm(pi, ti, { monthly: e.target.value })}
                />
                <button type="button" onClick={() => removeTerm(pi, ti)}
                  disabled={plan.terms.length === 1}
                  className="rounded p-1 text-red-400 hover:bg-red-50 disabled:opacity-30">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addTerm(pi)}
              className="text-xs font-medium text-amber-700 hover:underline">
              + เพิ่มงวด
            </button>
          </div>
        </div>
      ))}

      <button type="button" onClick={addPlan}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100">
        <Plus className="h-4 w-4" /> เพิ่มแผนผ่อน
      </button>
    </div>
  );
}
