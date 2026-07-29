import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Smartphone, CheckCircle2 } from 'lucide-react';
import { posApi } from '@/api/pos';
import { formatTHB, formatDate } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { InStockItem } from '@/types/api';

interface Props {
  /** ids of items already in the cart — used to gray-out + block double-add */
  selectedIds?: string[];
  /** เพิ่ม 1 ตัวเข้าตะกร้า (modal คงเปิดต่อ ให้กดเพิ่มได้หลายตัว) */
  onSelect: (item: InStockItem) => void;
  onClose: () => void;
}

/**
 * Modal for cashiers to pick IMEI(s) without scanning.
 *
 * UX (รองรับการเพิ่มหลายตัว):
 *   - คลิกแถว → เพิ่มเข้าตะกร้าทันที, modal คงเปิดอยู่
 *   - แถวที่อยู่ในตะกร้าแล้วจะถูก gray-out + ติ๊กเขียว + คลิกไม่ได้
 *   - กดปุ่ม "เสร็จสิ้น" หรือ X ที่หัว modal เพื่อปิดเอง
 */
export function ImeiPickerModal({ selectedIds = [], onSelect, onClose }: Props) {
  const [q, setQ] = useState('');
  useModalChrome(onClose);

  const { data, isLoading } = useQuery({
    queryKey: ['in-stock-items', q],
    queryFn: () => posApi.inStockItems({ q: q || undefined, size: 100 }),
  });

  const selectedSet = new Set(selectedIds);

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Smartphone className="h-5 w-5 text-brand-600" />
            เลือก IMEI จากรายการ (เครื่องที่มีในสต็อก)
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิด"
            title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              className="input pl-9"
              placeholder="กรอกเพื่อกรอง: SKU / IMEI / Serial Number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-500">
              💡 คลิกแถวเพื่อเพิ่มเข้าตะกร้า (เลือกได้หลายเครื่อง) · เห็นเฉพาะเครื่องที่ status = IN_STOCK
            </p>
            <p className="font-semibold text-emerald-700">
              ในตะกร้าแล้ว: {selectedSet.size} เครื่อง
            </p>
          </div>

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
                  <th className="px-4 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5">IMEI</th>
                  <th className="px-4 py-2.5">SN</th>
                  <th className="px-4 py-2.5">สินค้า</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5 text-right">ราคา</th>
                  <th className="px-4 py-2.5">รับเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.content.map((it) => {
                  const inCart = selectedSet.has(it.id);
                  return (
                    <tr
                      key={it.id}
                      className={
                        inCart
                          ? 'cursor-not-allowed bg-emerald-50/60 text-slate-500'
                          : 'cursor-pointer hover:bg-emerald-50'
                      }
                      onClick={() => {
                        if (inCart) return;
                        onSelect(it);
                        // ไม่ปิด modal — ให้ผู้ใช้เลือกตัวถัดไปได้เลย
                      }}
                      title={inCart ? 'เครื่องนี้อยู่ในตะกร้าแล้ว' : 'คลิกเพื่อเพิ่ม'}
                    >
                      <td className="px-4 py-2 text-center">
                        {inCart && <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{it.imei ?? '-'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{it.serialNumber}</td>
                      <td className="px-4 py-2">
                        <div className={inCart ? 'line-through' : ''}>{it.productName}</div>
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            {data && (
              <p className="text-xs text-slate-500">
                พบ {data.totalElements} เครื่อง · แสดง {data.content.length} ตัว
              </p>
            )}
            <button onClick={onClose} className="btn-primary ml-auto bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              เสร็จสิ้น ({selectedSet.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
