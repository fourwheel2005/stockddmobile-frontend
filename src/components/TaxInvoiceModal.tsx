import { useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, FileText, Printer } from 'lucide-react';
import { isValidTaxInvoiceBuyer, taxInvoiceApi, type IssueTaxInvoiceRequest } from '@/api/taxInvoice';
import { extractErrorMessage } from '@/api/client';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import { TaxInvoiceBuyerFields } from '@/components/TaxInvoiceBuyerFields';
import type { SalesOrderResponse } from '@/types/api';

/**
 * ออกใบกำกับภาษีเต็มรูปแบบ — กรอกข้อมูลผู้ซื้อ → ออกเลข TIV → พิมพ์กระดาษความร้อน 80 mm.
 * บิลละ 1 ใบ ออกแล้วแก้ไม่ได้ (เอกสารภาษี) — เปิดซ้ำ = พิมพ์สำเนาใบเดิม
 */
export function TaxInvoiceModal({ order, onClose, onPrint }: {
  order: SalesOrderResponse;
  onClose: () => void;
  onPrint: (orderId: string) => Promise<unknown>;
}) {
  useModalChrome(onClose);
  const [buyer, setBuyer] = useState<IssueTaxInvoiceRequest>({
    buyerType: 'INDIVIDUAL', customerName: order.customerName ?? '', customerAddress: '',
  });
  const [issuedNo, setIssuedNo] = useState(order.taxInvoiceNo);
  const [busy, setBusy] = useState(false);

  const alreadyIssued = !!issuedNo;
  const canSubmit = (alreadyIssued || isValidTaxInvoiceBuyer(buyer)) && !busy;

  const issueAndPrint = async () => {
    setBusy(true);
    try {
      if (!alreadyIssued) {
        const issued = await taxInvoiceApi.issue(order.id, buyer);
        setIssuedNo(issued.taxInvoiceNo);
        toast.success(`ออกใบกำกับแล้ว — ${issued.taxInvoiceNo}`);
      }
    } catch (e) {
      toast.error(extractErrorMessage(e));
      setBusy(false);
      return;
    }
    try {
      await onPrint(order.id);
      onClose();
    } catch (e) {
      toast.error(`ใบกำกับถูกบันทึกแล้ว แต่พิมพ์ไม่สำเร็จ — กดพิมพ์อีกครั้งได้`, { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
         onClick={backdropCloseHandler(onClose)}>
      <div role="dialog" aria-modal="true"
           className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText className="h-5 w-5 text-brand-600" />
            ออกใบเสร็จ/ใบกำกับภาษีเต็มรูป — {order.billNo}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="ปิด">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            {alreadyIssued
              ? <>ใบกำกับ <strong>{issuedNo}</strong> ออกแล้ว — ครั้งถัดไปเป็นสำเนาหลังต้นฉบับพิมพ์สำเร็จ</>
              : <>⚠️ ตรวจชื่อ ที่อยู่ เลขผู้เสียภาษี และสาขาให้ถูกต้องก่อนออก · ออกได้ <strong>บิลละ 1 ใบ</strong> และแก้ไขไม่ได้ · VAT ถอดใน 7/107</>}
          </div>
          {!alreadyIssued && <TaxInvoiceBuyerFields value={buyer} onChange={setBuyer} />}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn-primary inline-flex items-center gap-1.5"
                  onClick={issueAndPrint} disabled={!canSubmit}>
            <Printer className="h-4 w-4" />
            {busy ? 'กำลังดำเนินการ...' : alreadyIssued ? 'พิมพ์ใบเสร็จ/ใบกำกับ' : 'ออกใบกำกับ + พิมพ์ใบเสร็จ'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
