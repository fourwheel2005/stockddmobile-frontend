import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PackagePlus, Plus, Eye, Sparkles, FolderOpen, Trash2, ArrowDownToLine, Smartphone, Inbox, Info, Wallet, X, Barcode } from 'lucide-react';
import { productsApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatTHB } from '@/lib/format';
import { AuthImage } from '@/components/AuthImage';
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
 *      - "รับเข้า" → opens FastInboundModal (in-place, no navigate)
 *      - "ดู" → navigates to /products/:id
 *  4. Empty search results → CTA "ลงทะเบียนสินค้าใหม่ '<query>'" → /products/new?name=
 *  5. Header button "สร้างสินค้าใหม่" — always visible
 */
export function ProductsPage() {
  const [searchParams] = useSearchParams();
  // pre-fill search จาก ?q= (deep-link จากหน้าลงทะเบียน "เพิ่มเครื่องเข้ารุ่นนี้")
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [receiveTarget, setReceiveTarget] = useState<VariantResponse | null>(null);
  // โหมดรับเข้า (FIX-114): กดปุ่ม "รับสินค้าเข้า" = เข้าโหมดจริง — แบนเนอร์บอกขั้นถัดไป
  // + กดแถวผลค้นหาที่ไหนก็ได้เปิดฟอร์มรับเข้าเลย (เดิมปุ่มแค่ focus ช่องค้นหาเงียบๆ)
  const [receiveIntent, setReceiveIntent] = useState(false);
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'));
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: (id: string) => productsApi.deactivate(id),
    onSuccess: () => {
      toast.success('ลบสินค้าแล้ว');
      qc.invalidateQueries({ queryKey: ['products', 'all'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const handleDelete = (p: { id: string; name: string }) => {
    if (!confirm(`ลบสินค้า "${p.name}" ?\nซ่อนออกจากรายการ · ข้อมูล/ประวัติยังอยู่ (กู้คืนได้)`)) return;
    del.mutate(p.id);
  };

  // รวมรุ่นซ้ำ (เช่น "iPhone 13" หลายอัน) → พรีวิว (dry-run) ก่อน แล้วค่อยลงมือจริง (FIX-100)
  const dedup = useMutation({
    mutationFn: async () => {
      const preview = await productsApi.dedup(false);
      if (preview.duplicateGroups === 0) { toast('ไม่พบรุ่นซ้ำ — ทุกอย่างเรียบร้อยแล้ว'); return null; }
      const ok = confirm(
        `พบรุ่นซ้ำ ${preview.duplicateGroups} รุ่น\n\n` +
        `• ย้าย SKU/เครื่องทั้งหมด ${preview.variantsMoved} รายการ ไปรวมที่ "รุ่นหลัก" (ตัวเก่าสุด)\n` +
        `• ปิดตัวซ้ำที่ว่างแล้ว ${preview.productsDeactivated} อัน\n\n` +
        `ข้อมูล/ประวัติการขายไม่หาย · ย้อนกลับได้\nยืนยันรวมเลยไหม?`,
      );
      if (!ok) return null;
      return productsApi.dedup(true);
    },
    onSuccess: (res) => {
      if (!res) return;
      toast.success(`รวมสำเร็จ ${res.duplicateGroups} รุ่น · ย้าย ${res.variantsMoved} SKU`);
      qc.invalidateQueries({ queryKey: ['products', 'all'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

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
      if (!p.active) continue;   // ลบแล้ว (ปิด) → ซ่อนออกจากรายการ (FIX-076)
      const key = (p.name ?? '').trim().toLowerCase();
      const g = map.get(key) ?? { name: p.name, items: [] };
      g.items.push(p);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [productsList.data]);

  // มีรุ่นที่มี product ซ้ำ (>1 อันในโฟลเดอร์เดียว) → โชว์ปุ่ม "รวมรุ่นซ้ำ" ให้ ADMIN
  const hasDuplicates = useMemo(() => albums.some((a) => a.items.length > 1), [albums]);

  // Search variants (when user types)
  const variantSearch = useQuery({
    queryKey: ['variant-search', query],
    queryFn: () => productsApi.searchVariants(query, 0, 30),
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  });

  const isSearchMode = query.trim().length > 0;
  // เลขยาวๆ = น่าจะเป็น IMEI/Serial ไม่ใช่ชื่อรุ่น (FIX-124)
  const looksLikeCode = /^\d{8,}$/.test(query.trim());
  // ค้น "ตัวเครื่อง" ด้วย IMEI/Serial ควบคู่ — เดิมช่องนี้ค้นแค่ระดับ SKU ทำให้ยิง IMEI แล้วไม่เจอ
  // ทั้งที่เครื่องอยู่ในระบบ แถมเสนอสร้างรุ่นชื่อเป็นเลข IMEI (FIX-124)
  const serialLookup = useQuery({
    queryKey: ['serial-lookup', query],
    queryFn: () => inventoryApi.lookupSerial(query.trim()),
    enabled: isSearchMode && query.trim().length >= 8,
    retry: false,       // 404 = ไม่เจอ (ปกติ) ไม่ต้อง retry
    staleTime: 10_000,
  });
  const foundDevice = serialLookup.data ?? null;

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
        <div className="flex flex-wrap items-center gap-2">
          {/* งานหลักประจำวัน = รับของเข้า → ปุ่มเด่น เข้า "โหมดรับเข้า" จริง (FIX-114) */}
          <button type="button"
                  onClick={() => { setReceiveIntent(true); document.getElementById('receive-search')?.focus(); }}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700">
            <ArrowDownToLine className="h-4 w-4" /> รับสินค้าเข้า
          </button>
          {isAdmin && hasDuplicates && !isSearchMode && (
            <button type="button"
                    onClick={() => dedup.mutate()}
                    disabled={dedup.isPending}
                    className="btn-secondary border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                    title="รวมรุ่นที่มีหลาย product ซ้ำให้เหลือรุ่นเดียว (ย้าย SKU ไปรุ่นหลัก · ข้อมูลไม่หาย)">
              <FolderOpen className="h-4 w-4" /> {dedup.isPending ? 'กำลังรวม…' : 'รวมรุ่นซ้ำ'}
            </button>
          )}
          <Link to="/products/new" className="btn-secondary"
                title="สร้างข้อมูลรุ่นใหม่ (แคตตาล็อก) — ถ้าของมาถึงร้าน ใช้ปุ่ม 'รับสินค้าเข้า' แทน">
            <Plus className="h-4 w-4" /> สร้างรุ่นใหม่
          </Link>
        </div>
      </div>

      {/* โหมดรับเข้า — บอกขั้นถัดไปชัดๆ (ไม่ต้องเดาว่ากดปุ่มแล้วเกิดอะไร) */}
      {receiveIntent && (
        <div className="flex items-start justify-between gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3">
          <div className="text-sm text-emerald-900">
            <span className="font-semibold"><Inbox className="inline h-4 w-4 align-[-2px]" /> โหมดรับสินค้าเข้า</span> — ยิงสแกน IMEI หรือพิมพ์ชื่อรุ่น/สี
            แล้ว<strong>กดรายการที่ตรง</strong> ระบบจะเปิดฟอร์มรับเข้าให้ทันที
            · ไม่เจอในระบบ = มีปุ่ม "สร้างรุ่นใหม่ + รับเข้า" ให้เลย
          </div>
          <button type="button" onClick={() => setReceiveIntent(false)}
                  className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100" title="ออกจากโหมดรับเข้า">
            <X className="inline h-3.5 w-3.5 align-[-2px]" />
          </button>
        </div>
      )}

      {/* Search bar */}
      <SearchVariantBar
        autoFocus
        inputId="receive-search"
        value={query}
        onChange={setQuery}
        loading={variantSearch.isFetching}
      />

      {/* SEARCH RESULTS view */}
      {isSearchMode && (
        <div className="space-y-3">
          {/* เจอ "ตัวเครื่อง" จาก IMEI/Serial — โชว์การ์ดเครื่อง + ทางไปต่อ (FIX-124) */}
          {foundDevice && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-slate-800">
                    เจอเครื่องในระบบ: {foundDevice.productName ?? foundDevice.sku}
                    <span className="font-normal text-slate-500">
                      {' '}· {[foundDevice.deviceColor, foundDevice.deviceStorage].filter(Boolean).join(' / ')}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-600">
                    {foundDevice.stockCode && <span className="mr-2 rounded bg-emerald-100 px-1 font-semibold text-emerald-800">{foundDevice.stockCode}</span>}
                    IMEI/SN: {foundDevice.imei ?? foundDevice.serialNumber}
                  </div>
                </div>
              </div>
              {foundDevice.productId && (
                <Link to={`/products/${foundDevice.productId}`} className="btn-primary shrink-0">
                  <Eye className="h-4 w-4" /> เปิดรุ่นนี้
                </Link>
              )}
            </div>
          )}

          {variantSearch.isFetching && (
            <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
              กำลังค้นหา...
            </div>
          )}

          {!variantSearch.isFetching && variantSearch.data && variantSearch.data.content.length === 0
            && !foundDevice && !serialLookup.isFetching && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-amber-500" />
              <p className="mt-2 text-sm font-semibold text-amber-900">
                ไม่พบสินค้าที่ตรงกับ "{query}"
              </p>
              {looksLikeCode ? (
                // เลขล้วน = น่าจะเป็น IMEI/Serial — ห้ามชวนสร้าง "รุ่น" ชื่อเป็นตัวเลข (FIX-124)
                <p className="mt-1 text-xs text-amber-800">
                  เลขนี้ดูเป็น IMEI/Serial แต่ไม่พบเครื่องในระบบ — ตรวจเลขอีกครั้ง ·
                  ถ้าเป็นเครื่องใหม่ที่จะรับเข้า ให้<strong>ค้นด้วยชื่อรุ่น</strong> (เช่น iPhone 13) แล้วกดรับเข้า
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-amber-800">
                    ถ้าเป็นสินค้าใหม่ที่ยังไม่เคยมีในระบบ — กดด้านล่างเพื่อลงทะเบียน
                  </p>
                  <Link
                    to={`/products/new?name=${encodeURIComponent(query)}`}
                    className="btn-primary mt-3 bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="h-4 w-4" />
                    สร้างรุ่นใหม่ "{query.slice(0, 30)}{query.length > 30 ? '…' : ''}" + รับเข้าเลย
                  </Link>
                </>
              )}
            </div>
          )}

          {!variantSearch.isFetching && variantSearch.data && variantSearch.data.content.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>พบ <strong className="text-slate-700">{variantSearch.data.totalElements}</strong> รายการ</span>
                <Link
                  to={`/products/new?name=${encodeURIComponent(query)}`}
                  className="text-brand-600 hover:underline">
                  + ไม่มีตัวที่ใช่ → สร้างรุ่นใหม่
                </Link>
              </div>
              <div className="space-y-2">
                {variantSearch.data.content.map((v) => (
                  <VariantRow key={v.id} variant={v} rowOpensReceive={receiveIntent}
                              onReceive={() => setReceiveTarget(v)} />
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
                  // ปุ่มนี้แค่ "เปิดรุ่น" (นำทางไปหน้ารุ่น) — label ตรงกับสิ่งที่เกิดจริง (FIX-087)
                  <Link
                    to={`/products/${album.items[0].id}`}
                    className="btn-secondary text-sm"
                    title="เปิดหน้ารุ่นนี้ — เพิ่มสี/เครื่อง หรือรับเข้าได้จากในหน้ารุ่น">
                    <Eye className="h-4 w-4" /> เปิดรุ่น
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
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        to={`/products/${p.id}`}
                        className="rounded-md border border-slate-200 p-2 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                        title="ดูรายละเอียด + เครื่องในรุ่น">
                        <Eye className="h-4 w-4" />
                      </Link>
                      {canEdit && (
                        <button type="button" onClick={() => handleDelete(p)} disabled={del.isPending}
                                className="rounded-md border border-slate-200 p-2 text-red-600 hover:border-red-400 hover:bg-red-50 disabled:opacity-50"
                                title="ลบสินค้า (ซ่อนออกจากรายการ · กู้คืนได้)">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
          <Info className="inline h-3.5 w-3.5 align-[-2px]" /> <strong>เคล็ดลับ:</strong> ใช้ช่องค้นหาด้านบน → ยิงสแกน IMEI / พิมพ์ชื่อสินค้า เพื่อรับของเข้าด่วน
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
function VariantRow({ variant, onReceive, rowOpensReceive }: {
  variant: VariantResponse; onReceive: () => void;
  /** โหมดรับเข้า (FIX-114): กดที่แถวตรงไหนก็เปิดฟอร์มรับเข้า */
  rowOpensReceive?: boolean;
}) {
  return (
    <div
      onClick={rowOpensReceive ? onReceive : undefined}
      className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-sm ${
        rowOpensReceive ? 'cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40' : ''}`}>
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100">
        {variant.imageUrl
          ? <AuthImage src={variant.imageUrl} alt="" className="h-full w-full object-cover" />
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
          {variant.barcode && <span className="text-slate-400">· <Barcode className="inline h-3.5 w-3.5 align-[-2px]" /> {variant.barcode}</span>}
        </div>
        <div className="mt-1 text-xs text-emerald-700">
          <Wallet className="inline h-4 w-4 align-[-2px]" /> {formatTHB(variant.sellingPrice)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          to={`/products/${variant.productId}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-md border border-slate-200 p-2 text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
          title="ดูรายละเอียด">
          <Eye className="h-4 w-4" />
        </Link>
        <button
          onClick={(e) => { e.stopPropagation(); onReceive(); }}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
          <Inbox className="inline h-4 w-4 align-[-2px]" /> รับเข้า
        </button>
      </div>
    </div>
  );
}
