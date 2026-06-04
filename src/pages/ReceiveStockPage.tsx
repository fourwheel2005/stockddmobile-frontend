import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import { productsApi } from '@/api/products';
import { SearchVariantBar } from '@/components/receive/SearchVariantBar';
import { VariantSelectGrid } from '@/components/receive/VariantSelectGrid';
import { FastInboundForm } from '@/components/receive/FastInboundForm';
import type { VariantResponse } from '@/types/api';

type Mode =
  | { kind: 'SEARCH' }
  | { kind: 'FAST_INBOUND'; variant: VariantResponse };

/**
 * Unified "รับของเข้าคลัง" — orchestrator แบบ state machine.
 *
 * Flow:
 *   SEARCH → (เจอ) → FAST_INBOUND (รับเข้า lot ใหม่ของ variant ที่มี)
 *   SEARCH → (ไม่เจอ) → navigate /products/new (สร้างใหม่ — ใช้ ProductRegisterPage เดิม)
 *
 * Critical thinking:
 *   - 80% ของ "รับของ" คือ topup สินค้าที่มีอยู่แล้ว → FAST_INBOUND เร็วสุด
 *   - 20% คือสินค้าใหม่ → ส่งไป /products/new ที่มีฟอร์มเต็ม (reuse logic เดิม)
 */
export function ReceiveStockPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'SEARCH' });

  // Fetch search results
  const searchQuery = useQuery({
    queryKey: ['variant-search', query],
    queryFn: () => productsApi.searchVariants(query, 0, 20),
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  });

  // Fetch product detail (for serialized flag) เมื่อเลือก variant
  const productQuery = useQuery({
    queryKey: ['product-by-variant', mode.kind === 'FAST_INBOUND' ? mode.variant.productId : null],
    queryFn: () => mode.kind === 'FAST_INBOUND'
      ? productsApi.get(mode.variant.productId)
      : Promise.reject('no-variant'),
    enabled: mode.kind === 'FAST_INBOUND',
  });

  // ESC key globally → กลับไป SEARCH
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode.kind !== 'SEARCH') {
        setMode({ kind: 'SEARCH' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // ─── FAST INBOUND view ────────────────────────────────────────
  if (mode.kind === 'FAST_INBOUND') {
    if (productQuery.isLoading) {
      return (
        <div className="space-y-4">
          <p className="text-center text-sm text-slate-500">กำลังโหลด...</p>
        </div>
      );
    }
    if (productQuery.error || !productQuery.data) {
      return (
        <div className="space-y-4">
          <p className="text-center text-sm text-red-500">โหลดข้อมูลสินค้าไม่สำเร็จ</p>
          <button onClick={() => setMode({ kind: 'SEARCH' })} className="btn-secondary mx-auto block">
            กลับ
          </button>
        </div>
      );
    }
    return (
      <FastInboundForm
        variant={mode.variant}
        isSerialized={productQuery.data.serialized}
        onBack={() => setMode({ kind: 'SEARCH' })}
        onDone={() => {
          // หลังบันทึก — กลับ SEARCH + clear query เพื่อรับชิ้นถัดไป
          setMode({ kind: 'SEARCH' });
          setQuery('');
        }}
      />
    );
  }

  // ─── SEARCH view ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-brand-600" />
          รับของเข้าคลัง
        </h1>
        <p className="page-subtitle">
          ค้นหาสินค้าก่อน — ถ้ามีในระบบ → รับเข้า lot ใหม่ · ไม่มี → ลงทะเบียนสินค้าใหม่
        </p>
      </header>

      <SearchVariantBar
        autoFocus
        value={query}
        onChange={setQuery}
        loading={searchQuery.isFetching}
      />

      <VariantSelectGrid
        results={searchQuery.data?.content ?? []}
        totalElements={searchQuery.data?.totalElements ?? 0}
        query={query}
        isLoading={searchQuery.isFetching}
        onSelect={(v) => setMode({ kind: 'FAST_INBOUND', variant: v })}
        onCreateNew={() => {
          // ส่ง query เป็น hint ในชื่อสินค้า
          const params = new URLSearchParams();
          if (query.trim()) params.set('name', query.trim());
          navigate(`/products/new?${params.toString()}`);
        }}
      />
    </div>
  );
}
