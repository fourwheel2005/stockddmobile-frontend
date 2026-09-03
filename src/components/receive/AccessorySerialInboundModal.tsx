import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Save, X, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import { lotsApi } from '@/api/lots';
import { extractErrorMessage } from '@/api/client';
import { AccessorySerialList, type AccessorySerialRow } from '@/components/products/AccessorySerialList';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { ACQ_INFO, ACQ_ORDER } from '@/lib/acquisition';
import { shopToday } from '@/lib/datetime';
import { formatTHB } from '@/lib/format';
import { useBranchStore } from '@/stores/branchStore';
import type {
  AcquisitionType,
  LotInboundRequest,
  ProductDetail,
  VariantResponse,
} from '@/types/api';

const EMPTY_SERIAL: AccessorySerialRow = { imei: '', serialNumber: '' };

export interface AccessorySerialInboundModalProps {
  product: ProductDetail;
  initialVariant?: VariantResponse;
  onClose: () => void;
  onDone: () => void;
}

export interface AccessoryLotValues {
  lotNo: string;
  importDate: string;
  branchId?: string;
  variantId: string;
  serialNumbers: string[];
  acquisitionType: AcquisitionType;
  purchasePrice?: number;
  supplierRef?: string;
  invoiceNo?: string;
  warrantyTerms?: string;
  warrantyExpire?: string;
  note?: string;
}

const blank = (value: string | undefined) => value?.trim() || undefined;

/** Pure payload builder — อุปกรณ์เสริมส่งเฉพาะ Barcode/SN ไม่สร้าง IMEI ปลอม. */
export function buildAccessoryLotInboundRequest(values: AccessoryLotValues): LotInboundRequest {
  const auditNote = [
    'รับเข้าอุปกรณ์เสริมแบบ Barcode/SN รายชิ้น',
    blank(values.supplierRef) && `supplier: ${blank(values.supplierRef)}`,
    blank(values.invoiceNo) && `invoice: ${blank(values.invoiceNo)}`,
    blank(values.note),
  ].filter(Boolean).join(' · ');

  return {
    lotNo: values.lotNo,
    importDate: values.importDate,
    branchId: values.branchId,
    note: auditNote,
    items: values.serialNumbers.map((serialNumber) => ({
      variantId: values.variantId,
      serialNumber: serialNumber.trim(),
      condition: 'NEW',
      acquisitionType: values.acquisitionType,
      purchasePrice: values.purchasePrice,
      warrantyTerms: blank(values.warrantyTerms),
      warrantyExpire: blank(values.warrantyExpire),
    })),
  };
}

function createAccessoryLotNo() {
  const date = shopToday().replaceAll('-', '');
  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  return `ACC-${date}-${entropy}`;
}

const variantLabel = (variant: VariantResponse) => {
  const spec = [variant.color, variant.storage, variant.network].filter(Boolean).join(' / ');
  return `${variant.sku}${spec ? ` · ${spec}` : ''}`;
};

/**
 * รับเข้าอุปกรณ์เสริม serialized: เลือก SKU ครั้งเดียว + ยิง Barcode/SN รายชิ้น.
 * ไม่แสดง IMEI/สี/ความจุ/แบต/ผ่อน เพราะไม่ใช่ข้อมูลของ accessory.
 */
