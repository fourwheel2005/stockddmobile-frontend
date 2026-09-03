import { StockCountSection, type StockCountPayload } from '@/components/cash/StockCountSection';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, DoorClosed, AlertTriangle, CheckCircle2, Banknote, TriangleAlert } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { PaymentBreakdownCard } from '@/components/cash/PaymentBreakdownCard';
import type { CashSessionResponse } from '@/types/api';
import { usePrinter } from '@/hooks/usePrinter';

interface Props {
  session: CashSessionResponse;
  onClose: () => void;
  onClosed?: () => void;
}

/** Modal ปิดเก๊ะ — กรอกเงินจริง · ระบบคำนวณ variance · alert ถ้า >±50 บาท */
export function CloseSessionModal({ session, onClose, onClosed }: Props) {
  const qc = useQueryClient();
  const printer = usePrinter();
  const [actual, setActual] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useModalChrome(onClose);

  // "เงินสดที่ควรมีในลิ้นชัก" = ผลรวม movement ที่กระทบเงินสดเท่านั้น
  // (โอน/บัตร/QR ถูกบันทึกด้วย amount = 0 อยู่แล้ว จึงไม่ปนเข้ามา — ดู CashMovementType)
  const expected = (session.movements ?? []).reduce((s, m) => s + Number(m.amount || 0), 0);
  const nonCashTotal = Number(session.breakdown?.transferTotal ?? 0)
    + Number(session.breakdown?.cardTotal ?? 0)
    + Number(session.breakdown?.qrTotal ?? 0);
  const counted = actual != null;
  // FIX-158: ตรวจนับสต็อกก่อนปิดร้าน — null = ยังกรอกไม่ครบ (บล็อกปุ่ม)
  const [stockCount, setStockCount] = useState<StockCountPayload | null>(null);
  const variance = (actual ?? 0) - expected;
  const VARIANCE_THRESHOLD = 50;
  const willAlert = Math.abs(variance) > VARIANCE_THRESHOLD;

  const close = useMutation({
    mutationFn: () => cashRegisterApi.close(session.id, { actualClose: actual ?? 0, note: note || undefined, stockCount: stockCount! }),
    onSuccess: async (s) => {
      const v = Number(s.variance ?? 0);
      if (Math.abs(v) > VARIANCE_THRESHOLD) {
        toast.error(`ปิดเก๊ะแล้ว · ส่วนต่าง ${formatTHB(v)} (แจ้ง LINE)`, { duration: 5000 });
      } else {
        toast.success(`ปิดเก๊ะแล้ว · ${s.sessionNo}`);
      }
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: ['cash-register-history'] });
      qc.invalidateQueries({ queryKey: ['cash-register-summary'] });
      try {
        await printer.printCashSessionSummary(s);
      } catch {
        toast(`เก๊ะปิดสำเร็จแล้ว — พิมพ์ซ้ำได้ในแท็บ “ประวัติเก๊ะ”`, { duration: 6000 });
      }
      onClosed?.();
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <DoorClosed className="h-5 w-5 text-rose-600" />
            ปิดเก๊ะ — สิ้นสุดวัน
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 p-5">
          {/* V31 — Breakdown สด/โอน/บัตร/QR ตอบ requirement "เย็นนี้สรุปยอด" */}
          <PaymentBreakdownCard breakdown={session.breakdown ?? null}
            refundTotal={session.refundTotal} netSalesTotal={session.netSalesTotal} />

          {/* ตัวเลขเดียวที่ต้องเทียบตอนปิดร้าน — เงินสดในลิ้นชักเท่านั้น */}
          <div className="rounded-lg border-2 border-brand-200 bg-brand-50 p-4 text-center">
            <div className="text-sm font-medium text-brand-800">เงินสดที่ควรมีในเก๊ะตอนนี้</div>
            <div className="my-1 text-4xl font-extrabold text-brand-700">{formatTHB(expected)}</div>
            <div className="text-xs text-brand-700/80">
              เงินทอนตั้งต้น {formatTHB(session.openingFloat)} + ขายที่รับเป็นเงินสด − เงินที่จ่ายออกจากเก๊ะ
            </div>
            {nonCashTotal > 0 && (
              <div className="mt-2 rounded bg-white/70 px-2 py-1 text-xs text-slate-600">
                ยอดโอน/บัตร/QR {formatTHB(nonCashTotal)} <strong>ไม่ต้องนับ</strong> — เข้าบัญชี ไม่ได้อยู่ในลิ้นชัก
              </div>
            )}
          </div>

          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="text-xs text-slate-500">Session</div>
            <div className="font-mono text-sm font-semibold">{session.sessionNo}</div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              <Banknote className="inline h-4 w-4 align-[-2px]" /> นับเงินสดจริงในเก๊ะ แล้วกรอกตัวเลขเดียว (บาท)
            </label>
            <input
              type="number" min={0} step={1}
              className="input text-right text-2xl font-bold"
              value={actual ?? ''}
              placeholder="0"
              onChange={(e) => setActual(e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
              autoFocus
            />
            <button
              type="button"
              className="mt-2 w-full rounded border border-emerald-300 bg-emerald-50 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              onClick={() => setActual(expected)}>
              <CheckCircle2 className="inline h-4 w-4 align-[-2px]" /> ตรงตามระบบ — {formatTHB(expected)}
            </button>
          </div>

          {counted && (
            <div className={`rounded-md p-3 ${
              willAlert
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}>
              <div className="flex items-center gap-2">
                {willAlert
                  ? <AlertTriangle className="h-5 w-5" />
                  : <CheckCircle2 className="h-5 w-5" />}
                <div className="flex-1">
                  <div className="text-xs">ส่วนต่าง (จริง − ควรเป็น)</div>
                  <div className="text-xl font-bold">
                    {variance >= 0 ? '+' : ''}{formatTHB(variance)}
                  </div>
                </div>
              </div>
              {willAlert && (
                <div className="mt-2 text-xs">
                  <TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /> เกิน ±{formatTHB(VARIANCE_THRESHOLD)} — ระบบจะแจ้ง LINE
                </div>
              )}
            </div>
          )}

          {willAlert && (
            <div>
              <label className="mb-1 block text-sm font-medium">หมายเหตุ (อธิบายส่วนต่าง)</label>
              <textarea
                className="input"
                rows={3}
                placeholder="เช่น ทอนผิด, ลืมบันทึก expense..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
              />
            </div>
          )}

          {/* FIX-158: บังคับตรวจนับสต็อกก่อนปิดร้าน */}
          <StockCountSection phaseLabel="ก่อนปิดร้าน" onChange={setStockCount} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary bg-rose-600 hover:bg-rose-700"
            disabled={close.isPending || printer.printing || actual == null || (willAlert && !note.trim()) || !stockCount}
            title={!stockCount ? 'ต้องตรวจนับสต็อก + ติ๊กรับรอง + เลือกชื่อก่อน' : undefined}
            onClick={() => close.mutate()}>
            <DoorClosed className="h-4 w-4" />
            {close.isPending || printer.printing ? 'กำลังปิดและพิมพ์...'
              : !stockCount ? 'ตรวจนับสต็อกให้ครบก่อนปิดเก๊ะ'
              : 'ปิดเก๊ะและพิมพ์สรุป'}
          </button>
        </div>
      </div>
    </div>
  );
}
