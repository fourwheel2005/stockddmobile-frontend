import { useState } from 'react';
import { X, ShieldAlert, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';

interface Props {
  /** สิ่งที่กำลังจะทำ เช่น "ยกเลิกบิล INV-20260722-XXXX" — แสดงให้ผู้กรอกเห็นว่ากำลังอนุมัติอะไร */
  action: string;
  /** ข้อความเตือนผลลัพธ์ (ย้อนกลับไม่ได้) */
  warning?: string;
  pending?: boolean;
  onConfirm: (code: string) => void;
  onClose: () => void;
}

/**
 * ขอรหัสความปลอดภัยของร้านก่อนทำรายการที่ย้อนกลับไม่ได้กับบิลที่ขายไปแล้ว (FIX-103).
 *
 * - ช่องกรอกเป็น password (ค่าไม่ปรากฏบนจอ) + ปุ่มลูกตาเปิด/ปิดการมองเห็น
 * - ใช้ไอคอนจริง (lucide) ไม่ใช้ emoji ตามที่ร้านกำหนด
 * - รหัสไม่ถูกเก็บไว้ที่ไหนเลย — ส่งขึ้น backend ครั้งเดียวแล้วทิ้ง
 */
export function SecurityCodeModal({ action, warning, pending, onConfirm, onClose }: Props) {
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState(false);

  useModalChrome(onClose);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || pending) return;
    onConfirm(code.trim());
  };

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/70 p-4 pt-[12vh] backdrop-blur-sm animate-modal-fade-in">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold text-rose-700">
            <ShieldAlert className="h-5 w-5" />
            ต้องใช้รหัสความปลอดภัย
          </h2>
          <button type="button" onClick={onClose}
                  className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <div className="font-semibold">{action}</div>
            {warning && <div className="mt-1 text-xs">{warning}</div>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              <KeyRound className="inline h-4 w-4 mr-1 text-slate-500" />
              รหัสความปลอดภัยของร้าน
            </label>
            <div className="relative">
              <input
                type={reveal ? 'text' : 'password'}
                className="input pr-11 tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                autoComplete="off"
                maxLength={64}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-700"
                title={reveal ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                aria-label={reveal ? 'ซ่อนรหัส' : 'แสดงรหัส'}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              ขอรหัสจากเจ้าของร้าน · กรอกผิดหลายครั้งระบบจะล็อกชั่วคราว และบันทึกไว้ทุกครั้งว่าใครใช้
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            type="submit"
            className="btn-primary bg-rose-600 hover:bg-rose-700"
            disabled={!code.trim() || pending}>
            {pending ? 'กำลังยืนยัน...' : 'ยืนยันด้วยรหัส'}
          </button>
        </div>
      </form>
    </div>
  );
}