export function AccessorySerialInboundModal({
  product,
  initialVariant,
  onClose,
  onDone,
}: AccessorySerialInboundModalProps) {
  useModalChrome(onClose);
  const qc = useQueryClient();
  const activeBranchId = useBranchStore((state) => state.activeBranchId);
  const variants = useMemo(() => product.variants.filter((variant) => variant.active), [product.variants]);
  const initialVariantId = initialVariant?.active
    ? initialVariant.id
    : (variants.length === 1 ? variants[0].id : '');

  const [variantId, setVariantId] = useState(initialVariantId);
  const [serialRows, setSerialRows] = useState<AccessorySerialRow[]>([{ ...EMPTY_SERIAL }]);
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>('PURCHASE');
  const [unitCost, setUnitCost] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [warrantyExpire, setWarrantyExpire] = useState('');
  const [note, setNote] = useState('');
  const [lotNo] = useState(createAccessoryLotNo);

  const selectedVariant = variants.find((variant) => variant.id === variantId);
  const validSerials = serialRows.map((row) => row.serialNumber.trim()).filter(Boolean);

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedVariant) throw new Error('กรุณาเลือก SKU ที่จะรับเข้า');
      if (validSerials.length === 0) throw new Error('ยิงหรือพิมพ์ Barcode/S/N อย่างน้อย 1 ชิ้น');
      if (new Set(validSerials).size !== validSerials.length) {
        throw new Error('มี Barcode/S/N ซ้ำกันในรายการ กรุณาแก้ก่อนบันทึก');
      }

      const parsedCost = unitCost.trim() === ''
        ? (selectedVariant.costPrice ?? undefined)
        : Number(unitCost);
      if (parsedCost !== undefined && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
        throw new Error('ทุนต่อชิ้นไม่ถูกต้อง');
      }

      return lotsApi.inbound(buildAccessoryLotInboundRequest({
        lotNo,
        importDate: shopToday(),
        branchId: activeBranchId ?? undefined,
        variantId: selectedVariant.id,
        serialNumbers: validSerials,
        acquisitionType,
        purchasePrice: parsedCost,
        supplierRef,
        invoiceNo,
        warrantyTerms,
        warrantyExpire,
        note,
      }));
    },
    onSuccess: () => {
      toast.success(`รับเข้าอุปกรณ์เสริม ${validSerials.length} ชิ้นแล้ว`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['lots'] });
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      qc.invalidateQueries({ queryKey: ['product-serials', product.id] });
      onDone();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-3 pt-[3vh] backdrop-blur-sm animate-modal-fade-in sm:p-4 sm:pt-[5vh]">
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold sm:text-lg"><Inbox className="inline h-4 w-4 align-[-2px]" /> รับเข้าอุปกรณ์เสริม — {product.name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">กรอกเฉพาะ Barcode/S/N ต่อชิ้น · ที่มา ทุน และประกันใช้ร่วมกันทั้งล็อต</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {variants.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              รุ่นนี้ยังไม่มี SKU ที่เปิดใช้งาน — กรุณาสร้างรุ่นย่อยก่อนรับเข้า
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                  <Package className="h-4 w-4 text-emerald-600" /> SKU และข้อมูลล็อต
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="sm:col-span-2 lg:col-span-3">
                    <span className="mb-1 block text-xs font-medium text-slate-600">SKU ที่รับเข้า *</span>
                    <select className="input" value={variantId} onChange={(event) => setVariantId(event.target.value)} disabled={!!initialVariant}>
                      <option value="">— เลือก SKU —</option>
                      {variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>)}
                    </select>
                    {selectedVariant && (
                      <span className="mt-1 block text-[11px] text-slate-500">
                        ราคาขาย {formatTHB(selectedVariant.sellingPrice)} · ทุนเดิม {selectedVariant.costPrice == null ? 'ซ่อนไว้ตามสิทธิ์' : formatTHB(selectedVariant.costPrice)}
                      </span>
                    )}
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">ที่มา *</span>
                    <select className="input" value={acquisitionType} onChange={(event) => setAcquisitionType(event.target.value as AcquisitionType)}>
                      <optgroup label="ประเภทธุรกรรม">
                        {ACQ_ORDER.filter((key) => ACQ_INFO[key].group === 'TXN').map((key) => (
                          <option key={key} value={key}>{ACQ_INFO[key].th}</option>
                        ))}
                      </optgroup>
                      <optgroup label="ซัพพลายเออร์">
                        {ACQ_ORDER.filter((key) => ACQ_INFO[key].group === 'SUPPLIER').map((key) => (
                          <option key={key} value={key}>{ACQ_INFO[key].th}</option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">ทุน/ชิ้น (บาท)</span>
                    <input className="input" type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder={selectedVariant?.costPrice != null ? `เดิม ${selectedVariant.costPrice}` : 'เช่น 590'} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">ผู้ขาย / Supplier</span>
                    <input className="input" value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} placeholder="ชื่อร้าน" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">เลขใบกำกับ</span>
                    <input className="input font-mono" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="INV-..." />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">ประกันทั้งล็อต</span>
                    <input className="input" value={warrantyTerms} onChange={(event) => setWarrantyTerms(event.target.value)} placeholder="เช่น ประกันศูนย์ 1 ปี" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">วันหมดประกัน</span>
                    <input className="input" type="date" value={warrantyExpire} onChange={(event) => setWarrantyExpire(event.target.value)} />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-2">
                  <h3 className="font-semibold text-slate-800">รายการ Barcode / S/N (Quick-Add)</h3>
                  <p className="text-xs text-slate-500">1 Barcode/S/N = 1 ชิ้นในสต๊อก · ยิงต่อเนื่องแล้วกด Enter ได้เลย</p>
                </div>
                <AccessorySerialList items={serialRows} onChange={setSerialRows} />
              </section>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">หมายเหตุ</span>
                <textarea className="input min-h-20 resize-y" value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
          <div className="text-sm text-slate-600">สรุป: <strong>{validSerials.length}</strong> ชิ้น · 1 lot</div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={submit.isPending}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending || variants.length === 0}>
              <Save className="h-4 w-4" /> {submit.isPending ? 'กำลังบันทึก...' : 'บันทึก + รับเข้า'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
