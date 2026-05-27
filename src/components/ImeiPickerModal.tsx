import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Smartphone } from 'lucide-react';
import { posApi } from '@/api/pos';
import { formatTHB, formatDate } from '@/lib/format';
import type { InStockItem } from '@/types/api';

interface Props {
  onSelect: (item: InStockItem) => void;
  onClose: () => void;
}

/**
 * Modal for cashiers to pick an IMEI without scanning.
 * Shows all IN_STOCK serialized items + filter by SKU/IMEI/SN.
 */
export function ImeiPickerModal({ onSelect, onClose }: Props) {
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['in-stock-items', q],
    queryFn: () => posApi.inStockItems({ q: q || undefined, size: 100 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Smartphone className="h-5 w-5 text-brand-600" />
            เลือก IMEI จากรายการ (เครื่องที่มีในสต็อก)
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              className="input pl-9"
              placeholder="กรอกเพื่อกรอง: SKU / IMEI / Serial Number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">
            💡 คลิกที่แถวเพื่อใส่เข้าตะกร้า · เห็นเฉพาะเครื่องที่ status = IN_STOCK
          </p>

          <div className="max-h-[28rem] overflow-y-auto rounded-md border border-slate-200">
            {isLoading && <p className="p-4 text-center text-sm text-slate-400">กำลังโหลด...</p>}
            {data && data.content.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-400">
                ไม่มีเครื่องในสต็อกตามที่ค้น — ลองค้นด้วยคำอื่น
              </p>
            )}
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">IMEI</th>
                  <th className="px-4 py-2.5">SN</th>
                  <th className="px-4 py-2.5">สินค้า</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5 text-right">ราคา</th>
                  <th className="px-4 py-2.5">รับเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.content.map((it) => (
                  <tr key={it.id}
                      className="cursor-pointer hover:bg-emerald-50"
                      onClick={() => { onSelect(it); onClose(); }}>
                    <td className="px-4 py-2 font-mono text-xs">{it.imei ?? '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{it.serialNumber}</td>
                    <td className="px-4 py-2">
                      <div>{it.productName}</div>
                      {(it.color || it.storage) && (
                        <div className="text-xs text-slate-500">
                          {[it.color, it.storage].filter(Boolean).join(' / ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{it.sku}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatTHB(it.sellingPrice)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDate(it.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && (
            <p className="text-xs text-slate-500">
              พบ {data.totalElements} เครื่อง · แสดง {data.content.length} ตัว
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
