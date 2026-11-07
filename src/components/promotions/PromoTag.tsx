import { BadgePercent } from 'lucide-react';
import { formatDateTime, formatTHB } from '@/lib/format';
import type { PromoInfo } from '@/types/api';

/**
 * ป้ายโปรใต้ราคาปกติ (FIX-217) — ราคาในตารางยังเป็นราคาปกติ · ป้ายบอกว่าช่วงนี้ POS/เว็บขายราคาโปร
 */
export function PromoTag({ promotion }: { promotion?: PromoInfo | null }) {
  if (!promotion) return null;
  const cashChanged = promotion.price != null && promotion.price !== promotion.originalPrice;
  return (
    <div className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
         title={`โปร “${promotion.name}” ถึง ${formatDateTime(promotion.endAt)} — ราคาปกติไม่ถูกแก้`}>
      <BadgePercent className="h-3 w-3" />
      โปร {promotion.name}{cashChanged ? ` · ${formatTHB(promotion.price)}` : ''}
    </div>
  );
}
