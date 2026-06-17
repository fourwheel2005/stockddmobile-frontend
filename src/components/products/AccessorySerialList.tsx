import { useEffect, useRef, useState } from 'react';
import { ScanLine, Plus, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export interface AccessorySerialRow {
  imei: string;
  serialNumber: string;
}

interface Props {
  items: AccessorySerialRow[];
  onChange: (items: AccessorySerialRow[]) => void;
}

const EMPTY: AccessorySerialRow = { imei: '', serialNumber: '' };

/**
 * Compact list สำหรับ "อุปกรณ์เสริม + Serial รายชิ้น":
 *  - Scanner mode bar ที่หัว — ยิงปุ๊บ + Enter = เพิ่มแถวทันที
 *  - Quick paste: วาง multiple lines = เพิ่มหลายตัวพร้อมกัน
 *  - Row compact: แค่ IMEI + Serial + ลบ (ไม่มี ที่มา/สภาพ/แบต/ราคา/ประกัน รายตัว)
 *  - Lot-wide defaults (ที่มา/ทุน/ประกัน) ใส่ครั้งเดียวที่ ProductRegisterPage
 *  - Duplicate detection — block ใส่ซ้ำ
 *  - Counter: "12 ชิ้น"
 */
export function AccessorySerialList({ items, onChange }: Props) {
  const [scannerMode, setScannerMode] = useState(true);
  const [scanText, setScanText] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scannerMode) scannerRef.current?.focus();
  }, [scannerMode]);

  // ─── Add tokens (scan / paste) ───────────────────────────────
  const ingestTokens = (raw: string): number => {
    const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return 0;

    // Check duplicates ทั้ง existing + new tokens (อุปกรณ์เสริมใช้ serial/barcode อย่างเดียว)
    const existing = new Set(
      items.map((it) => it.serialNumber).filter(Boolean),
    );
    const dup: string[] = [];
    const fresh: string[] = [];
    const seenInBatch = new Set<string>();
    for (const t of tokens) {
      if (existing.has(t) || seenInBatch.has(t)) {
        dup.push(t);
      } else {
        fresh.push(t);
        seenInBatch.add(t);
      }
    }

    if (dup.length > 0) {
      toast.error(`ซ้ำ ${dup.length} ตัว: ${dup.slice(0, 3).join(', ')}${dup.length > 3 ? '...' : ''}`);
    }

    if (fresh.length === 0) return 0;

    // Add to items — fill empty rows first, then append (ค่าที่ยิง → serialNumber)
    const next = [...items];
    let cursor = 0;
    for (let i = 0; i < next.length && cursor < fresh.length; i++) {
      if (!next[i].serialNumber) {
        next[i] = { imei: '', serialNumber: fresh[cursor] };
        cursor++;
      }
    }
    for (; cursor < fresh.length; cursor++) {
      next.push({ imei: '', serialNumber: fresh[cursor] });
    }
    onChange(next);
    return fresh.length;
  };

  const handleScannerKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const n = ingestTokens(scanText);
    if (n > 0) toast.success(`เพิ่ม ${n} ชิ้น`, { duration: 800 });
    setScanText('');
  };

  const handleScannerPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const txt = e.clipboardData.getData('text');
    if (!/[\s,;]/.test(txt)) return; // single line — ปล่อยให้ default behavior
    e.preventDefault();
    const n = ingestTokens(txt);
    if (n > 0) toast.success(`วาง ${n} ชิ้น`, { duration: 800 });
    setScanText('');
  };

  // ─── Row management ──────────────────────────────────────────
  const validCount = items.filter((it) => it.serialNumber.trim()).length;
  const updateRow = (idx: number, patch: Partial<AccessorySerialRow>) => {
    onChange(items.map((x, i) => i === idx ? { ...x, ...patch } : x));
  };
  const removeRow = (idx: number) => {
    if (items.length === 1) {
      onChange([{ ...EMPTY }]);
      return;
    }
    onChange(items.filter((_, i) => i !== idx));
  };
  const addEmptyRow = () => onChange([...items, { ...EMPTY }]);

  // ─── Duplicate highlight ─────────────────────────────────────
  const seen: Record<string, number> = {};
  items.forEach((it, idx) => {
    const key = it.serialNumber.trim();
    if (key && seen[key] === undefined) seen[key] = idx;
  });
  const isDup = (idx: number, val: string): boolean => {
    const k = val.trim();
    if (!k) return false;
    return seen[k] !== idx;
  };

  return (
    <div className="space-y-3">
      {/* Header — counter + scanner toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">
          📦 {validCount} ชิ้นในระบบ
        </span>
        <button
          type="button"
          onClick={() => setScannerMode((v) => !v)}
          className={`btn text-xs ${
            scannerMode
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'btn-secondary'
          }`}>
          <ScanLine className="h-3.5 w-3.5" />
          {scannerMode ? 'โหมดสแกนเปิด' : 'เปิดโหมดยิงสแกน'}
        </button>
      </div>

      {/* Scanner input */}
      {scannerMode && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50/50 p-3">
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-800">
            <ScanLine className="h-3.5 w-3.5" />
            ยิงสแกน → Enter เพิ่ม / วางหลายบรรทัดได้
          </label>
          <input
            ref={scannerRef}
            type="text"
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
            onKeyDown={handleScannerKey}
            onPaste={handleScannerPaste}
            placeholder="ยิงบาร์โค้ดที่นี่..."
            className="input font-mono text-base border-emerald-400 focus:border-emerald-500"
          />
          <p className="mt-1 text-[11px] text-emerald-700">
            💡 ที่มา · ราคา · ประกัน ใช้ค่า Lot-wide ด้านบน (ไม่ต้องกรอกรายชิ้น)
          </p>
        </div>
      )}

      {/* Compact list */}
      {validCount === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <ScanLine className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            ยังไม่มีรายการ — ยิงสแกน หรือกด "เพิ่ม Manual" ด้านล่าง
          </p>
        </div>
      )}

      {items.length > 0 && validCount > 0 && (
        <div className="rounded-md border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2">#</th>
                <th className="px-3 py-2">Serial / Barcode</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => {
                // hide fully-empty trailing row visually
                if (!it.serialNumber) return null;
                const snDup = isDup(idx, it.serialNumber);
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-xs font-semibold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={`input font-mono text-sm ${snDup ? 'border-red-400 bg-red-50' : ''}`}
                        placeholder="ยิง/พิมพ์ Serial หรือ Barcode"
                        value={it.serialNumber}
                        onChange={(e) => updateRow(idx, { serialNumber: e.target.value })}
                      />
                      {snDup && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600">
                          <AlertTriangle className="h-3 w-3" /> ซ้ำ
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                        title="ลบ">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual add row */}
      <button
        type="button"
        onClick={addEmptyRow}
        className="btn-secondary text-sm">
        <Plus className="h-4 w-4" />
        เพิ่ม Manual
      </button>
    </div>
  );
}
