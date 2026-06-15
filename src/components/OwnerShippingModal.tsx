import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Truck } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';

/**
 * บันทึก "ค่าส่งที่ตา/ยายสำรองจ่าย" แบบไม่ต้องมีการขาย
 * (ออกไปจ่ายค่าส่งข้างนอกแล้วกรอกเข้าระบบ). ไม่กระทบเก๊ะเงินสด —
 * ขึ้น owner ledger (ร้านติดหนี้ตา/ยาย) + นับเป็นรายจ่ายค่าส่งในรายงานกำไร.
 */
export function OwnerShippingModal({ onClose }: { onClose: () => void }) {
  const [grandpa, setGrandpa] = useState<number>(0);
  const [grandma, setGrandma] = useState<number>(0);
  const [note, setNote] = useState('');

  const total = grandpa + grandma;

  const save = useMutation({
    mutationFn: () => cashRegisterApi.recordOwnerShipping({
      grandpa: grandpa > 0 ? grandpa : undefined,
      grandma: grandma > 0 ? grandma : undefined,
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success(`บันทึกค่าส่งสำรอง ${formatTHB(total)} แล้ว`);
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (total <= 0) { toast.error('กรอกค่าส่งตา หรือ ยาย อย่างน้อย 1 ช่อง'); return; }
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-orange-50 px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-orange-800">
            <Truck className="h-5 w-5" /> จ่ายค่าส่ง (ตา/ยาย) — ไม่ต้องมีบิล
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-orange-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            💡 ใช้ตอน <strong>ตา/ยายออกไปจ่ายค่าส่งเองข้างนอก</strong> (ไม่เกี่ยวกับการขายบิลไหน) ·
            ระบบจะ <strong>ไม่หักเงินจากเก๊ะ</strong> แต่บันทึกว่า <strong>ร้านติดหนี้ตา/ยาย</strong> +
            นับเป็น <strong>รายจ่ายค่าส่ง</strong> ในรายงานกำไร
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">👴 ค่าส่งของตา (บาท)</label>
              <input type="number" min={0} step={1} className="input text-right"
                     value={grandpa || ''} placeholder="0"
                     onChange={(e) => setGrandpa(Math.max(0, Number(e.target.value) || 0))}
                     onFocus={(e) => e.target.select()} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">👵 ค่าส่งของยาย (บาท)</label>
              <input type="number" min={0} step={1} className="input text-right"
                     value={grandma || ''} placeholder="0"
                     onChange={(e) => setGrandma(Math.max(0, Number(e.target.value) || 0))}
                     onFocus={(e) => e.target.select()} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">โน้ต (optional)</label>
            <input className="input" value={note} maxLength={200}
                   placeholder="เช่น ส่งของลูกค้าไลน์ / เลขพัสดุ"
                   onChange={(e) => setNote(e.target.value)} />
          </div>

          {total > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
              รวมสำรองจ่าย <strong>{formatTHB(total)}</strong> · ร้านติดหนี้
              {grandpa > 0 && <> ตา {formatTHB(grandpa)}</>}
              {grandpa > 0 && grandma > 0 && ' ·'}
              {grandma > 0 && <> ยาย {formatTHB(grandma)}</>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button type="submit" disabled={save.isPending || total <= 0} className="btn-primary">
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึกค่าส่งสำรอง'}
          </button>
        </div>
      </form>
    </div>
  );
}
