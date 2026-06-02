import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { CashMovementType, PaidFrom } from '@/types/api';

interface Props {
  sessionId: string;
  onClose: () => void;
  onDone?: () => void;
}

type MoveKind = 'CASH_IN' | 'EXPENSE' | 'SAFE_DROP' | 'PETTY_FROM_OWNER' | 'ADJUSTMENT';

const KINDS: { key: MoveKind; label: string; type: CashMovementType; sign: '+' | '-' | '±'; icon: string }[] = [
  { key: 'CASH_IN',         label: 'เติมเงินสด',           type: 'CASH_IN',               sign: '+', icon: '💵' },
  { key: 'PETTY_FROM_OWNER',label: 'ตา/ยายใส่เงินเพิ่ม', type: 'PETTY_CASH_FROM_OWNER', sign: '+', icon: '👵' },
  { key: 'EXPENSE',         label: 'จ่ายค่าใช้จ่าย',       type: 'PAYOUT_EXPENSE',        sign: '-', icon: '🧾' },
  { key: 'SAFE_DROP',       label: 'เก็บเข้าตู้นิรภัย',     type: 'SAFE_DROP',             sign: '-', icon: '🔒' },
  { key: 'ADJUSTMENT',      label: 'ปรับปรุง',              type: 'ADJUSTMENT',            sign: '±', icon: '⚖️' },
];

export function CashMovementModal({ sessionId, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<MoveKind>('CASH_IN');
  const [amount, setAmount] = useState<number>(0);
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('REGISTER');
  const [note, setNote] = useState('');
  useModalChrome(onClose);

  const selected = KINDS.find((k) => k.key === kind)!;

  const mutate = useMutation({
    mutationFn: () => {
      const abs = Math.abs(amount);
      // sign logic
      let signed: number;
      if (selected.sign === '+') signed = abs;
      else if (selected.sign === '-') signed = -abs;
      else signed = amount; // ADJUSTMENT: ตามที่ user กรอก
      return cashRegisterApi.addMovement(sessionId, {
        type: selected.type,
        amount: signed,
        paidFrom,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      toast.success('บันทึกเรียบร้อย');
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      onDone?.();
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const Icon = selected.sign === '+' ? ArrowDownCircle : ArrowUpCircle;
  const iconColor = selected.sign === '+' ? 'text-emerald-600' : 'text-rose-600';

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[10vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            บันทึกเงินเข้า-ออก
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">ประเภท</label>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  type="button"
                  key={k.key}
                  onClick={() => setKind(k.key)}
                  className={`flex items-center gap-1 rounded-md border px-3 py-2 text-left text-sm transition ${
                    kind === k.key
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <span className="text-base">{k.icon}</span>
                  <span className="text-xs">{k.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">จำนวนเงิน (บาท)</label>
            <input
              type="number" step={1}
              className="input text-right text-xl font-bold"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              autoFocus
            />
            {selected.sign === '±' && (
              <p className="mt-1 text-xs text-slate-500">ADJUSTMENT — บวก = เข้าเก๊ะ · ลบ = ออก</p>
            )}
          </div>

          {kind === 'PETTY_FROM_OWNER' && (
            <div>
              <label className="mb-1 block text-sm font-medium">จากใคร</label>
              <div className="grid grid-cols-2 gap-2">
                {(['OWNER_GRANDPA', 'OWNER_GRANDMA'] as PaidFrom[]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPaidFrom(p)}
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      paidFrom === p
                        ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    {p === 'OWNER_GRANDPA' ? '👴 ตา' : '👵 ยาย'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
            <input
              className="input"
              placeholder="รายละเอียด"
              value={note} onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary"
            disabled={mutate.isPending || amount === 0}
            onClick={() => mutate.mutate()}>
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
