import { useState } from 'react';
import { PackagePlus, Plus, Lock } from 'lucide-react';
import { formatTHB } from '@/lib/format';

export interface CustomItemDraft {
  name: string;
  sellPrice: number;
  quantity: number;
  /** ทุนต่อชิ้น กรอกเป็นรหัสตัวอักษรของร้าน (เช่น SRR) — เว้นว่างได้ */
  unitCostCode: string;
}

interface Props {
  onAdd: (draft: CustomItemDraft) => void;
}

const COST_CODE_PATTERN = /^[A-Za-z]*$/;

/**
 * เพิ่มรายการขายที่ "ไม่ได้ลงสต็อก" ลงบิล — อุปกรณ์เสริมที่ซื้อมาเป็นร้อยชิ้น
 * (สายชาร์จ ฟิล์ม เคส ฯลฯ) ที่ไม่คุ้มจะลงสต็อกทีละชิ้น.
 *
 * ทุนกรอกเป็น "รหัสตัวอักษร" ชุดเดียวกับที่ใช้แสดงทุนในระบบ เพื่อไม่ให้ตัวเลขทุน
 * ปรากฏบนหน้าจอที่ลูกค้ามองเห็นได้ — backend เป็นผู้ถอดรหัส (FIX-099)
 */
export function CustomItemForm({ onAdd }: Props) {
  const [name, setName] = useState('');
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitCostCode, setUnitCostCode] = useState('');

  const nameValid = name.trim().length > 0;
  const priceValid = sellPrice > 0;
  const codeValid = COST_CODE_PATTERN.test(unitCostCode);
  const canAdd = nameValid && priceValid && codeValid;

  const submit = () => {
    if (!canAdd) return;
    onAdd({
      name: name.trim(),
      sellPrice,
      quantity: Math.max(1, quantity),
      unitCostCode: unitCostCode.trim().toUpperCase(),
    });
    setName('');
    setSellPrice(0);
    setQuantity(1);
    setUnitCostCode('');
  };

  return (
    <div className="card">
      <div className="card-header flex items-center gap-2">
        <PackagePlus className="h-5 w-5" />
        <span>ขายของที่ไม่ได้ลงสต็อก (อุปกรณ์เสริม/อื่นๆ)</span>
      </div>
      <div className="card-body space-y-3">
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label className="mb-1 block text-xs font-medium text-slate-600">ขายอะไร *</label>
            <input
              className="input"
              placeholder="เช่น สายชาร์จ Type-C, ฟิล์มกระจก"
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">ราคาขาย/ชิ้น *</label>
            <input
              type="number" min={0} step="0.01"
              className="input text-right"
              value={sellPrice || ''}
              onChange={(e) => setSellPrice(Math.max(0, Number(e.target.value) || 0))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">จำนวน</label>
            <input
              type="number" min={1}
              className="input text-right"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">ทุน/ชิ้น (รหัส)</label>
            <input
              className={`input text-right font-mono uppercase ${codeValid ? '' : 'border-red-400'}`}
              placeholder="เช่น SRR"
              value={unitCostCode}
              maxLength={20}
              onChange={(e) => setUnitCostCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            <Lock className="inline h-4 w-4 align-[-2px]" /> ทุนกรอกเป็น <strong>รหัสตัวอักษร</strong> ชุดเดียวกับที่ใช้ดูทุนในระบบ · เว้นว่างได้ถ้ายังไม่รู้ทุน
            {!codeValid && <span className="ml-1 text-red-600">— ใส่ได้เฉพาะตัวอักษร</span>}
          </p>
          <div className="flex items-center gap-3">
            {priceValid && (
              <span className="text-sm text-slate-600">
                รวม <strong className="text-slate-900">{formatTHB(sellPrice * Math.max(1, quantity))}</strong>
              </span>
            )}
            <button type="button" className="btn-primary" disabled={!canAdd} onClick={submit}>
              <Plus className="h-4 w-4" />
              เพิ่มลงบิล
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
