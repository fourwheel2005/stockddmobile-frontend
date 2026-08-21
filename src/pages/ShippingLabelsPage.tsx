import { useState } from 'react';
import { PackageCheck, Printer } from 'lucide-react';
import {
  EMPTY_SHIPPING_LABEL_RECIPIENT,
  ShippingLabelForm,
} from '@/components/shipping/ShippingLabelForm';

export function ShippingLabelsPage() {
  const [formKey, setFormKey] = useState(0);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-orange-600" /> พิมพ์ใบจัดส่ง
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          พิมพ์ป้ายผู้รับได้ทันทีโดยไม่ต้องเปิดบิล รูปแบบเดียวกับหน้า POS บนกระดาษ 100×150 มม.
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        <div className="flex items-start gap-2">
          <Printer className="mt-0.5 h-4 w-4 shrink-0" />
          <span>ต้องเปิด Local Bridge และเชื่อมเครื่อง TSC TTP-247 ก่อนพิมพ์</span>
        </div>
      </div>

      <ShippingLabelForm
        key={formKey}
        initialRecipient={EMPTY_SHIPPING_LABEL_RECIPIENT}
        className="card overflow-visible"
        onPrinted={() => setFormKey((current) => current + 1)}
      />
    </div>
  );
}
