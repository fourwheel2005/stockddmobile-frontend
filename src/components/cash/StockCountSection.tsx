import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cable, ClipboardCheck, Eye, Package, PlugZap, Smartphone, Check, TriangleAlert } from 'lucide-react';
import { posApi } from '@/api/pos';
import { useBranchStore } from '@/stores/branchStore';
import { StockDeviceListModal, type StockCheckCondition } from '@/components/inventory/StockDeviceListModal';

export interface StockCountPayload {
  countedNew: number;
  countedSecondHand: number;
  countedChargerHeads: number;
  countedChargingCables: number;
  countedOtherAccessories: number;
  certified: true;
  certifiedName: string;
  note?: string;
}

export interface StockCountTexts {
  newDevices: string;
  secondHandDevices: string;
  chargerHeads: string;
  chargingCables: string;
  otherAccessories: string;
}

interface ExpectedCounts {
  newDevices: number | null;
  secondHandDevices: number | null;
  chargerHeads: number | null;
  chargingCables: number | null;
  otherAccessories: number | null;
}

const EMPTY_COUNTS: StockCountTexts = {
  newDevices: '', secondHandDevices: '', chargerHeads: '', chargingCables: '', otherAccessories: '',
};

export function createStockCountPayload(
  counts: StockCountTexts,
  certified: boolean,
  certifiedName: string,
): StockCountPayload | null {
  const values = Object.values(counts).map((value) => Number(value));
  if (Object.values(counts).some((value) => value.trim() === '')) return null;
  if (values.some((value) => !Number.isInteger(value) || value < 0)) return null;
  if (!certified || !certifiedName.trim()) return null;
  return {
    countedNew: values[0], countedSecondHand: values[1],
    countedChargerHeads: values[2], countedChargingCables: values[3],
    countedOtherAccessories: values[4], certified: true, certifiedName: certifiedName.trim(),
  };
}

function hasMismatch(payload: StockCountPayload, expected: ExpectedCounts): boolean {
  return payload.countedNew !== expected.newDevices
    || payload.countedSecondHand !== expected.secondHandDevices
    || payload.countedChargerHeads !== expected.chargerHeads
    || payload.countedChargingCables !== expected.chargingCables
    || payload.countedOtherAccessories !== expected.otherAccessories;
}

