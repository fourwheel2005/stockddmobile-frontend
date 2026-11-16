import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileMinus2, PackageOpen, Repeat, Undo2 } from 'lucide-react';
import { posApi } from '@/api/pos';
import { creditNoteApi } from '@/api/creditNote';
import { extractErrorMessage } from '@/api/client';
import { RefundMethodModal } from '@/components/RefundMethodModal';
import { SecurityCodeModal } from '@/components/SecurityCodeModal';
import { ReturnItemsModal, type ReturnItemsResult } from '@/components/sales/ReturnItemsModal';
import { usePrinter } from '@/hooks/usePrinter';
import { billRefundOptions, type BillRefundAction } from '@/lib/pos/billRefund';
import { formatTHB } from '@/lib/format';
import type { RefundMethod, SalesOrderResponse } from '@/types/api';

type Pending =
  | { kind: 'REFUND' | 'CREDIT_NOTE'; order: SalesOrderResponse; reason: string; refundMethod: RefundMethod;
      batteryHealth?: number }
  | { kind: 'RETURN_ITEMS'; order: SalesOrderResponse; result: ReturnItemsResult };

export interface StartOptions {
  /** เปิดจากการสแกนเครื่อง → เลือกเครื่องนั้นในหน้าต่างรับคืนให้ */
  preselectSerialId?: string | null;
}

/** ลิงก์ไป POS เพื่อเปลี่ยนเครื่อง (FIX-230) */
export function exchangeUrl(orderId: string, serialId?: string | null) {
  return `/pos?exchange=${encodeURIComponent(orderId)}${serialId ? `&serial=${encodeURIComponent(serialId)}` : ''}`;
}

/**
 * ขั้นตอนยกเลิกบิล/คืนเงิน/รับคืน/เปลี่ยนเครื่อง (FIX-228 → FIX-230) — ใช้ร่วม ประวัติการขาย ·
 * หน้ารายละเอียดบิล · การ์ดสแกนที่ POS · รายการเครื่องหน้าคลัง
 * เลือก → รหัสความปลอดภัยของร้าน (FIX-103) → backend คืนสต็อก + บันทึกเงินคืนในเก๊ะ
 */
