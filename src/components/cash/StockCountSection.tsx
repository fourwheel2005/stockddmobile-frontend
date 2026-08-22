import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { posApi } from '@/api/pos';
import { useBranchStore } from '@/stores/branchStore';

/** payload ตรวจนับที่ส่งไปกับ open/close เก๊ะ (FIX-158) — null = ยังกรอกไม่ครบ (ห้าม submit) */
export interface StockCountPayload {
  countedNew: number;
  countedSecondHand: number;
  certified: true;
  certifiedName: string;
  note?: string;
}

/**
 * ส่วนตรวจนับเครื่องจริงหน้าร้าน (FIX-158) — ฝังใน modal เปิด/ปิดเก๊ะ (บังคับกรอกครบก่อน submit)
 * โชว์ยอดที่ระบบคาด (มือ1/มือ2) → แคชเชียร์กรอกยอดนับจริง → ติ๊กรับรอง + เลือกชื่อ
 * ยอดไม่ตรง = เตือนเหลืองแต่ไม่บล็อก (บันทึกผลต่างเป็นหลักฐาน — ระบบไม่ auto ปรับสต็อก)
 */
export function StockCountSection({ phaseLabel, onChange }: {
  phaseLabel: string;                       // "เปิดร้าน" | "ก่อนปิดร้าน"
  onChange: (payload: StockCountPayload | null) => void;
}) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  const balance = useQuery({
    queryKey: ['daily-stock-balance', branchId, 'count-section'],
    queryFn: () => posApi.dailyStockBalance(branchId ?? undefined),
  });
  const cashiers = useQuery({ queryKey: ['pos', 'cashiers'], queryFn: posApi.listCashiers });

  const [countedNewText, setCountedNewText] = useState('');
  const [countedUsedText, setCountedUsedText] = useState('');
  const [certified, setCertified] = useState(false);
  const [certifiedName, setCertifiedName] = useState('');

  const expectedNew = balance.data?.newDevices.onHand.expectedPhysical ?? null;
  const expectedUsed = balance.data?.secondHandDevices.onHand.expectedPhysical ?? null;

  const payload = useMemo<StockCountPayload | null>(() => {
    const n = Number(countedNewText);
    const u = Number(countedUsedText);
    if (countedNewText.trim() === '' || countedUsedText.trim() === '') return null;
    if (!Number.isInteger(n) || !Number.isInteger(u) || n < 0 || u < 0) return null;
    if (!certified || certifiedName.trim() === '') return null;
    return { countedNew: n, countedSecondHand: u, certified: true, certifiedName: certifiedName.trim() };
  }, [countedNewText, countedUsedText, certified, certifiedName]);

  useEffect(() => { onChange(payload); }, [payload, onChange]);

  const diffBadge = (counted: string, expected: number | null) => {
    if (counted.trim() === '' || expected == null) return null;
    const diff = Number(counted) - expected;
    if (!Number.isFinite(diff)) return null;
    return diff === 0
      ? <span className="text-xs font-semibold text-emerald-600">✓ ตรง</span>
      : <span className="text-xs font-semibold text-red-600">{diff > 0 ? `เกิน +${diff}` : `ขาด ${diff}`}</span>;
  };

  return (
    <div className="rounded-lg border-2 border-sky-200 bg-sky-50/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-900">
        <ClipboardCheck className="h-4 w-4" />
        ตรวจนับเครื่องจริง ({phaseLabel}) <span className="text-red-500">*</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span>มือ 1 — ระบบคาด <strong>{expectedNew ?? '...'}</strong></span>
            {diffBadge(countedNewText, expectedNew)}
          </div>
          <input type="number" min={0} step={1} inputMode="numeric"
                 className="input w-full text-center text-lg font-semibold tabular-nums"
                 placeholder="นับได้..."
                 value={countedNewText} onChange={(e) => setCountedNewText(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span>มือ 2 — ระบบคาด <strong>{expectedUsed ?? '...'}</strong></span>
            {diffBadge(countedUsedText, expectedUsed)}
          </div>
          <input type="number" min={0} step={1} inputMode="numeric"
                 className="input w-full text-center text-lg font-semibold tabular-nums"
                 placeholder="นับได้..."
                 value={countedUsedText} onChange={(e) => setCountedUsedText(e.target.value)} />
        </div>
      </div>

      {payload && expectedNew != null && expectedUsed != null
        && (payload.countedNew !== expectedNew || payload.countedSecondHand !== expectedUsed) && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          ⚠️ ยอดไม่ตรงกับระบบ — บันทึกได้ แต่ผลต่างจะถูกเก็บเป็นหลักฐานให้ผู้จัดการตรวจสอบ
        </div>
      )}

      <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={certified}
               onChange={(e) => setCertified(e.target.checked)} />
        <span>ข้าพเจ้าตรวจนับเครื่องในตู้จริง <strong>ตามรุ่นและจำนวน</strong> แล้วตามยอดข้างต้น</span>
      </label>

      <div className="mt-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">ผู้รับรองการนับ (แคชเชียร์ผู้ดูแลเก๊ะ)</label>
        <div className="flex flex-wrap gap-1.5">
          {(cashiers.data ?? []).map((c) => (
            <button key={c.id} type="button"
                    onClick={() => setCertifiedName(c.name)}
                    className={`rounded-full border px-3 py-1 text-sm ${certifiedName === c.name
                      ? 'border-sky-600 bg-sky-600 font-semibold text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'}`}>
              {certifiedName === c.name ? '✓ ' : ''}{c.name}
            </button>
          ))}
          {cashiers.data?.length === 0 && (
            <span className="text-xs text-slate-400">ยังไม่มีรายชื่อ — เพิ่มได้ที่การ์ดผู้รับเงินในหน้า POS</span>
          )}
        </div>
      </div>
    </div>
  );
}
