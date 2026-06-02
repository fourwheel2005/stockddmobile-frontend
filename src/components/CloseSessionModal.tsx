import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, DoorClosed, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { CashSessionResponse } from '@/types/api';

interface Props {
  session: CashSessionResponse;
  onClose: () => void;
  onClosed?: () => void;
}

/** Modal ปิดเก๊ะ — กรอกเงินจริง · ระบบคำนวณ variance · alert ถ้า >±50 บาท */
export function CloseSessionModal({ session, onClose, onClosed }: Props) {
  const qc = useQueryClient();
  const [actual, setActual] = useState<number>(0);
  const [note, setNote] = useState('');

  useModalChrome(onClose);

  // ระบบคำนวณ expected = sum(movements)
  const expected = (session.movements ?? []).reduce((s, m) => s + Number(m.amount || 0), 0);
  const variance = actual - expected;
  const VARIANCE_THRESHOLD = 50;
  const willAlert = Math.abs(variance) > VARIANCE_THRESHOLD;

  const close = useMutation({
    mutationFn: () => cashRegisterApi.close(session.id, { actualClose: actual, note: note || undefined }),
    onSuccess: (s) => {
      const v = Number(s.variance ?? 0);
      if (Math.abs(v) > VARIANCE_THRESHOLD) {
        toast.error(`ปิดเก๊ะแล้ว · ส่วนต่าง ${formatTHB(v)} (แจ้ง LINE)`, { duration: 5000 });
      } else {
        toast.success(`ปิดเก๊ะแล้ว · ${s.sessionNo}`);
      }
      qc.invalidateQueries({ queryKey: ['cash-session'] });
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
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
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="text-xs text-slate-500">Session</div>
            <div className="font-mono text-sm font-semibold">{session.sessionNo}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-slate-500">เงินทอนตั้งต้น</div>
                <div className="font-semibold">{formatTHB(session.openingFloat)}</div>
              </div>
              <div>
                <div className="text-slate-500">ระบบคาด (expected)</div>
                <div className="font-bold text-brand-700">{formatTHB(expected)}</div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              💵 นับเงินสดจริงในเก๊ะ (บาท)
            </label>
            <input
              type="number" min={0} step={1}
              className="input text-right text-2xl font-bold"
              value={actual}
              onChange={(e) => setActual(Math.max(0, Number(e.target.value) || 0))}
              autoFocus
            />
          </div>

          {actual > 0 && (
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
                  ⚠️ เกิน ±{formatTHB(VARIANCE_THRESHOLD)} — ระบบจะแจ้ง LINE
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
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary bg-rose-600 hover:bg-rose-700"
            disabled={close.isPending || actual <= 0 || (willAlert && !note.trim())}
            onClick={() => close.mutate()}>
            <DoorClosed className="h-4 w-4" />
            {close.isPending ? 'กำลังปิด...' : 'ปิดเก๊ะ'}
          </button>
        </div>
      </div>
    </div>
  );
}
