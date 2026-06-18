import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Wrench, UserCircle2, Save } from 'lucide-react';
import { repairApi } from '@/api/repair';
import { extractErrorMessage } from '@/api/client';
import { CustomerPickerModal } from '@/components/CustomerPickerModal';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { Customer, CreateRepairRequest, RepairTicket } from '@/types/api';

interface Props {
  onClose: () => void;
  /** ส่ง ticket ที่สร้างเสร็จกลับให้หน้า POS เพื่อพิมพ์ใบรับซ่อม. */
  onCreated: (ticket: RepairTicket) => void;
  /** prefill ข้อมูลเครื่อง (เช่น เครื่องที่ขายไปแล้วกลับมาซ่อม — รุ่น/สี/IMEI/Serial). */
  initial?: Partial<CreateRepairRequest>;
}

const EMPTY: CreateRepairRequest = {
  customerName: '', customerPhone: '', deviceBrand: '', deviceModel: '',
  deviceColor: '', imei: '', serialNumber: '', screenCode: '',
  reportedSymptom: '',
  estimatedCost: undefined, depositAmount: undefined, note: '',
};

/**
 * ฟอร์มรับซ่อมเครื่องของลูกค้า (ไม่ใช่เครื่องในสต็อกร้าน).
 * บันทึกแล้วได้เลขใบรับซ่อม + ส่งต่อให้พิมพ์บิลรับซ่อม.
 */
export function RepairIntakeModal({ onClose, onCreated, initial }: Props) {
  const qc = useQueryClient();
  const firstRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CreateRepairRequest>({ ...EMPTY, ...initial });
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  useModalChrome(onClose);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const set = <K extends keyof CreateRepairRequest>(k: K, v: CreateRepairRequest[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const pickCustomer = (c: Customer | null) => {
    if (!c) return;
    setCustomerId(c.id);
    setForm((p) => ({ ...p, customerName: c.name, customerPhone: c.phone ?? '' }));
  };

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateRepairRequest = {
        customerId,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone?.trim() || undefined,
        deviceBrand: form.deviceBrand?.trim() || undefined,
        deviceModel: form.deviceModel.trim(),
        deviceColor: form.deviceColor?.trim() || undefined,
        imei: form.imei?.trim() || undefined,
        serialNumber: form.serialNumber?.trim() || undefined,
        screenCode: form.screenCode?.trim() || undefined,
        reportedSymptom: form.reportedSymptom.trim(),
        estimatedCost: form.estimatedCost || undefined,
        depositAmount: form.depositAmount || undefined,
        note: form.note?.trim() || undefined,
      };
      return repairApi.create(payload);
    },
    onSuccess: (ticket) => {
      toast.success(`สร้างใบรับซ่อมแล้ว — ${ticket.ticketNo}`);
      qc.invalidateQueries({ queryKey: ['repair-tickets'] });
      onCreated(ticket);
      onClose();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim()) return toast.error('กรุณากรอกชื่อลูกค้า');
    if (!form.deviceModel.trim()) return toast.error('กรุณากรอกรุ่นเครื่อง');
    if (!form.reportedSymptom.trim()) return toast.error('กรุณากรอกอาการเสีย');
    create.mutate();
  };

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[5vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="h-5 w-5 text-amber-600" /> รับซ่อม / เคลม เครื่องลูกค้า
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิด"
            title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Customer */}
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-slate-500">ข้อมูลลูกค้า</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">ชื่อลูกค้า <span className="text-red-500">*</span></label>
                <input ref={firstRef} className="input" value={form.customerName}
                       onChange={(e) => set('customerName', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">เบอร์โทร</label>
                <input className="input" value={form.customerPhone}
                       onChange={(e) => set('customerPhone', e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn-secondary mt-2"
                    onClick={() => setShowCustomerPicker(true)}>
              <UserCircle2 className="h-4 w-4" /> เลือกลูกค้าเดิม
            </button>
          </fieldset>

          {/* Device */}
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-slate-500">ข้อมูลเครื่อง</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">ยี่ห้อ</label>
                <input className="input" placeholder="เช่น Apple" value={form.deviceBrand}
                       onChange={(e) => set('deviceBrand', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">รุ่น <span className="text-red-500">*</span></label>
                <input className="input" placeholder="เช่น iPhone 13" value={form.deviceModel}
                       onChange={(e) => set('deviceModel', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">สี</label>
                <input className="input" value={form.deviceColor}
                       onChange={(e) => set('deviceColor', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">IMEI</label>
                <input className="input" value={form.imei}
                       onChange={(e) => set('imei', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Serial Number</label>
                <input className="input" value={form.serialNumber}
                       onChange={(e) => set('serialNumber', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  รหัสหน้าจอ
                  <span className="ml-1 font-normal text-slate-400">(passcode / PIN / pattern — สำหรับช่างใช้ปลดล็อกทดสอบ)</span>
                </label>
                <input
                  className="input font-mono"
                  placeholder="เช่น 1234 หรือ L-pattern"
                  value={form.screenCode}
                  onChange={(e) => set('screenCode', e.target.value)}
                  maxLength={60}
                />
              </div>
            </div>
          </fieldset>

          {/* Symptom + money */}
          <div>
            <label className="mb-1 block text-sm font-medium">อาการเสีย / งานที่ต้องซ่อม <span className="text-red-500">*</span></label>
            <textarea className="input" rows={2} placeholder="เช่น จอแตก เปิดไม่ติด แบตเสื่อม..."
                      value={form.reportedSymptom}
                      onChange={(e) => set('reportedSymptom', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">ค่าซ่อมประเมิน (บาท)</label>
              <input type="number" min={0} step="0.01" className="input"
                     value={form.estimatedCost ?? ''}
                     onChange={(e) => set('estimatedCost', e.target.value === '' ? undefined : Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">มัดจำ (บาท)</label>
              <input type="number" min={0} step="0.01" className="input"
                     value={form.depositAmount ?? ''}
                     onChange={(e) => set('depositAmount', e.target.value === '' ? undefined : Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">หมายเหตุ</label>
            <input className="input" value={form.note}
                   onChange={(e) => set('note', e.target.value)} />
          </div>
        </form>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-slate-50/50 px-5 py-3 rounded-b-xl">
          <span className="hidden text-xs text-slate-500 sm:block">
            กด <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd> เพื่อปิด
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
            <button className="btn-primary" disabled={create.isPending} onClick={handleSubmit}>
              <Save className="h-4 w-4" />
              {create.isPending ? 'กำลังบันทึก...' : 'บันทึก + พิมพ์'}
            </button>
          </div>
        </div>
      </div>

      {showCustomerPicker && (
        <CustomerPickerModal
          onSelect={pickCustomer}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}
    </div>
  );
}
