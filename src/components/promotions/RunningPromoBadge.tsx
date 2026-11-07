import { useQuery } from '@tanstack/react-query';
import { BadgePercent } from 'lucide-react';
import { promotionsApi, RUNNING_PROMOTIONS_QUERY_KEY } from '@/api/promotions';
import { formatDateTime } from '@/lib/format';
import { storageDigits } from '@/lib/promotions';
import type { RunningPromotion } from '@/types/api';

/** โปรที่กำลังทำงาน (FIX-217) — ตารางผ่อนโชว์ป้ายว่ารุ่น×ความจุนี้ติดโปรอยู่ (ราคาในตาราง = ราคาปกติ) */
export function useRunningPromotions() {
  const { data = [] } = useQuery({
    queryKey: RUNNING_PROMOTIONS_QUERY_KEY,
    queryFn: promotionsApi.running,
    staleTime: 60_000,
  });
  return data;
}

/** โปรของรุ่น×ความจุ — โปรไม่ระบุความจุ = ทุกความจุ */
export function promotionsFor(list: RunningPromotion[], group: 'NEW' | 'SECOND_HAND', productId: string, storage: string | null) {
  const digits = storageDigits(storage);
  return list.filter((p) => p.conditionGroup === group && p.productId === productId
    && (!p.storageDigits || p.storageDigits === digits));
}

export function RunningPromoBadge({ promos }: { promos: RunningPromotion[] }) {
  if (promos.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {promos.map((p) => (
        <span key={p.id} title={`ราคาโปรถึง ${formatDateTime(p.endAt)} · ราคาในตารางคือราคาปกติ (ไม่ถูกแก้)`}
              className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          <BadgePercent className="h-3 w-3" /> โปร {p.name}
        </span>
      ))}
    </div>
  );
}
