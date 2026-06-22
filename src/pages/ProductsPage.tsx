import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PackagePlus, Plus, Eye, Sparkles, FolderOpen } from 'lucide-react';
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
  const [searchParams] = useSearchParams();
  // pre-fill search จาก ?q= (deep-link จากหน้าลงทะเบียน "เพิ่มเครื่องเข้ารุ่นนี้")
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [receiveTarget, setReceiveTarget] = useState<VariantResponse | null>(null);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  // List (default view) — ดึงทั้งหมด แล้วจัดกลุ่มตามรุ่น (album-as-heading) ฝั่ง client
  const productsList = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 0, size: 500 }),
    enabled: !query.trim(),
  });

  // จัดกลุ่มสินค้าตามชื่อรุ่น (iPhone 17 / iPhone 11 / iPhone 11 Pro แยกหัวข้อ) เรียง ก-ฮ/A-Z
  const albums = useMemo(() => {
    const rows = productsList.data?.content ?? [];
    const map = new Map<string, { name: string; items: typeof rows }>();
    for (const p of rows) {
      const key = (p.name ?? '').trim().toLowerCase();
      const g = map.get(key) ?? { name: p.name, items: [] };
      g.items.push(p);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [productsList.data]);

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

      {/* PRODUCTS LIST view (default — no search) — จัดกลุ่มเป็น "อัลบั้มตามรุ่น" */}
      {!isSearchMode && (
        <div className="space-y-4">
          {productsList.isLoading && (
            <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">กำลังโหลด...</div>
          )}
          {productsList.data && albums.length === 0 && (
            <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
              ยังไม่มีสินค้า — กด "สร้างสินค้าใหม่" เพื่อเริ่ม
            </div>
          )}

          {albums.map((album) => (
            <div key={album.name} className="card overflow-hidden">
              {/* หัวข้ออัลบั้ม = ชื่อรุ่น */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-brand-500" />
                  <h3 className="text-base font-bold text-slate-800">{album.name}</h3>
                  <span className="rounded-full bg-slate-200 px-2 text-xs font-medium text-slate-600">
                    {album.items.length} รายการ
                  </span>
                </div>
                {canEdit && (
                  // เข้าหมวด (product เดิม) ไปเพิ่มสี/เครื่อง — ไม่สร้าง product ซ้ำ
                  <Link
                    to={`/products/${album.items[0].id}`}
                    className="btn-secondary text-sm"
                    title="เปิดรุ่นนี้ → เพิ่มสี/เครื่อง">
                    <Plus className="h-4 w-4" /> เพิ่มสี/เครื่อง
                  </Link>
                )}
              </div>
              {/* รายการในอัลบั้ม */}
              <div className="divide-y divide-slate-100">
                {album.items.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <Link to={`/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{p.brand || 'Apple'}</span>
                        <span>· {p.categoryName}</span>
                        {p.serialized
                          ? <span className="badge-blue">นับชิ้น</span>
                          : <span className="badge-slate">นับจำนวน</span>}
                        {!p.active && <span className="badge-red">ปิด</span>}
                        <span className="text-slate-400">· {formatDate(p.createdAt)}</span>
                      </div>
                    </div>
                    <Link
                      to={`/products/${p.id}`}
                      className="shrink-0 rounded-md border border-slate-200 p-2 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                      title="ดูรายละเอียด + เครื่องในรุ่น">
                      <Eye className="h-4 w-4" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
