import { useEffect, useRef, useState } from 'react';
import { Search, ScanLine, Loader2 } from 'lucide-react';
import { nextBurst, scanReplace, type ScanBurst } from '@/lib/scanInput';

interface Props {
  value: string;
  onChange: (q: string) => void;
  /** debounceMs — กัน DB hit ทุก keystroke. Scan = paste = trigger ทันที. */
  debounceMs?: number;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** id ของ input — ให้ปุ่มภายนอก focus ได้ (เช่น ปุ่ม "รับสินค้าเข้า") */
  inputId?: string;
}

/**
 * Search input ที่:
 *  - debounce การพิมพ์ (default 300ms)
 *  - paste/scan (เครื่อง barcode reader emit เป็น paste) → แทนที่ข้อความเดิม + trigger ทันที
 *  - เครื่องยิงแบบคีย์บอร์ดยิงซ้ำตอนช่องยังค้างคำค้นเดิม → แทนที่ ไม่ต่อท้าย (FIX-218 กันเลขเบิ้ล)
 *  - Enter → trigger ทันที
 *  - ESC → clear + refocus
 */
export function SearchVariantBar({
  value, onChange, debounceMs = 300, loading, placeholder, autoFocus, inputId,
}: Props) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastInputAt = useRef(0);
  const burst = useRef<ScanBurst | null>(null);

  useEffect(() => { setLocal(value); }, [value]);

  // debounce typing
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, value, onChange, debounceMs]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        {loading
          ? <Loader2 className="h-5 w-5 animate-spin" />
          : <Search className="h-5 w-5" />}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={local}
        onChange={(e) => {
          const now = performance.now();
          burst.current = nextBurst(burst.current, now - lastInputAt.current, local);
          lastInputAt.current = now;
          setLocal(scanReplace(e.target.value, burst.current, value));
        }}
        onPaste={(e) => {
          // scan barcode reader = paste = แทนที่ทั้งช่อง + fire ทันที
          // ต้อง preventDefault — ไม่งั้นเบราว์เซอร์วางซ้ำต่อท้ายข้อความเดิมอีกรอบ (DD00451DD00451)
          const text = e.clipboardData.getData('text').trim();
          if (text) {
            e.preventDefault();
            burst.current = null;
            setLocal(text);
            onChange(text);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(local);
          if (e.key === 'Escape') { setLocal(''); onChange(''); }
        }}
        placeholder={placeholder ?? 'ยิงสแกน / พิมพ์ — IMEI, SKU, ชื่อสินค้า, แบรนด์'}
        className="input pl-11 pr-12 text-base"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        <ScanLine className="h-5 w-5" />
      </div>
    </div>
  );
}