export function useBillRefundFlow({ onDone }: { onDone?: (order: SalesOrderResponse) => void } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const printer = usePrinter();
  const [choosing, setChoosing] = useState<
    { action: BillRefundAction; order: SalesOrderResponse; preselectSerialId?: string | null } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const refreshAfterRefund = () => {
    for (const key of ['sales-orders', 'order-detail', 'order-returns', 'inventory', 'transactions', 'serials',
      'scan-detail', 'device-latest-order', 'device-installment-order', 'inventory-serials',
      'cash-session', 'cash-register-history', 'cash-register-summary']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const mutation = useMutation({
    mutationFn: async ({ p, securityCode }: { p: Pending; securityCode: string }):
      Promise<{ billNo: string; creditNoteNo?: string; status?: string }> => {
      if (p.kind === 'RETURN_ITEMS') {
        const o = await posApi.returnItems(p.order.id, {
          lines: p.result.lines,
          refundAmount: p.result.amount,
          refundMethod: p.result.refundMethod,
          reason: p.result.reason,
          batteryHealth: p.result.batteryHealth,
        }, securityCode);
        return { billNo: o.billNo, status: o.status };
      }
      if (p.kind === 'CREDIT_NOTE') {
        const cn = await creditNoteApi.issueAndRefund(p.order.id, p.reason, securityCode, p.refundMethod,
          p.batteryHealth);
        return { billNo: p.order.billNo, creditNoteNo: cn.creditNoteNo };
      }
      return { billNo: (await posApi.refund(p.order.id, securityCode, p.reason, p.refundMethod,
        p.batteryHealth)).billNo };
    },
    onSuccess: (res, { p }) => {
      if (p.kind === 'REFUND') toast.success(`ยกเลิกบิล ${res.billNo} และคืนเงินแล้ว — สินค้ากลับเข้าสต็อก`);
      if (p.kind === 'CREDIT_NOTE') {
        toast.success(`ออกใบลดหนี้ ${res.creditNoteNo ?? ''} และคืนเงินบิล ${res.billNo} แล้ว`);
        printer.printCreditNote(p.order.id).catch(() => undefined);
      }
      if (p.kind === 'RETURN_ITEMS') {
        toast.success(`รับคืนบิล ${res.billNo} แล้ว — สินค้าเข้าสต็อก · คืนเงิน ${formatTHB(p.result.amount)}`
          + (res.status === 'PAID' ? ' (บิลยังมีรายการที่ลูกค้าเก็บไว้)' : ''), { duration: 6000 });
      }
      onDone?.(p.order);
      setPending(null);
      refreshAfterRefund();
    },
    onError: (e) => toast.error(extractErrorMessage(e), { duration: 8000 }),
  });

  const start = (order: SalesOrderResponse, action: BillRefundAction, opts: StartOptions = {}) => {
    if (action === 'EXCHANGE') {
      navigate(exchangeUrl(order.id, opts.preselectSerialId));
      return;
    }
    setChoosing({ action, order, preselectSerialId: opts.preselectSerialId });
  };

  const securityAction = (p: Pending) => p.kind === 'RETURN_ITEMS'
    ? `รับคืนสินค้าบิล ${p.order.billNo} · คืนเงิน ${formatTHB(p.result.amount)}`
    : p.kind === 'CREDIT_NOTE' ? `ออกใบลดหนี้และคืนเงินบิล ${p.order.billNo}` : `ยกเลิก/คืนเงินบิล ${p.order.billNo}`;
  const securityWarning = (p: Pending) => p.kind === 'REFUND'
    ? 'สินค้ากลับเข้าสต็อก ยอดขายบิลนี้ถูกตัดออก และบันทึกเงินคืนในเก๊ะ — ย้อนกลับไม่ได้'
    : p.kind === 'CREDIT_NOTE' ? 'ระบบจะออกใบลดหนี้เต็มจำนวน คืนสินค้าเข้าสต๊อก และบันทึกเงินคืน — ย้อนกลับไม่ได้'
      : 'รายการที่เลือกกลับเข้าสต็อก และบันทึกเงินคืนในเก๊ะ (ถ้ามี) — ย้อนกลับไม่ได้';

  const modals: ReactNode = (
    <>
      {choosing && (choosing.action === 'REFUND' || choosing.action === 'CREDIT_NOTE') && (
        <RefundMethodModal
          order={choosing.order}
          creditNote={choosing.action === 'CREDIT_NOTE'}
          onClose={() => setChoosing(null)}
          onConfirm={(reason, refundMethod, batteryHealth) => {
            setPending({ kind: choosing.action as 'REFUND' | 'CREDIT_NOTE', order: choosing.order, reason, refundMethod,
              batteryHealth });
            setChoosing(null);
          }}
        />
      )}
      {choosing && choosing.action === 'RETURN_ITEMS' && (
        <ReturnItemsModal
          order={choosing.order}
          mode="RETURN"
          preselectSerialId={choosing.preselectSerialId}
          onClose={() => setChoosing(null)}
          onConfirm={(result) => {
            setPending({ kind: 'RETURN_ITEMS', order: choosing.order, result });
            setChoosing(null);
          }}
        />
      )}
      {pending && (
        <SecurityCodeModal
          action={securityAction(pending)}
          warning={securityWarning(pending)}
          pending={mutation.isPending}
          onClose={() => setPending(null)}
          onConfirm={(securityCode) => mutation.mutate({ p: pending, securityCode })}
        />
      )}
    </>
  );

  return { start, modals, busy: mutation.isPending };
}

const TONE: Record<BillRefundAction, string> = {
  REFUND: 'border-red-200 text-red-700 hover:bg-red-50',
  CREDIT_NOTE: 'border-violet-200 text-violet-700 hover:bg-violet-50',
  RETURN_ITEMS: 'border-amber-300 text-amber-800 hover:bg-amber-50',
  EXCHANGE: 'border-brand-200 text-brand-700 hover:bg-brand-50',
};

const ICON: Record<BillRefundAction, typeof Undo2> = {
  REFUND: Undo2,
  CREDIT_NOTE: FileMinus2,
  RETURN_ITEMS: PackageOpen,
  EXCHANGE: Repeat,
};

/**
 * ปุ่มมีข้อความ (ไม่ใช่ไอคอนล้วน — iPad ไม่มี tooltip) · บิลที่ทำอัตโนมัติไม่ได้ กดแล้วบอกเหตุผลทันที
 */
export function BillRefundButtons({ order, onStart, preselectSerialId }: {
  order: SalesOrderResponse;
  onStart: (order: SalesOrderResponse, action: BillRefundAction, opts?: StartOptions) => void;
  preselectSerialId?: string | null;
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
              : onStart(order, opt.action, { preselectSerialId }))}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs font-semibold ${
              blocked ? 'border-slate-200 text-slate-400' : TONE[opt.action]}`}>
            <Icon className="h-3.5 w-3.5" /> {opt.label}
          </button>
        );
      })}
    </div>
  );
}
