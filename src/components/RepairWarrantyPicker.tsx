import { ShieldCheck } from 'lucide-react';
import { REPAIR_WARRANTY_OPTIONS, type RepairWarranty } from '@/lib/repairWarranty';

/** เลือกการรับประกันงานซ่อม (FIX-225) — กดเลือก 1 อย่าง · นับจากวันที่ลูกค้ารับเครื่องคืน */
export function RepairWarrantyPicker({ value, onChange }: {
  value: RepairWarranty | null | undefined;
  onChange: (v: RepairWarranty) => void;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-emerald-600" /> การรับประกัน
        <span className="font-normal text-slate-400">(นับจากวันที่ลูกค้ารับเครื่องคืน)</span>
      </label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="การรับประกัน">
        {REPAIR_WARRANTY_OPTIONS.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
                  onClick={() => onChange(o.value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${value === o.value
                    ? (o.value === 'NONE' ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-emerald-600 bg-emerald-50 text-emerald-800')
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
