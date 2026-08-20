import { useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { shopDateTimeInput, shopDateTimeInputToUtc } from '@/lib/datetime';
import type { SalesOrderResponse } from '@/types/api';

interface Props {
  order: SalesOrderResponse;
  onClose: () => void;
  onConfirm: (saleDate: string, reason: string) => void;
}

interface FormState {
  dateInput: string;
  reason: string;
  maxInput: string;
  invalid: boolean;
  setDateInput: (value: string) => void;
  setReason: (value: string) => void;
  submit: (event: FormEvent) => void;
}

function useEditSaleDateForm(order: SalesOrderResponse, onConfirm: Props['onConfirm']): FormState {
  const originalInput = useMemo(
    () => shopDateTimeInput(order.saleDate ?? order.closedAt ?? order.createdAt), [order],
  );
  const [dateInput, setDateInput] = useState(originalInput);
  const [reason, setReason] = useState('');
  const maxInput = shopDateTimeInput(new Date().toISOString());
  const isoDate = shopDateTimeInputToUtc(dateInput);
  const invalid = !isoDate || dateInput === originalInput || dateInput > maxInput || reason.trim().length < 5;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isoDate || invalid) return;
    onConfirm(isoDate, reason.trim());
  };
  return { dateInput, reason, maxInput, invalid, setDateInput, setReason, submit };
}

function ModalHeader({ billNo, onClose }: { billNo: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3.5">
      <h2 className="flex items-center gap-2 font-semibold text-brand-800">
        <CalendarClock className="h-5 w-5" /> แก้วันที่ขาย — {billNo}
      </h2>
      <button type="button" className="rounded p-1.5 hover:bg-slate-100" onClick={onClose} aria-label="ปิด">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModalFields({ form }: { form: FormState }) {
  return (
    <div className="space-y-4 p-5">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        เปลี่ยนเฉพาะวันที่ขายที่ใช้ในประวัติและรายงาน โดยไม่แก้วันที่สร้างระบบ เลขบิล
        และวันที่ของใบกำกับภาษีที่ออกแล้ว
      </div>
      <label className="block text-sm font-medium text-slate-700">
        วันที่และเวลาขาย <span className="text-red-600">*</span>
        <input type="datetime-local" className="input mt-1" value={form.dateInput} max={form.maxInput} autoFocus
               onChange={(event) => form.setDateInput(event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        เหตุผลที่แก้ <span className="text-red-600">*</span>
        <textarea className="input mt-1 min-h-20 resize-y" value={form.reason} maxLength={300}
                  placeholder="เช่น พนักงานลงวันที่ขายผิดวัน"
                  onChange={(event) => form.setReason(event.target.value)} />
        <span className="mt-1 block text-xs text-slate-400">อย่างน้อย 5 ตัวอักษร · ระบบเก็บในประวัติการแก้ไข</span>
      </label>
    </div>
  );
}

function ModalFooter({ invalid, onClose }: { invalid: boolean; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t px-5 py-3">
      <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
      <button type="submit" className="btn-primary" disabled={invalid}>ตรวจสอบและยืนยัน</button>
    </div>
  );
}

export function EditSaleDateModal({ order, onClose, onConfirm }: Props) {
  const form = useEditSaleDateForm(order, onConfirm);
  useModalChrome(onClose);
  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/60 p-4 pt-[12vh]">
      <form onSubmit={form.submit} onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <ModalHeader billNo={order.billNo} onClose={onClose} />
        <ModalFields form={form} />
        <ModalFooter invalid={form.invalid} onClose={onClose} />
      </form>
    </div>
  );
}
