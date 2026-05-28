import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Wrench, UserCircle2, Save } from 'lucide-react';
import { repairApi } from '@/api/repair';
import { extractErrorMessage } from '@/api/client';
import { CustomerPickerModal } from '@/components/CustomerPickerModal';
import type { Customer, CreateRepairRequest, RepairTicket } from '@/types/api';

interface Props {
  onClose: () => void;
  /** ส่ง ticket ที่สร้างเสร็จกลับให้หน้า POS เพื่อพิมพ์ใบรับซ่อม. */
  onCreated: (ticket: RepairTicket) => void;
}

const EMPTY: CreateRepairRequest = {
  customerName: '', customerPhone: '', deviceBrand: '', deviceModel: '',
  deviceColor: '', imei: '', serialNumber: '', reportedSymptom: '',
  estimatedCost: undefined, depositAmount: undefined, note: '',
};

/**
 * ฟอร์มรับซ่อมเครื่องของลูกค้า (ไม่ใช่เครื่องในสต็อกร้าน).
 * บันทึกแล้วได้เลขใบรับซ่อม + ส่งต่อให้พิมพ์บิลรับซ่อม.
 */
export function RepairIntakeModal({ onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const firstRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CreateRepairRequest>({ ...EMPTY });
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wrench className="h-5 w-5 text-amber-600" /> รับซ่อม / เคลม เครื่องลูกค้า
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
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
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Serial Number</label>
                <input className="input" value={form.serialNumber}
                       onChange={(e) => set('serialNumber', e.target.value)} />
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

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={create.isPending} onClick={handleSubmit}>
            <Save className="h-4 w-4" />
            {create.isPending ? 'กำลังบันทึก...' : 'บันทึกใบรับซ่อม + พิมพ์'}
          </button>
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