export function StockCountSection({ phaseLabel, onChange }: {
  phaseLabel: string;
  onChange: (payload: StockCountPayload | null) => void;
}) {
  const branchId = useBranchStore((state) => state.activeBranchId);
  const balance = useQuery({
    queryKey: ['daily-stock-balance', branchId, 'count-section'],
    queryFn: () => posApi.dailyStockBalance(branchId ?? undefined),
  });
  const cashiers = useQuery({ queryKey: ['pos', 'cashiers'], queryFn: posApi.listCashiers });
  const [counts, setCounts] = useState<StockCountTexts>(EMPTY_COUNTS);
  const [certified, setCertified] = useState(false);
  const [certifiedName, setCertifiedName] = useState('');
  const [stockView, setStockView] = useState<StockCheckCondition | null>(null);

  const expected: ExpectedCounts = {
    newDevices: balance.data?.newDevices.onHand.expectedPhysical ?? null,
    secondHandDevices: balance.data?.secondHandDevices.onHand.expectedPhysical ?? null,
    chargerHeads: balance.data?.accessories?.chargerHeads.onHand.expectedPhysical ?? null,
    chargingCables: balance.data?.accessories?.chargingCables.onHand.expectedPhysical ?? null,
    otherAccessories: balance.data?.accessories?.otherAccessories.onHand.expectedPhysical ?? null,
  };
  const payload = useMemo(
    () => createStockCountPayload(counts, certified, certifiedName),
    [counts, certified, certifiedName],
  );
  useEffect(() => { onChange(payload); }, [payload, onChange]);

  const updateCount = (key: keyof StockCountTexts, value: string) => {
    setCounts((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
    <div className="rounded-lg border-2 border-sky-200 bg-sky-50/50 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-900">
        <ClipboardCheck className="h-4 w-4" />
        ตรวจนับสต็อกจริง ({phaseLabel}) <span className="text-red-500">*</span>
      </div>

      <CountGroup title="เครื่อง — ไม่นับรวมอุปกรณ์เสริม" icon={<Smartphone className="h-4 w-4" />}
                  columns="sm:grid-cols-2">
        <CountInput label="เครื่องมือ 1" value={counts.newDevices} expected={expected.newDevices}
                    unit="เครื่อง" onChange={(value) => updateCount('newDevices', value)}
                    onView={() => setStockView('NEW')} />
        <CountInput label="เครื่องมือ 2" value={counts.secondHandDevices} expected={expected.secondHandDevices}
                    unit="เครื่อง" onChange={(value) => updateCount('secondHandDevices', value)}
                    onView={() => setStockView('SECOND_HAND')} />
      </CountGroup>

      <CountGroup title="อุปกรณ์เสริม — แยกนับจากเครื่อง" icon={<PlugZap className="h-4 w-4" />}
                  columns="sm:grid-cols-3">
        <CountInput label="หัวชาร์จ" value={counts.chargerHeads} expected={expected.chargerHeads}
                    unit="หัว" onChange={(value) => updateCount('chargerHeads', value)} icon={<PlugZap className="h-3.5 w-3.5" />} />
        <CountInput label="สายชาร์จ" value={counts.chargingCables} expected={expected.chargingCables}
                    unit="เส้น" onChange={(value) => updateCount('chargingCables', value)} icon={<Cable className="h-3.5 w-3.5" />} />
        <CountInput label="อุปกรณ์อื่น" value={counts.otherAccessories} expected={expected.otherAccessories}
                    unit="ชิ้น" onChange={(value) => updateCount('otherAccessories', value)} icon={<Package className="h-3.5 w-3.5" />} />
      </CountGroup>
      {branchId && balance.data?.context.accessoryInventoryGlobal && (
        <p className="-mt-2 mb-3 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-800">
          หมายเหตุ: Accessory แบบนับจำนวนในฐานข้อมูลปัจจุบันเป็นยอดรวมทุกสาขา ส่วนแบบมี Serial กรองตามสาขานี้
        </p>
      )}

      {payload && Object.values(expected).every((value) => value != null) && hasMismatch(payload, expected) && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /> ยอดไม่ตรงกับระบบ — บันทึกได้ แต่ผลต่างของแต่ละกลุ่มจะถูกเก็บเป็นหลักฐาน
        </div>
      )}

      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={certified}
               onChange={(event) => setCertified(event.target.checked)} />
        <span>ข้าพเจ้าตรวจนับ <strong>เครื่องและอุปกรณ์เสริมแยกตามประเภท</strong> แล้วตามยอดข้างต้น</span>
      </label>

      <div className="mt-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">ผู้รับรองการนับ (แคชเชียร์ผู้ดูแลเก๊ะ)</label>
        <div className="flex flex-wrap gap-1.5">
          {(cashiers.data ?? []).map((cashier) => (
            <button key={cashier.id} type="button" onClick={() => setCertifiedName(cashier.name)}
                    className={`rounded-full border px-3 py-1 text-sm ${certifiedName === cashier.name
                      ? 'border-sky-600 bg-sky-600 font-semibold text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'}`}>
              {certifiedName === cashier.name && <Check className="inline h-3.5 w-3.5 align-[-2px]" />} {cashier.name}
            </button>
          ))}
          {cashiers.data?.length === 0 && (
            <span className="text-xs text-slate-400">ยังไม่มีรายชื่อ — เพิ่มได้ที่การ์ดผู้รับเงินในหน้า POS</span>
          )}
        </div>
      </div>
    </div>
    {stockView && (
      <StockDeviceListModal
        condition={stockView}
        scope="PHYSICAL"
        branchId={branchId ?? undefined}
        expectedTotal={stockView === 'NEW' ? expected.newDevices : expected.secondHandDevices}
        onClose={() => setStockView(null)}
      />
    )}
    </>
  );
}

function CountGroup({ title, icon, columns, children }: {
  title: string; icon: React.ReactNode; columns: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-3 rounded-md border border-slate-200 bg-white/70 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">{icon}{title}</div>
      <div className={`grid grid-cols-1 gap-2 ${columns}`}>{children}</div>
    </div>
  );
}

function CountInput({ label, value, expected, unit, onChange, onView, icon }: {
  label: string; value: string; expected: number | null; unit: string;
  onChange: (value: string) => void; onView?: () => void; icon?: React.ReactNode;
}) {
  const difference = value.trim() === '' || expected == null ? null : Number(value) - expected;
  return (
    <div>
      <div className="mb-1 flex min-h-8 items-end justify-between gap-1 text-xs text-slate-600">
        <span className="flex items-start gap-1">
          {icon}<span>{label}<br />ระบบคาด <strong>{expected ?? '...'} {unit}</strong></span>
        </span>
        {onView && (
          <button type="button" onClick={onView}
                  className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700 hover:underline">
            <Eye className="h-3.5 w-3.5" /> View
          </button>
        )}
        {!onView && difference === 0 && <span className="shrink-0 font-semibold text-emerald-600"><Check className="inline h-3.5 w-3.5 align-[-2px]" /> ตรง</span>}
        {!onView && difference != null && difference !== 0 && (
          <span className="shrink-0 font-semibold text-red-600">{difference > 0 ? `เกิน +${difference}` : `ขาด ${difference}`}</span>
        )}
      </div>
      {onView && difference != null && (
        <div className={`mb-1 text-right text-[11px] font-semibold ${difference === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {difference === 0 ? 'ตรง' : difference > 0 ? `เกิน +${difference}` : `ขาด ${difference}`}
        </div>
      )}
      <input type="number" min={0} step={1} inputMode="numeric"
             aria-label={`จำนวนนับจริง ${label}`}
             className="input w-full text-center text-lg font-semibold tabular-nums"
             placeholder="นับได้..." value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
