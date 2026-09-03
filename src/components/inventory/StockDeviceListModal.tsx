import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Smartphone, X, TriangleAlert } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { formatDateTime, formatNumber } from '@/lib/format';

export type StockCheckCondition = 'NEW' | 'SECOND_HAND';
export type StockCheckScope = 'READY' | 'PHYSICAL';

interface Props {
  condition: StockCheckCondition;
  scope: StockCheckScope;
  branchId?: string;
  expectedTotal?: number | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  IN_STOCK: { text: 'พร้อมขาย', cls: 'badge-green' },
  PENDING_INTAKE: { text: 'รอลงสต๊อก', cls: 'badge-amber' },
  RESERVED: { text: 'จองแล้ว', cls: 'badge-amber' },
  DEFECTIVE: { text: 'เสีย/ซ่อม', cls: 'badge-amber' },
  RETURNED: { text: 'รับคืนรอตรวจ', cls: 'bg-slate-200 text-slate-700 rounded-full px-2 py-0.5 text-xs font-medium' },
};

export function stockDeviceListKey(
  condition: StockCheckCondition,
  scope: StockCheckScope,
  branchId: string | undefined,
  page: number,
  q: string,
) {
  return ['inventory', 'stock-check-devices', condition, scope, branchId ?? 'all', page, q] as const;
}

/** Drill-down รายเครื่องสำหรับเทียบยอดการ์ดกับเครื่องจริง โดยไม่แสดงต้นทุน. */
export function StockDeviceListModal({ condition, scope, branchId, expectedTotal, onClose }: Props) {
  useModalChrome(onClose);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const data = useQuery({
    queryKey: stockDeviceListKey(condition, scope, branchId, page, q),
    queryFn: () => inventoryApi.stockCheckDevices({
      condition,
      branchId,
      includeHeld: scope === 'PHYSICAL',
      q: q || undefined,
      page,
      size: 50,
    }),
  });

  const groupLabel = condition === 'NEW' ? 'มือ 1 (ใหม่)' : 'มือ 2 (มือสอง)';
  const scopeLabel = scope === 'READY'
    ? 'พร้อมขายเท่านั้น'
    : 'เครื่องที่ควรพบจริงในร้าน (พร้อมขาย + รอดำเนินการ)';
  const totalChanged = expectedTotal != null && data.data && data.data.totalElements !== expectedTotal;

  const search = () => {
    setPage(0);
    setQ(searchInput.trim());
  };

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/65 p-2.5 pt-[3vh] backdrop-blur-sm animate-modal-fade-in sm:p-4 sm:pt-[5vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-device-list-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <div>
            <h2 id="stock-device-list-title" className="flex items-center gap-2 text-base font-bold sm:text-lg">
              <Smartphone className="h-5 w-5 text-brand-600" /> รายการเครื่อง{groupLabel}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{scopeLabel}{branchId ? ' · เฉพาะสาขาที่เลือก' : ' · ทุกสาขา'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-slate-50/70 px-4 py-3 sm:px-5">
          <form className="flex w-full max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); search(); }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="ค้นหารุ่น / รหัส / IMEI / Serial"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <button type="submit" className="btn-secondary"><Search className="h-4 w-4" /> ค้นหา</button>
          </form>
          <div className="text-sm text-slate-600">
            พบ <strong className="text-slate-900">{data.data ? formatNumber(data.data.totalElements) : '—'} เครื่อง</strong>
            {expectedTotal != null && <span> · ยอดบนการ์ด {formatNumber(expectedTotal)}</span>}
          </div>
        </div>

        {totalChanged && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
            <TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /> จำนวนเปลี่ยนหลังเปิดรายการ อาจมีการขาย/รับเข้า/เปลี่ยนสถานะล่าสุด — ใช้รายการปัจจุบันเป็นข้อมูลล่าสุด
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">รหัส</th>
                <th className="px-4 py-2.5">รุ่น</th>
                <th className="px-4 py-2.5">สี / ความจุ</th>
                <th className="px-4 py-2.5">IMEI / Serial</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5">สาขา</th>
                <th className="px-4 py-2.5">รับเข้า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.isLoading && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">กำลังโหลดรายการ...</td></tr>}
              {data.isError && <tr><td colSpan={7} className="px-4 py-10 text-center text-red-600">โหลดรายการไม่สำเร็จ กรุณาปิดแล้วลองใหม่</td></tr>}
              {data.data?.content.map((item) => {
                const status = STATUS_LABEL[item.status] ?? { text: item.status, cls: 'badge-amber' };
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><span className="rounded bg-brand-100 px-1.5 font-mono text-xs font-semibold text-brand-700">{item.stockCode ?? '—'}</span></td>
                    <td className="px-4 py-3 font-medium">{item.productName ?? item.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{[item.deviceColor, item.deviceStorage].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3"><div className="font-mono text-xs">{item.imei ?? 'ไม่มี IMEI'}</div><div className="font-mono text-xs text-slate-400">SN: {item.serialNumber}</div></td>
                    <td className="px-4 py-3"><span className={status.cls}>{status.text}</span></td>
                    <td className="px-4 py-3 text-slate-600">{item.branchName ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(item.receivedAt)}</td>
                  </tr>
                );
              })}
              {data.data && data.data.content.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">ไม่พบเครื่องในกลุ่มนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm sm:px-5">
          <span className="text-slate-600">หน้า {data.data ? data.data.page + 1 : 1} / {data.data ? Math.max(1, data.data.totalPages) : 1}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={page === 0 || data.isFetching} onClick={() => setPage((current) => current - 1)}>ก่อนหน้า</button>
            <button type="button" className="btn-secondary" disabled={!data.data || data.data.last || data.isFetching} onClick={() => setPage((current) => current + 1)}>ถัดไป</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
