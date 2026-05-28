import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Smartphone } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { SerialsModal } from '@/components/SerialsModal';
import { formatNumber, formatDateTime } from '@/lib/format';

export function InventoryPage() {
  const [page, setPage] = useState(0);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [serialsFor, setSerialsFor] = useState<{ variantId: string; productName: string; sku: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { page, lowStockOnly }],
    queryFn: () => inventoryApi.list({ page, size: 20, lowStockOnly }),
  });

  const handleLookup = async () => {
    if (!searchQuery.trim()) return;
    try {
      const result = await inventoryApi.lookupSerial(searchQuery.trim());
      setScanResult(`พบ: ${result.serialNumber} | IMEI: ${result.imei ?? '-'} | Status: ${result.status}`);
    } catch {
      setScanResult(`ไม่พบ "${searchQuery}"`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-slate-500">รายการสต็อกทั้งหมด</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => { setLowStockOnly(e.target.checked); setPage(0); }}
          />
          แสดงเฉพาะของน้อย
        </label>
      </div>

      {/* IMEI/SN Scanner */}
      <div className="card">
        <div className="card-body">
          <label className="mb-1 block text-sm font-medium">สแกน/ค้นหา IMEI หรือ Serial Number</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input"
              placeholder="กรอกหรือสแกน IMEI / SN"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
            />
            <button onClick={handleLookup} className="btn-primary">
              <Search className="h-4 w-4" /> ค้นหา
            </button>
          </div>
          {scanResult && (
            <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">{scanResult}</div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">SKU</th>
                <th className="px-5 py-2.5">Product</th>
                <th className="px-5 py-2.5">Variant</th>
                <th className="px-5 py-2.5 text-right">Qty</th>
                <th className="px-5 py-2.5 text-right">Reserved</th>
                <th className="px-5 py-2.5 text-right">Available</th>
                <th className="px-5 py-2.5 text-right">Reorder</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Updated</th>
                <th className="px-5 py-2.5 text-right">เครื่อง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {data?.content.map((row) => (
                <tr key={row.variantId} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs">{row.sku}</td>
                  <td className="px-5 py-3 font-medium">{row.productName}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {[row.color, row.storage].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{formatNumber(row.quantity)}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{formatNumber(row.reservedQty)}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{formatNumber(row.availableQty)}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{formatNumber(row.reorderPoint)}</td>
                  <td className="px-5 py-3">
                    {row.lowStock ? <span className="badge-amber">Low Stock</span> : <span className="badge-green">OK</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(row.updatedAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                      title="ดูเครื่องทีละชิ้น (IMEI) + ส่งซ่อม/เคลม"
                      onClick={() => setSerialsFor({
                        variantId: row.variantId, productName: row.productName, sku: row.sku,
                      })}>
                      <Smartphone className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.content.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-slate-400">ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
            <div>หน้า {data.page + 1} / {data.totalPages} ({formatNumber(data.totalElements)} รายการ)</div>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              <button className="btn-secondary" disabled={data.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </div>
          </div>
        )}
      </div>

      {serialsFor && (
        <SerialsModal
          variantId={serialsFor.variantId}
          productName={serialsFor.productName}
          sku={serialsFor.sku}
          onClose={() => setSerialsFor(null)}
        />
      )}
    </div>
  );
}
