import { useQuery } from '@tanstack/react-query';
import { History, X } from 'lucide-react';
import { installmentPriceHistoryApi, type InstallmentPriceHistoryItem } from '@/api/installmentPriceHistory';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { formatDateTime, formatTHB } from '@/lib/format';
import { parseTermTable } from '@/lib/installmentTable';

interface Props {
  productId: string;
  productName: string;
  storage: string;
  condition: 'NEW' | 'SECOND_HAND';
  onClose: () => void;
}

const SOURCE_TH: Record<string, string> = {
  FIRSTHAND_TABLE: 'ตารางผ่อนมือ 1',
  SECONDHAND_TABLE: 'ตารางผ่อนมือ 2',
};

export function sourceLabel(source: string | null): string {
  if (!source) return '-';
  if (source.startsWith('SKU_EDIT:')) return `แก้ SKU ${source.slice('SKU_EDIT:'.length)}`;
  return SOURCE_TH[source] ?? source;
}

/** สรุปค่างวดเป็นข้อความสั้น: "10ด 2,190 · 24ด 1,090 (ดาวน์ 5,000)" */
export function termsSummary(json: string | null): string {
  const table = parseTermTable(json);
  const months = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (months.length === 0) return '-';
  return months.map((m) => {
    const cell = table[m];
    const down = cell.down.trim() !== '' ? ` (ดาวน์ ${formatTHB(Number(cell.down))})` : '';
    return `${m}ด ${formatTHB(Number(cell.monthly))}${down}`;
  }).join(' · ');
}

/** เรียกดูราคาซื้อสด/ดาวน์/ค่างวดย้อนหลังของ รุ่น×ความจุ (FIX-202) — แถวบนสุด = ล่าสุด */
export function PriceHistoryModal({ productId, productName, storage, condition, onClose }: Props) {
  useModalChrome(onClose);
  const { data, isLoading } = useQuery({
    queryKey: ['installment-price-history', productId, storage, condition],
    queryFn: () => installmentPriceHistoryApi.list({ productId, storage, condition }),
  });
  const rows: InstallmentPriceHistoryItem[] = data ?? [];

  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[6vh] backdrop-blur-sm animate-modal-fade-in">
      <div onClick={(e) => e.stopPropagation()}
           className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <History className="h-5 w-5 text-brand-600" />
            ประวัติราคา — {productName} {storage}GB ({condition === 'NEW' ? 'มือ 1' : 'มือ 2'})
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">เมื่อ</th>
                <th className="px-4 py-2 text-right">ราคาซื้อสด</th>
                <th className="px-4 py-2 text-right">ดาวน์หลัก</th>
                <th className="px-4 py-2">ค่างวด</th>
                <th className="px-4 py-2">โดย / ที่มา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">ยังไม่มีประวัติ — จะเริ่มบันทึกตั้งแต่การตั้งราคาครั้งถัดไป</td></tr>
              )}
              {rows.map((h, i) => (
                <tr key={h.id} className={i === 0 ? 'bg-emerald-50/50' : ''}>
                  <td className="px-4 py-2 text-xs text-slate-600">{formatDateTime(h.changedAt)}{i === 0 && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">ปัจจุบัน</span>}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{h.cashPrice != null ? formatTHB(h.cashPrice) : '-'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{h.downPayment != null ? formatTHB(h.downPayment) : '-'}</td>
                  <td className="px-4 py-2 text-xs">{termsSummary(h.installmentTerms)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{h.changedBy ?? '-'} · {sourceLabel(h.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
