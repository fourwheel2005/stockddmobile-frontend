import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PackagePlus, Plus, Eye, Sparkles } from 'lucide-react';
import { productsApi } from '@/api/products';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatTHB } from '@/lib/format';
import { SearchVariantBar } from '@/components/receive/SearchVariantBar';
import { FastInboundModal } from '@/components/receive/FastInboundModal';
import type { VariantResponse } from '@/types/api';

/**
 * Unified Products + Receive Stock page.
 *
 * <h3>Flow</h3>
 *  1. Default view: products list (browse)
 *  2. Type/scan in search bar → switches to variant search results
 *  3. Per variant row:
 *      - "📥 รับเพิ่ม" → opens FastInboundModal (in-place, no navigate)
 *      - "👁 ดู" → navigates to /products/:id
 *  4. Empty search results → CTA "ลงทะเบียนสินค้าใหม่ '<query>'" → /products/new?name=
 *  5. Header button "➕ สร้างสินค้าใหม่" — always visible
 */
export function ProductsPage() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [receiveTarget, setReceiveTarget] = useState<VariantResponse | null>(null);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  // List (default view)
  const productsList = useQuery({
    queryKey: ['products', { page }],
    queryFn: () => productsApi.list({ page, size: 20 }),
    enabled: !query.trim(),
  });

  // Search variants (when user types)
  const variantSearch = useQuery({
    queryKey: ['variant-search', query],
    queryFn: () => productsApi.searchVariants(query, 0, 30),
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  });

  const isSearchMode = query.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <PackagePlus className="h-6 w-6 text-brand-600" />
            สินค้า + คลัง
          </h1>
          <p className="text-sm text-slate-500">
            ค้นหา / ยิงสแกน → รับของเพิ่ม · ไม่เจอ → ลงทะเบียนใหม่
          </p>
        </div>
        <Link to="/products/new" className="btn-primary bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> สร้างสินค้าใหม่
        </Link>
      </div>

      {/* Search bar */}
      <SearchVariantBar
        autoFocus
        value={query}
        onChange={setQuery}
        loading={variantSearch.isFetching}
      />

      {/* SEARCH RESULTS view */}
      {isSearchMode && (
        <div className="space-y-3">
          {variantSearch.isFetching && (
            <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
              กำลังค้นหา...
            </div>
          )}

          {!variantSearch.isFetching && variantSearch.data && variantSearch.data.content.length === 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-amber-500" />
              <p className="mt-2 text-sm font-semibold text-amber-900">
                ไม่พบสินค้าที่ตรงกับ "{query}"
              </p>
              <p className="mt-1 text-xs text-amber-800">
                ถ้าเป็นสินค้าใหม่ที่ยังไม่เคยมีในระบบ — กดด้านล่างเพื่อลงทะเบียน
              </p>
              <Link
                to={`/products/new?name=${encodeURIComponent(query)}`}
                className="btn-primary mt-3 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4" />
                ลงทะเบียน "{query.slice(0, 30)}{query.length > 30 ? '…' : ''}"
              </Link>
            </div>
          )}

          {!variantSearch.isFetching && variantSearch.data && variantSearch.data.content.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>พบ <strong className="text-slate-700">{variantSearch.data.totalElements}</strong> รายการ</span>
                <Link
                  to={`/products/new?name=${encodeURIComponent(query)}`}
                  className="text-brand-600 hover:underline">
                  + ไม่มีตัวที่ใช่ → สร้างใหม่
                </Link>
              </div>
              <div className="space-y-2">
                {variantSearch.data.content.map((v) => (
                  <VariantRow key={v.id} variant={v} onReceive={() => setReceiveTarget(v)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* PRODUCTS LIST view (default — no search) */}
      {!isSearchMode && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">ชื่อสินค้า</th>
                  <th className="px-5 py-2.5">ยี่ห้อ</th>
                  <th className="px-5 py-2.5">รุ่น</th>
                  <th className="px-5 py-2.5">หมวดหมู่</th>
                  <th className="px-5 py-2.5">ประเภท</th>
                  <th className="px-5 py-2.5">สถานะ</th>
                  <th className="px-5 py-2.5">สร้าง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productsList.isLoading && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
                )}
                {productsList.data?.content.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{p.brand}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.modelNumber ?? '-'}</td>
                    <td className="px-5 py-3">{p.categoryName}</td>
                    <td className="px-5 py-3">
                      {p.serialized
                        ? <span className="badge-blue">นับชิ้น</span>
                        : <span className="badge-slate">นับจำนวน</span>}
                    </td>
                    <td className="px-5 py-3">
                      {p.active ? <span className="badge-green">ใช้งาน</span> : <span className="badge-red">ปิด</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
                {productsList.data && productsList.data.content.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    ยังไม่มีสินค้า — กด "สร้างสินค้าใหม่" เพื่อเริ่ม
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {productsList.data && productsList.data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
              <div>หน้า {productsList.data.page + 1} / {productsList.data.totalPages}</div>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
                <button className="btn-secondary" disabled={productsList.data.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hint footer (only on default view) */}
      {!isSearchMode && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          💡 <strong>เคล็ดลับ:</strong> ใช้ช่องค้นหาด้านบน → ยิงสแกน IMEI / พิมพ์ชื่อสินค้า เพื่อรับของเข้าด่วน
        </div>
      )}

      {/* RBAC note for STAFF */}
      {!canEdit && (
        <p className="text-center text-xs text-slate-400">
          คุณคือ STAFF — ดู + รับของเพิ่มได้ · สร้าง/แก้ไขสินค้าต้องเป็น ADMIN/MANAGER
        </p>
      )}

      {/* Receive modal */}
      {receiveTarget && (
        <FastInboundModal
          variant={receiveTarget}
          onClose={() => setReceiveTarget(null)}
          onDone={() => {
            setReceiveTarget(null);
            variantSearch.refetch();
          }}
        />
      )}
    </div>
  );
}

/* ─── Variant row component ─────────────────────────────────────── */
function VariantRow({ variant, onReceive }: { variant: VariantResponse; onReceive: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-sm">
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100">
        {variant.imageUrl
          ? <img src={variant.imageUrl} alt="" className="h-full w-full object-cover" />
          : <PackagePlus className="h-6 w-6 text-slate-400" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {variant.productName}
          {(variant.color || variant.storage) && (
            <span className="text-slate-500"> · {[variant.color, variant.storage].filter(Boolean).join(' / ')}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-slate-500">{variant.sku}</span>
          {variant.barcode && <span className="text-slate-400">· 📊 {variant.barcode}</span>}
        </div>
        <div className="mt-1 text-xs text-emerald-700">
          💰 {formatTHB(variant.sellingPrice)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          to={`/products/${variant.productId}`}
          className="rounded-md border border-slate-200 p-2 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
          title="ดูรายละเอียด">
          <Eye className="h-4 w-4" />
        </Link>
        <button
          onClick={onReceive}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
          📥 รับเพิ่ม
        </button>
      </div>
    </div>
  );
}
