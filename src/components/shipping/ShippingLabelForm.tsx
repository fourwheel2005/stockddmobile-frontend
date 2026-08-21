import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Printer } from 'lucide-react';
import { posApi } from '@/api/pos';
import { useShippingLabelPrinter } from '@/hooks/useShippingLabelPrinter';
import {
  DEFAULT_SHIPPING_LABEL_BRANDING,
  validateShippingRecipient,
  type ShippingLabelRecipient,
} from '@/lib/tspl/shippingLabel';
import type { ShippingAddressInput } from '@/types/api';
import { SavedShippingAddressPicker } from '@/components/pos/SavedShippingAddressPicker';
import { useStoreProfile } from '@/hooks/useStoreProfile';

interface ShippingLabelFormProps {
  initialRecipient: ShippingLabelRecipient;
  reference?: string;
  header?: ReactNode;
  className?: string;
  onPrinted: () => void;
  onCancel?: () => void;
}

interface FieldProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export const EMPTY_SHIPPING_LABEL_RECIPIENT: ShippingLabelRecipient = {
  name: '',
  address: '',
  phone: '',
};

function SenderCard({ branding }: { branding: typeof DEFAULT_SHIPPING_LABEL_BRANDING }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="mb-1 text-xs font-semibold text-slate-500">ผู้ส่ง (แก้ได้ในเมนูข้อมูลร้าน)</div>
      <div className="font-semibold">{branding.senderName}</div>
      {branding.senderAddress.map((line) => <div key={line}>{line}</div>)}
      <div>โทร. {branding.senderPhone}</div>
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

async function rememberRecipient(recipient: ShippingLabelRecipient, queryClient: QueryClient) {
  await posApi.rememberShippingAddress({
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    address: recipient.address,
  });
  await queryClient.invalidateQueries({ queryKey: ['shipping-addresses'] });
}

function useShippingLabelForm(props: ShippingLabelFormProps) {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState(props.initialRecipient);
  const printer = useShippingLabelPrinter();
  const storeProfile = useStoreProfile();
  const branding = storeProfile.data ? {
    senderName: storeProfile.data.shippingSenderName,
    senderAddress: [storeProfile.data.shippingAddressLine1, storeProfile.data.shippingAddressLine2],
    senderPhone: storeProfile.data.shippingPhone,
    tiktok: storeProfile.data.tiktok,
    facebook: storeProfile.data.facebook,
  } : DEFAULT_SHIPPING_LABEL_BRANDING;
  const update = (field: keyof ShippingLabelRecipient) => (value: string) =>
    setRecipient((current) => ({ ...current, [field]: value }));
  const chooseSaved = (saved: ShippingAddressInput) => setRecipient({
    name: saved.recipientName,
    phone: saved.recipientPhone,
    address: saved.address,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const error = validateShippingRecipient(recipient);
    if (error) return toast.error(error);
    if (!await printer.printShippingLabel(recipient, props.reference, branding)) return;
    try {
      await rememberRecipient(recipient, queryClient);
    } catch (rememberError) {
      console.error('Shipping label printed but address remember failed:', rememberError);
      toast.error('พิมพ์ป้ายแล้ว แต่บันทึกที่อยู่ประจำไม่สำเร็จ');
    }
    props.onPrinted();
  };
  return { recipient, printer, branding, update, chooseSaved, submit };
}

function FormBody({ form }: { form: ReturnType<typeof useShippingLabelForm> }) {
  return (
    <div className="space-y-3 p-5">
      <div className="rounded-md border border-orange-200 bg-orange-50 p-2.5 text-xs text-orange-800">
        กระดาษสติ๊กเกอร์แนวตั้ง <strong>กว้าง 100 × ยาว 150 มม.</strong> · 1 ดวงต่อแถว ·
        QR LINE อยู่ข้างข้อมูลผู้ส่ง ส่วนสัญลักษณ์ขนส่งและช่องทางร้านอยู่ด้านล่าง
      </div>
      <SenderCard branding={form.branding} />
      <SavedShippingAddressPicker disabled={form.printer.isPrinting} onSelect={form.chooseSaved} />
      <NameField value={form.recipient.name} disabled={form.printer.isPrinting} onChange={form.update('name')} />
      <AddressField value={form.recipient.address} disabled={form.printer.isPrinting}
                    onChange={form.update('address')} />
      <PhoneField value={form.recipient.phone} disabled={form.printer.isPrinting}
                  onChange={form.update('phone')} />
    </div>
  );
}

function FormActions({ form, onCancel }: {
  form: ReturnType<typeof useShippingLabelForm>;
  onCancel?: () => void;
}) {
  const disabled = form.printer.isPrinting || !!validateShippingRecipient(form.recipient);
  return (
    <div className="flex justify-end gap-2 border-t px-5 py-3">
      {onCancel && (
        <button type="button" className="btn-secondary" onClick={onCancel}
                disabled={form.printer.isPrinting}>ยกเลิก</button>
      )}
      <button type="submit" className="btn-primary" disabled={disabled}>
        <Printer className="h-4 w-4" />
        {form.printer.isPrinting ? 'กำลังพิมพ์...' : 'พิมพ์ใบจัดส่ง 10×15'}
      </button>
    </div>
  );
}

export function ShippingLabelForm(props: ShippingLabelFormProps) {
  const form = useShippingLabelForm(props);
  return (
    <form onSubmit={form.submit} className={props.className}>
      {props.header}
      <FormBody form={form} />
      <FormActions form={form} onCancel={props.onCancel} />
    </form>
  );
}
