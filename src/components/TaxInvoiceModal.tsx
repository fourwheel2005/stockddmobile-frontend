import { useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, FileText, Printer } from 'lucide-react';
import { taxInvoiceApi } from '@/api/taxInvoice';
import { buildTaxInvoice } from '@/lib/escpos/taxInvoice';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { extractErrorMessage } from '@/api/client';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { SalesOrderResponse } from '@/types/api';

/**
 * ออกใบกำกับภาษีเต็มรูปแบบ (FIX-150) — กรอกข้อมูลผู้ซื้อ → ออกเลข TIV → พิมพ์ 80mm.
 * บิลละ 1 ใบ ออกแล้วแก้ไม่ได้ (เอกสารภาษี) — เปิดซ้ำ = พิมพ์สำเนาใบเดิม
 */
export function TaxInvoiceModal({ order, onClose }: {
  order: SalesOrderResponse;
  onClose: () => void;
}) {
  useModalChrome(onClose);
  const [name, setName] = useState(order.customerName ?? '');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const taxIdOk = /^\d{13}$/.test(taxId.trim());
  const canSubmit = name.trim() !== '' && taxIdOk && address.trim() !== '' && !busy;

  const issueAndPrint = async () => {
    setBusy(true);
    // QA FIX-151 (m2): แยก error "ออกใบ" กับ "พิมพ์" — ใบออกแล้วพิมพ์ไม่ได้ ต้องเห็นเลข TIV ชัด
    let issued: Awaited<ReturnType<typeof taxInvoiceApi.issue>> | null = null;
    try {
      issued = await taxInvoiceApi.issue(order.id, {
        customerName: name.trim(),
        customerTaxId: taxId.trim(),
        customerAddress: address.trim(),
      });
    } catch (e) {
      toast.error(extractErrorMessage(e));
      setBusy(false);
      return;
    }
    try {
      // พิมพ์ 80mm ผ่าน chain ปกติ (Epson — เครื่องเดียวกับใบเสร็จ)
      printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
      await printOrchestrator.print(buildTaxInvoice(issued), { billNo: issued.taxInvoiceNo });
      toast.success(`ออกใบกำกับภาษีแล้ว — ${issued.taxInvoiceNo}`);
    } catch (e) {
      // ใบออกแล้ว (เลขถูกบันทึก) แค่พิมพ์ไม่สำเร็จ — กดออกซ้ำ = ได้ใบเดิม (reprint)
      toast.success(`ออกใบกำกับแล้ว — ${issued.taxInvoiceNo} (บันทึกในระบบ)`, { duration: 6000 });
      toast.error(`พิมพ์ไม่สำเร็จ: ${extractErrorMessage(e)} — กดออกใบกำกับซ้ำเพื่อพิมพ์อีกครั้ง`, { duration: 8000 });
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={backdropCloseHandler(onClose)}>
      <div role="dialog" aria-modal="true"
           className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText className="h-5 w-5 text-brand-600" />
            ออกใบกำกับภาษีเต็มรูปแบบ — {order.billNo}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="ปิด">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            ⚠️ ออกได้ <strong>บิลละ 1 ใบ</strong> และ<strong>แก้ไขไม่ได้</strong>หลังออก (เอกสารภาษี) —
            ตรวจชื่อ/เลขผู้เสียภาษี/ที่อยู่ให้ถูกก่อนกด · VAT 7% แบบถอดใน (ยอดลูกค้าจ่ายเท่าเดิม)
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              ชื่อลูกค้า / บริษัทผู้ซื้อ <span className="text-red-500">*</span>
            </label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="เช่น บริษัท เอบีซี จำกัด หรือ นายสมชาย ใจดี" autoFocus />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              เลขผู้เสียภาษี / เลขบัตรประชาชน (13 หลัก) <span className="text-red-500">*</span>
            </label>
            <input className="input font-mono" value={taxId} maxLength={13}
                   onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ''))}
                   placeholder="0000000000000" inputMode="numeric" />
            {taxId !== '' && !taxIdOk && (
              <p className="mt-1 text-xs text-red-600">ต้องเป็นตัวเลข 13 หลัก (ตอนนี้ {taxId.length} หลัก)</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              ที่อยู่ (ตามที่จดทะเบียน/บัตร) <span className="text-red-500">*</span>
            </label>
            <textarea className="input min-h-[72px]" value={address}
                      onChange={(e) => setAddress(e.target.value)} maxLength={500}
                      placeholder="เลขที่ ... ตำบล ... อำเภอ ... จังหวัด ... รหัสไปรษณีย์" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn-primary inline-flex items-center gap-1.5"
                  onClick={issueAndPrint} disabled={!canSubmit}>
            <Printer className="h-4 w-4" />
            {busy ? 'กำลังออก...' : 'ออกใบกำกับ + พิมพ์'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
