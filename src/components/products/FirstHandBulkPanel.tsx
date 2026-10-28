import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import type { BulkAdjust, BulkField, BulkOp, BulkRound } from '@/lib/firstHandBulk';

const FIELDS: { value: BulkField; label: string }[] = [
  { value: 'cash', label: 'ราคาซื้อสด' },
  { value: 'down', label: 'ดาวน์หลัก' },
  { value: 'monthly', label: 'ค่างวด' },
  { value: 'termDown', label: 'ดาวน์เฉพาะงวด' },
];

const OPS: { value: BulkOp; label: string }[] = [
  { value: 'SET', label: 'ตั้งเป็น (บาท)' },
  { value: 'ADD', label: 'เพิ่ม (บาท)' },
  { value: 'SUB', label: 'ลด (บาท)' },
  { value: 'PCT_UP', label: 'เพิ่ม (%)' },
  { value: 'PCT_DOWN', label: 'ลด (%)' },
];

const ROUNDS: { value: BulkRound; label: string }[] = [
  { value: 1, label: 'ไม่ปัด' },
  { value: 10, label: 'ปัดหลักสิบ' },
  { value: 100, label: 'ปัดหลักร้อย' },
];

/**
 * ปรับหลายแถวพร้อมกัน (FIX-208) — แก้เฉพาะตัวเลขในตาราง (แถวเป็นสีเหลือง) ยังไม่บันทึกจนกด "บันทึกทั้งหมด".
 */
export function FirstHandBulkPanel({ selectedCount, monthColumns, onApply, onClearSelection }: {
  selectedCount: number;
  monthColumns: number[];
  onApply: (adjust: BulkAdjust) => void;
  onClearSelection: () => void;
}) {
  const [field, setField] = useState<BulkField>('cash');
  const [op, setOp] = useState<BulkOp>('SET');
  const [value, setValue] = useState('');
  const [round, setRound] = useState<BulkRound>(1);
  const [months, setMonths] = useState<string>('');   // '' = ทุกเดือน
  const perMonth = field === 'monthly' || field === 'termDown';
  const valid = value.trim() !== '' && Number(value) >= 0;

  if (selectedCount === 0) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-brand-100 bg-brand-50/60 px-5 py-3 text-sm">
      <div className="flex items-center gap-1 font-semibold text-brand-800">
        <Wand2 className="h-4 w-4" /> ปรับ {selectedCount} แถวที่เลือก
      </div>
      <label className="text-xs">
        <span className="mb-0.5 block font-semibold text-slate-600">ช่อง</span>
        <select className="input text-sm" value={field} onChange={(e) => setField(e.target.value as BulkField)}>
          {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>
      {perMonth && (
        <label className="text-xs">
          <span className="mb-0.5 block font-semibold text-slate-600">งวด</span>
          <select className="input text-sm" value={months} onChange={(e) => setMonths(e.target.value)}>
            <option value="">ทุกงวดที่มีค่างวด</option>
            {monthColumns.map((m) => <option key={m} value={m}>{m} เดือน</option>)}
          </select>
        </label>
      )}
      <label className="text-xs">
        <span className="mb-0.5 block font-semibold text-slate-600">วิธี</span>
        <select className="input text-sm" value={op} onChange={(e) => setOp(e.target.value as BulkOp)}>
          {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="w-28 text-xs">
        <span className="mb-0.5 block font-semibold text-slate-600">จำนวน</span>
        <input type="number" min={0} className="input text-right text-sm" value={value}
               placeholder={op.startsWith('PCT') ? '5' : '1000'} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="text-xs">
        <span className="mb-0.5 block font-semibold text-slate-600">ปัดเศษ</span>
        <select className="input text-sm" value={round} onChange={(e) => setRound(Number(e.target.value) as BulkRound)}>
          {ROUNDS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>
      <button type="button" className="btn-primary" disabled={!valid}
              onClick={() => onApply({ field, op, value: Number(value), round, months: months === '' ? null : Number(months) })}>
        ใช้กับแถวที่เลือก
      </button>
      <button type="button" className="btn-secondary" onClick={onClearSelection}>ล้างการเลือก</button>
      <p className="w-full text-xs text-slate-500">
        ตัวเลขในตารางจะเปลี่ยนเป็นสีเหลืองให้ตรวจก่อน · ยังไม่บันทึกจนกว่าจะกด "บันทึกทั้งหมด" ·
        บวก/ลด/เปอร์เซ็นต์ข้ามช่องที่ยังว่าง · ดาวน์เฉพาะงวดตั้งได้เฉพาะงวดที่มีค่างวด
      </p>
    </div>
  );
}
