import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, DoorOpen, Banknote, CheckCircle2, Info } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { parseServerDateTime } from '@/lib/datetime';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { useBranchStore } from '@/stores/branchStore';
import { StockCountSection, type StockCountPayload } from '@/components/cash/StockCountSection';

interface Props {
  onOpened?: () => void;
  onClose: () => void;
}

const QUICK_PRESETS = [500, 1000, 2000, 5000, 10000];

/** ใช้เมื่อยังโหลดค่าจาก backend ไม่เสร็จ — ต้องตรงกับ app.cash.default-opening-float */
const DEFAULT_OPENING_FLOAT = 5000;

/**
 * Modal เปิดเก๊ะวันใหม่ — กรอกเงินทอนตั้งต้น + หมายเหตุ.
 * เด้งอัตโนมัติเมื่อ login วันแรกที่ยังไม่มี active session.
 */
export function OpenSessionModal({ onOpened, onClose }: Props) {
  const qc = useQueryClient();
  // เงินทอนตั้งต้นมาตรฐานของร้าน — ตั้งที่ backend (app.cash.default-opening-float) เพื่อให้
  // เปลี่ยนได้โดยไม่ต้อง deploy หน้าจอ · โหลดไม่ทัน/ล้มเหลว → fallback ค่าเดียวกัน (FIX-100)
  const { data: defaults } = useQuery({
    queryKey: ['cash-register-defaults'],
    queryFn: () => cashRegisterApi.defaults(),
    staleTime: 60 * 60 * 1000,
  });
  const [openingFloat, setOpeningFloat] = useState<number | null>(null);
  const [note, setNote] = useState('');
  // FIX-158: ตรวจนับสต็อกเปิดร้าน — null = ยังกรอกไม่ครบ (บล็อกปุ่ม)
  const [stockCount, setStockCount] = useState<StockCountPayload | null>(null);
  const effectiveFloat = openingFloat ?? Number(defaults?.defaultOpeningFloat ?? DEFAULT_OPENING_FLOAT);

  useModalChrome(onClose);

  const open = useMutation({
    mutationFn: () => cashRegisterApi.open({
      openingFloat: effectiveFloat, note: note || undefined,
      branchId: useBranchStore.getState().activeBranchId ?? undefined,  // เปิดกะของสาขาที่เลือก (Phase 2C)
      stockCount: stockCount!,   // FIX-158 — ปุ่มถูก disable จนกว่าจะครบ
    }),
    onSuccess: (s) => {
      // P4 — backend idempotent: ถ้า session มีอยู่แล้ว backend คืนของเดิม
      // → message ปรับตาม openedAt (ถ้า > 1 นาทีก่อน = ของเดิม)
      const openedAt = parseServerDateTime(s.openedAt);
      const isRecovered = !!openedAt && Date.now() - openedAt.getTime() > 60_000;
      if (isRecovered) {
        toast.success(`พบ session เดิมที่เปิดอยู่ — ${s.sessionNo} (กู้คืนแล้ว)`,
                      { duration: 4000 });
      } else {
        toast.success(`เปิดเก๊ะแล้ว — ${s.sessionNo}`);
      }
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      onOpened?.();
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2.5 backdrop-blur-sm animate-modal-fade-in sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-session-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-1.25rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-modal-zoom-in sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5 sm:py-3.5">
          <h2 id="open-session-title" className="flex items-center gap-2 font-semibold">
            <DoorOpen className="h-5 w-5 text-emerald-600" />
            เปิดเก๊ะ — เริ่มต้นวันใหม่
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="inline h-4 w-4 align-[-2px]" /> ตั้งค่าไว้ให้แล้ว <strong>{formatTHB(effectiveFloat)} ทุกวัน</strong> — กด "เปิดเก๊ะ" ได้เลย
            (แก้ตัวเลขได้ถ้าวันไหนใส่ไม่เท่าปกติ)
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="inline h-3.5 w-3.5 align-[-2px]" /> <strong>เงินทอนตั้งต้น</strong> = เงินสดที่ใส่ในเก๊ะตอนเช้าเพื่อทอน
            ระบบจะใช้คำนวณ "เงินที่ควรเป็น" ตอนปิดเก๊ะ
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              <Banknote className="inline h-4 w-4 mr-1 text-emerald-600" />
              จำนวนเงินทอน (บาท)
            </label>
            <input
              type="number" min={0} step={50}
              className="input text-right text-2xl font-bold"
              value={effectiveFloat}
              onChange={(e) => setOpeningFloat(Math.max(0, Number(e.target.value) || 0))}
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {QUICK_PRESETS.map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setOpeningFloat(v)}
                  className={`rounded border px-2 py-1 text-xs ${
                    effectiveFloat === v
                      ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  {formatTHB(v)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">หมายเหตุ (optional)</label>
            <input
              className="input"
              placeholder="เช่น ใส่ตามที่ตา/ยายให้มา"
              value={note} onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>

          {/* FIX-158: บังคับตรวจนับสต็อกก่อนเปิดร้าน */}
          <StockCountSection phaseLabel="เปิดร้าน" onChange={setStockCount} />
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onClose}>ยกเลิก</button>
          <button
            type="button"
            className="btn-primary w-full justify-center bg-emerald-600 text-center hover:bg-emerald-700 sm:w-auto"
            disabled={open.isPending || !stockCount}
            title={!stockCount ? 'ต้องตรวจนับสต็อก + ติ๊กรับรอง + เลือกชื่อก่อน' : undefined}
            onClick={() => open.mutate()}>
            <DoorOpen className="h-4 w-4" />
            {open.isPending ? 'กำลังเปิด...'
              : !stockCount ? 'ตรวจนับสต็อกให้ครบก่อนเปิดเก๊ะ'
              : `เปิดเก๊ะ ${formatTHB(effectiveFloat)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
