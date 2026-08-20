import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { PackageCheck, Printer, X } from 'lucide-react';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { useShippingLabelPrinter } from '@/hooks/useShippingLabelPrinter';
import {
  recipientFromOrder,
  SHIPPING_LABEL_SENDER,
  validateShippingRecipient,
  type ShippingLabelRecipient,
} from '@/lib/tspl/shippingLabel';
import type { SalesOrderResponse } from '@/types/api';

interface ModalProps {
  order: SalesOrderResponse;
  onClose: () => void;
}

interface FieldProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function SenderCard() {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="mb-1 text-xs font-semibold text-slate-500">ผู้ส่ง (คงที่บนป้าย)</div>
      <div className="font-semibold">{SHIPPING_LABEL_SENDER.name}</div>
      {SHIPPING_LABEL_SENDER.address.map((line) => <div key={line}>{line}</div>)}
      <div>โทร. {SHIPPING_LABEL_SENDER.phone}</div>
    </div>
  );
}

function NameField({ value, disabled, onChange }: FieldProps) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      ชื่อผู้รับ <span className="text-red-600">*</span>
      <input className="input mt-1" value={value} maxLength={80} disabled={disabled}
             autoFocus placeholder="เช่น สมชาย ใจดี"
             onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AddressField({ value, disabled, onChange }: FieldProps) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      ที่อยู่ผู้รับ <span className="text-red-600">*</span>
      <textarea className="input mt-1 min-h-24 resize-y" value={value} maxLength={300}
                disabled={disabled} placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
                onChange={(event) => onChange(event.target.value)} />
      <span className="mt-1 block text-right text-xs text-slate-400">{value.length}/300</span>
    </label>
  );
}

function PhoneField({ value, disabled, onChange }: FieldProps) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      เบอร์โทรผู้รับ <span className="text-red-600">*</span>
      <input className="input mt-1" value={value} maxLength={30} disabled={disabled}
             inputMode="tel" placeholder="เช่น 0812345678"
             onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ModalHeader({ billNo, onClose }: { billNo: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <PackageCheck className="h-5 w-5 text-orange-600" /> ป้ายจัดส่ง 10×15 ซม. — {billNo}
      </h2>
      <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="ปิด">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModalFooter({ disabled, printing, onClose }: {
  disabled: boolean; printing: boolean; onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t px-5 py-3">
      <button type="button" className="btn-secondary" onClick={onClose} disabled={printing}>ยกเลิก</button>
      <button type="submit" className="btn-primary" disabled={disabled}>
        <Printer className="h-4 w-4" /> {printing ? 'กำลังพิมพ์...' : 'พิมพ์ป้าย 10×15'}
      </button>
    </div>
  );
}

export function ShippingLabelModal({ order, onClose }: ModalProps) {
  useModalChrome(onClose);
  const [recipient, setRecipient] = useState(() => recipientFromOrder(order));
  const printer = useShippingLabelPrinter();
  const update = (field: keyof ShippingLabelRecipient) => (value: string) =>
    setRecipient((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const error = validateShippingRecipient(recipient);
    if (error) return toast.error(error);
    if (await printer.printShippingLabel(recipient, order.billNo)) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
         onClick={backdropCloseHandler(onClose)}>
      <form onSubmit={submit} role="dialog" aria-modal="true"
            className="my-auto w-full max-w-lg rounded-lg bg-white shadow-2xl">
        <ModalHeader billNo={order.billNo} onClose={onClose} />
        <div className="space-y-3 p-5">
          <div className="rounded-md border border-orange-200 bg-orange-50 p-2.5 text-xs text-orange-800">
            กระดาษสติ๊กเกอร์แนวตั้ง <strong>กว้าง 100 × ยาว 150 มม.</strong> · 1 ดวงต่อแถว ·
            QR ด้านล่างเปิดเว็บไซต์ร้าน ส่วนข้อมูลผู้ส่งและสัญลักษณ์ขนส่งคงที่
          </div>
          <SenderCard />
          <NameField value={recipient.name} disabled={printer.isPrinting} onChange={update('name')} />
          <AddressField value={recipient.address} disabled={printer.isPrinting} onChange={update('address')} />
          <PhoneField value={recipient.phone} disabled={printer.isPrinting} onChange={update('phone')} />
        </div>
        <ModalFooter disabled={printer.isPrinting || !!validateShippingRecipient(recipient)}
                     printing={printer.isPrinting} onClose={onClose} />
      </form>
    </div>,
    document.body,
  );
}
