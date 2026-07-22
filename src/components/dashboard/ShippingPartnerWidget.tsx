import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck, RefreshCw } from 'lucide-react';
import { posApi } from '@/api/pos';
import { formatTHB } from '@/lib/format';
import { shopDayKey } from '@/lib/datetime';
import type { ShippingPartner } from '@/types/api';

interface Props {
  className?: string;
}

const PARTNER_LABEL: Record<ShippingPartner, { label: string; icon: string }> = {
  ICE:        { label: 'น้ำแข็ง',  icon: '🧊' },
  YUEM_MAI:   { label: 'ยืมมั้ย',  icon: '🤝' },
  PEE_KEAW:   { label: 'พี่เขียว', icon: '🟢' },
  GREATER:    { label: 'กรีทเตอร์', icon: '⭐' },
  RED_HEAT:   { label: 'เรด ฮีท',  icon: '🔥' },
  AMP_MOBILE: { label: 'แอมป์ โมบาย', icon: '📱' },
  PICKUP:     { label: 'มารับเอง', icon: '🏪' },
  OTHER:      { label: 'อื่นๆ',    icon: '📦' },
};

type Range = 'today' | '7d' | '30d';

const toIso = shopDayKey;   // วันของร้าน ไม่ใช่วัน UTC
function rangeToDates(r: Range): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (r === '7d')  from.setDate(from.getDate() - 6);
  if (r === '30d') from.setDate(from.getDate() - 29);
  return { from: toIso(from), to: toIso(to) };
}

/**
 * Q4 — รายงานต่อ shipping partner (วันนี้ / 7 วัน / 30 วัน)
 */
export function ShippingPartnerWidget({ className = '' }: Props) {
  const [range, setRange] = useState<Range>('today');
  const dates = rangeToDates(range);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['shipping-report', dates],
    queryFn: () => posApi.shippingPartnerReport(dates),
    staleTime: 60_000,
  });

  const rows = (data?.rows ?? []).slice().sort((a, b) => b.totalFee - a.totalFee);
  const maxFee = Math.max(1, ...rows.map((r) => r.totalFee));

  return (
    <div className={`card ${className}`}>
      <div className="card-header flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <Truck className="h-5 w-5 text-brand-600" />
          พาร์ทเนอร์จัดส่ง
        </span>
        <div className="flex items-center gap-1">
          {(['today', '7d', '30d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                range === r ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              {r === 'today' ? 'วันนี้' : r === '7d' ? '7 วัน' : '30 วัน'}
            </button>
          ))}
          <button onClick={() => refetch()} className="ml-1 rounded p-1 text-slate-500 hover:bg-slate-100"
                  title="รีเฟรช">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="card-body">
        {/* Summary */}
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="ออเดอร์" value={String(data?.totalShipments ?? 0)} />
          <Stat label="ค่าส่งรวม" value={formatTHB(data?.totalShippingFee ?? 0)} />
          <Stat label="เก๊ะออก" value={formatTHB(data?.totalRegister ?? 0)} />
        </div>

        {/* Per-partner bar */}
        {rows.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-4">
            ไม่มีข้อมูลในช่วงเวลานี้
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const meta = PARTNER_LABEL[r.partner];
              const pct = (r.totalFee / maxFee) * 100;
              return (
                <li key={r.partner} className="text-sm">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>{meta.icon}</span>
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-xs text-slate-400">· {r.orderCount} บิล</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-bold">{formatTHB(r.totalFee)}</span>
                      {(r.grandpaFee + r.grandmaFee) > 0 && (
                        <span className="ml-1 text-[10px] text-slate-500">
                          (👴 {formatTHB(r.grandpaFee)} · 👵 {formatTHB(r.grandmaFee)})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Owner totals footer */}
        {data && (data.totalGrandpa + data.totalGrandma) > 0 && (
          <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            👴 ตา ออกค่าส่ง <strong>{formatTHB(data.totalGrandpa)}</strong>
            {' · '}
            👵 ยาย ออกค่าส่ง <strong>{formatTHB(data.totalGrandma)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}
