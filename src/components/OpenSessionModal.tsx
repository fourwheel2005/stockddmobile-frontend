import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, DoorOpen, Banknote } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';

interface Props {
  onOpened?: () => void;
  onClose: () => void;
}

const QUICK_PRESETS = [500, 1000, 2000, 5000, 10000];

/**
 * Modal เปิดเก๊ะวันใหม่ — กรอกเงินทอนตั้งต้น + หมายเหตุ.
 * เด้งอัตโนมัติเมื่อ login วันแรกที่ยังไม่มี active session.
 */
export function OpenSessionModal({ onOpened, onClose }: Props) {
  const qc = useQueryClient();
  const [openingFloat, setOpeningFloat] = useState<number>(1000);
  const [note, setNote] = useState('');

  useModalChrome(onClose);

  const open = useMutation({
    mutationFn: () => cashRegisterApi.open({ openingFloat, note: note || undefined }),
    onSuccess: (s) => {
      toast.success(`เปิดเก๊ะแล้ว — ${s.sessionNo}`);
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      onOpened?.();
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[10vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <DoorOpen className="h-5 w-5 text-emerald-600" />
            เปิดเก๊ะ — เริ่มต้นวันใหม่
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            💡 <strong>เงินทอนตั้งต้น</strong> = เงินสดที่ใส่ในเก๊ะตอนเช้าเพื่อทอน
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
              value={openingFloat}
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
                    openingFloat === v
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={open.isPending}
            onClick={() => open.mutate()}>
            <DoorOpen className="h-4 w-4" />
            {open.isPending ? 'กำลังเปิด...' : `เปิดเก๊ะ ${formatTHB(openingFloat)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
