import type { IssueTaxInvoiceRequest } from '@/api/taxInvoice';

interface FieldProps {
  value: IssueTaxInvoiceRequest;
  set: (patch: Partial<IssueTaxInvoiceRequest>) => void;
}

function BuyerTypeSelector({ value, set }: FieldProps) {
  const isVat = value.buyerType === 'VAT_REGISTERED';
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">ประเภทผู้ซื้อ</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={!isVat ? 'btn-primary' : 'btn-secondary'}
                onClick={() => set({ buyerType: 'INDIVIDUAL', customerBranchCode: undefined })}>บุคคลทั่วไป</button>
        <button type="button" className={isVat ? 'btn-primary' : 'btn-secondary'}
                onClick={() => set({ buyerType: 'VAT_REGISTERED', customerBranchCode: '00000' })}>บริษัท / ผู้จด VAT</button>
      </div>
    </div>
  );
}

function BuyerBranchSelector({ value, set }: FieldProps) {
  if (value.buyerType !== 'VAT_REGISTERED') return null;
  const headOffice = value.customerBranchCode === '00000';
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">สถานประกอบการผู้ซื้อ <span className="text-red-500">*</span></label>
      <div className="mb-2 flex gap-2">
        <button type="button" className={headOffice ? 'btn-primary' : 'btn-secondary'}
                onClick={() => set({ customerBranchCode: '00000' })}>สำนักงานใหญ่</button>
        <button type="button" className={!headOffice ? 'btn-primary' : 'btn-secondary'}
                onClick={() => set({ customerBranchCode: '' })}>สาขา</button>
      </div>
      {!headOffice && <input className="input font-mono" value={value.customerBranchCode ?? ''} maxLength={5}
                            onChange={(e) => set({ customerBranchCode: e.target.value.replace(/\D/g, '') })}
                            placeholder="เลขสาขา 5 หลัก เช่น 00001" inputMode="numeric" />}
    </div>
  );
}

export function TaxInvoiceBuyerFields({ value, onChange }: {
  value: IssueTaxInvoiceRequest;
  onChange: (next: IssueTaxInvoiceRequest) => void;
}) {
  const set = (patch: Partial<IssueTaxInvoiceRequest>) => onChange({ ...value, ...patch });
  const isVat = value.buyerType === 'VAT_REGISTERED';

  return (
    <div className="space-y-3">
      <BuyerTypeSelector value={value} set={set} />
      <div>
        <label className="mb-1 block text-sm font-medium">
          ชื่อลูกค้า / บริษัท <span className="text-red-500">*</span>
        </label>
        <input className="input" value={value.customerName}
               onChange={(e) => set({ customerName: e.target.value })}
               placeholder="ชื่อบุคคล หรือนิติบุคคลตามทะเบียน" autoFocus />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          เลขผู้เสียภาษี / เลขบัตรประชาชน {isVat && <span className="text-red-500">*</span>}
        </label>
        <input className="input font-mono" value={value.customerTaxId ?? ''} maxLength={13}
               onChange={(e) => set({ customerTaxId: e.target.value.replace(/\D/g, '') || undefined })}
               placeholder={isVat ? 'เลขผู้เสียภาษี 13 หลัก' : 'เว้นได้สำหรับบุคคลทั่วไป'} inputMode="numeric" />
      </div>
      <BuyerBranchSelector value={value} set={set} />
      <div>
        <label className="mb-1 block text-sm font-medium">ที่อยู่ตามทะเบียน <span className="text-red-500">*</span></label>
        <textarea className="input min-h-[72px]" value={value.customerAddress}
                  onChange={(e) => set({ customerAddress: e.target.value })} maxLength={500}
                  placeholder="เลขที่ ... ตำบล ... อำเภอ ... จังหวัด ... รหัสไปรษณีย์" />
      </div>
    </div>
  );
}
