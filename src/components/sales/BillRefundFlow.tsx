import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileMinus2, PackageOpen, Undo2 } from 'lucide-react';
import { posApi } from '@/api/pos';
import { creditNoteApi } from '@/api/creditNote';
import { extractErrorMessage } from '@/api/client';
import { RefundMethodModal } from '@/components/RefundMethodModal';
import { ReturnDeviceModal } from '@/components/ReturnDeviceModal';
import { SecurityCodeModal } from '@/components/SecurityCodeModal';
import { usePrinter } from '@/hooks/usePrinter';
import { billRefundOptions, type BillRefundAction } from '@/lib/pos/billRefund';
import type { RefundMethod, SalesOrderResponse } from '@/types/api';

type Pending =
  | { kind: 'REFUND' | 'CREDIT_NOTE'; order: SalesOrderResponse; reason: string; refundMethod: RefundMethod }
  | { kind: 'RETURN_DEVICE'; order: SalesOrderResponse; refundAmount: number; reason: string; refundMethod: RefundMethod };

/**
 * ขั้นตอนยกเลิกบิล/คืนเงิน (FIX-228) — ใช้ร่วม "ประวัติการขาย" และ "หน้ารายละเอียดบิล"
 * เลือกวิธีคืน + เหตุผล → รหัสความปลอดภัยของร้าน (FIX-103) → backend คืนสต็อก + บันทึกเงินคืนในเก๊ะ
 */
export function useBillRefundFlow() {
  const qc = useQueryClient();
  const printer = usePrinter();
  const [choosing, setChoosing] = useState<{ action: BillRefundAction; order: SalesOrderResponse } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const refreshAfterRefund = () => {
    for (const key of ['sales-orders', 'order-detail', 'inventory', 'transactions',
      'cash-session', 'cash-register-history', 'cash-register-summary']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const mutation = useMutation({
    mutationFn: async ({ p, securityCode }: { p: Pending; securityCode: string }):
      Promise<{ billNo: string; creditNoteNo?: string }> => {
      if (p.kind === 'RETURN_DEVICE') {
        const o = await posApi.returnDevice(p.order.id, p.refundAmount, securityCode, p.reason, p.refundMethod);
        return { billNo: o.billNo };
      }
      if (p.kind === 'CREDIT_NOTE') {
        const cn = await creditNoteApi.issueAndRefund(p.order.id, p.reason, securityCode, p.refundMethod);
        return { billNo: p.order.billNo, creditNoteNo: cn.creditNoteNo };
      }
      return { billNo: (await posApi.refund(p.order.id, securityCode, p.reason, p.refundMethod)).billNo };
    },
    onSuccess: (res, { p }) => {
      if (p.kind === 'REFUND') toast.success(`ยกเลิกบิล ${res.billNo} และคืนเงินแล้ว — สินค้ากลับเข้าสต็อก`);
      if (p.kind === 'CREDIT_NOTE') {
        toast.success(`ออกใบลดหนี้ ${res.creditNoteNo ?? ''} และคืนเงินบิล ${res.billNo} แล้ว`);
        printer.printCreditNote(p.order.id).catch(() => undefined);
      }
      if (p.kind === 'RETURN_DEVICE') toast.success(`รับเครื่องคืนบิล ${res.billNo} แล้ว — เครื่องเข้าสต็อกแล้ว`);
      setPending(null);
      refreshAfterRefund();
    },
    onError: (e) => toast.error(extractErrorMessage(e), { duration: 8000 }),
  });

  const start = (order: SalesOrderResponse, action: BillRefundAction) => setChoosing({ action, order });

  const modals: ReactNode = (
    <>
      {choosing && choosing.action !== 'RETURN_DEVICE' && (
        <RefundMethodModal
          order={choosing.order}
          creditNote={choosing.action === 'CREDIT_NOTE'}
          onClose={() => setChoosing(null)}
          onConfirm={(reason, refundMethod) => {
            setPending({ kind: choosing.action as 'REFUND' | 'CREDIT_NOTE', order: choosing.order, reason, refundMethod });
            setChoosing(null);
          }}
        />
      )}
      {choosing && choosing.action === 'RETURN_DEVICE' && (
        <ReturnDeviceModal
          order={choosing.order}
          onClose={() => setChoosing(null)}
          onConfirm={(refundAmount, reason, refundMethod) => {
            setPending({ kind: 'RETURN_DEVICE', order: choosing.order, refundAmount, reason, refundMethod });
            setChoosing(null);
          }}
        />
      )}
      {pending && (
        <SecurityCodeModal
          action={pending.kind === 'REFUND' ? `ยกเลิก/คืนเงินบิล ${pending.order.billNo}`
            : pending.kind === 'CREDIT_NOTE' ? `ออกใบลดหนี้และคืนเงินบิล ${pending.order.billNo}`
              : `รับเครื่องคืนบิล ${pending.order.billNo}`}
          warning={pending.kind === 'REFUND' ? 'สินค้ากลับเข้าสต็อก ยอดขายบิลนี้ถูกตัดออก และบันทึกเงินคืนในเก๊ะ — ย้อนกลับไม่ได้'
            : pending.kind === 'CREDIT_NOTE' ? 'ระบบจะออกใบลดหนี้เต็มจำนวน คืนสินค้าเข้าสต๊อก และบันทึกเงินคืน — ย้อนกลับไม่ได้'
              : 'เครื่องจะกลับเข้าสต็อกและยอดที่ชำระถูกปรับ — ย้อนกลับไม่ได้'}
          pending={mutation.isPending}
          onClose={() => setPending(null)}
          onConfirm={(securityCode) => mutation.mutate({ p: pending, securityCode })}
        />
      )}
    </>
  );

  return { start, modals };
}

const TONE: Record<BillRefundAction, string> = {
  REFUND: 'border-red-200 text-red-700 hover:bg-red-50',
  CREDIT_NOTE: 'border-violet-200 text-violet-700 hover:bg-violet-50',
  RETURN_DEVICE: 'border-amber-300 text-amber-800 hover:bg-amber-50',
};

const ICON: Record<BillRefundAction, typeof Undo2> = {
  REFUND: Undo2,
  CREDIT_NOTE: FileMinus2,
  RETURN_DEVICE: PackageOpen,
};

/**
 * ปุ่มมีข้อความ (ไม่ใช่ไอคอนล้วน — iPad ไม่มี tooltip) · บิลที่คืนอัตโนมัติไม่ได้ กดแล้วบอกเหตุผลทันที
 */
export function BillRefundButtons({ order, onStart }: {
  order: SalesOrderResponse;
  onStart: (order: SalesOrderResponse, action: BillRefundAction) => void;
}) {
  const options = billRefundOptions(order);
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {options.map((opt) => {
        const Icon = ICON[opt.action];
        const blocked = opt.blockedReason;
        return (
          <button
            key={opt.action}
            type="button"
            aria-disabled={blocked ? true : undefined}
            title={blocked ?? opt.label}
            onClick={() => (blocked
              ? toast.error(blocked, { duration: 9000 })
              : onStart(order, opt.action))}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs font-semibold ${
              blocked ? 'border-slate-200 text-slate-400' : TONE[opt.action]}`}>
            <Icon className="h-3.5 w-3.5" /> {opt.label}
          </button>
        );
      })}
    </div>
  );
}
