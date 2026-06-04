import { Package, ChevronRight, Plus } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import type { VariantResponse } from '@/types/api';

interface Props {
  results: VariantResponse[];
  totalElements: number;
  query: string;
  isLoading: boolean;
  onSelect: (v: VariantResponse) => void;
  onCreateNew: () => void;
}

/**
 * แสดงผลค้นหา variant
 *  - ถ้ามี results → list ให้เลือก
 *  - ถ้าไม่มี → "ไม่พบ — กรอกใหม่"
 *  - ถ้า query ว่าง → empty state
 */
export function VariantSelectGrid({
  results, totalElements, query, isLoading, onSelect, onCreateNew,
}: Props) {
  if (!query) {
    return (
      <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
        <Package className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">
          🔍 พิมพ์/ยิงสแกน เพื่อค้นหาสินค้า
        </p>
        <p className="mt-1 text-xs text-slate-400">
          เจอ → รับเข้า lot ใหม่ &nbsp;·&nbsp; ไม่เจอ → ลงทะเบียนสินค้าใหม่
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-sm text-slate-500">กำลังค้นหา...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6 text-center">
        <Package className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-2 text-sm font-semibold text-amber-900">
          ไม่พบสินค้าที่ตรงกับ "{query}"
        </p>
        <p className="mt-1 text-xs text-amber-800">
          ถ้าเป็นสินค้าใหม่ที่ยังไม่เคยมีในระบบ — กดด้านล่างเพื่อลงทะเบียน
        </p>
        <button
          onClick={onCreateNew}
          className="btn-primary mt-3 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" />
          ลงทะเบียนสินค้าใหม่ "{query.slice(0, 30)}{query.length > 30 ? '…' : ''}"
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>พบ <strong className="text-slate-700">{totalElements}</strong> รายการ</span>
        <button
          onClick={onCreateNew}
          className="text-brand-600 hover:underline">
          + ไม่มีตัวที่ใช่ → สร้างใหม่
        </button>
      </div>

      <div className="space-y-2">
        {results.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => onSelect(v)}
            className="group flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/30 hover:shadow-sm">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-400">
              {v.imageUrl
                ? <img src={v.imageUrl} alt="" className="h-full w-full rounded-md object-cover" />
                : <Package className="h-6 w-6" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {v.productName}
                {(v.color || v.storage) && (
                  <span className="text-slate-500"> · {[v.color, v.storage].filter(Boolean).join(' / ')}</span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-slate-500">{v.sku}</span>
                {v.barcode && <span className="text-slate-400">📊 {v.barcode}</span>}
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs">
                <span className="text-emerald-700">
                  💰 {formatTHB(v.sellingPrice)}
                </span>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-brand-500" />
          </button>
        ))}
      </div>
    </div>
  );
}
