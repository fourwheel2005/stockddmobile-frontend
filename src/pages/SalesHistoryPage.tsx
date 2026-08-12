import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Receipt, Printer, Undo2, Landmark, CheckCircle2, Clock, XCircle, PackageOpen, Search, Wrench, FileText } from 'lucide-react';
import { posApi } from '@/api/pos';
import { repairApi } from '@/api/repair';
import { SalesCalendar } from '@/components/SalesCalendar';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore } from '@/stores/branchStore';
import { ReceiptPrintView } from '@/components/ReceiptPrintView';
import { RefundMethodModal } from '@/components/RefundMethodModal';
import { ReturnDeviceModal } from '@/components/ReturnDeviceModal';
import { TaxInvoiceModal } from '@/components/TaxInvoiceModal';
import { SecurityCodeModal } from '@/components/SecurityCodeModal';
import { usePrinter } from '@/hooks/usePrinter';
import { formatTHB, formatDateTime } from '@/lib/format';
import { shopDayKey } from '@/lib/datetime';
import type { FinancePayoutStatus, RepairStatus, RepairTicket, SalesOrderResponse, SalesOrderStatus } from '@/types/api';
import { FINANCE_PARTNER_LABEL } from '@/types/api';

// ─── งานซ่อม (รวมเข้าประวัติการขาย FIX-084) ────────────────────────────
const REPAIR_STATUS: Record<RepairStatus, { label: string; cls: string }> = {
  RECEIVED:    { label: 'รับเข้า',       cls: 'badge-slate' },
  IN_PROGRESS: { label: 'กำลังซ่อม',     cls: 'badge-blue' },
  DONE:        { label: 'ซ่อมเสร็จ',     cls: 'badge-green' },
  PICKED_UP:   { label: 'รับเครื่องแล้ว', cls: 'badge-green' },
  CANCELLED:   { label: 'ยกเลิก',        cls: 'badge-red' },
};

/** วันทำการของร้าน (Asia/Bangkok) แบบ YYYY-MM-DD สำหรับเทียบกับวันที่เลือกจากปฏิทิน */
const localDay = shopDayKey;

function repairMatches(r: RepairTicket, q: string): boolean {
  const s = q.toLowerCase();
  return [r.ticketNo, r.customerName, r.customerPhone, r.deviceModel, r.deviceBrand]
    .filter(Boolean)
    .some((v) => (v as string).toLowerCase().includes(s));
}

type HistoryRow =
  | { kind: 'SALE'; date: string; sale: SalesOrderResponse }
  | { kind: 'REPAIR'; date: string; repair: RepairTicket };

const FINANCE_BADGE_STYLE: Record<FinancePayoutStatus, { cls: string; icon: typeof Clock }> = {
  PENDING:  { cls: 'bg-amber-100 text-amber-800',  icon: Clock },
  APPROVED: { cls: 'bg-sky-100 text-sky-800',      icon: Clock },
  RECEIVED: { cls: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  DECLINED: { cls: 'bg-red-100 text-red-700',      icon: XCircle },
};

function FinanceBadge({ order }: { order: SalesOrderResponse }) {
  if (!order.financePartner || !order.financePayoutStatus) return null;
  const style = FINANCE_BADGE_STYLE[order.financePayoutStatus];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.cls}`}
          title={`${FINANCE_PARTNER_LABEL[order.financePartner]} — ${order.financePayoutStatus}`}>
      <Landmark className="h-3 w-3" />
      {FINANCE_PARTNER_LABEL[order.financePartner]}
      <Icon className="h-3 w-3" />
    </span>
  );
}

const STATUS_BADGE: Record<SalesOrderStatus, string> = {
  DRAFT: 'badge-slate',
  PAID: 'badge-green',
  CANCELLED: 'badge-red',
  REFUNDED: 'badge-amber',
};

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  DRAFT: 'ยังไม่ปิดบิล',
  PAID: 'จ่ายแล้ว',
  CANCELLED: 'ยกเลิก',
  REFUNDED: 'คืนเงินแล้ว',
};

export function SalesHistoryPage() {
  const qc = useQueryClient();
  // ทุก role กดได้ แต่ต้องผ่านรหัสความปลอดภัยของร้านเสมอ (FIX-103) — backend บังคับซ้ำอีกชั้น
  const canRefund = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER', 'STAFF'));
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<SalesOrderStatus | ''>('');
  const [day, setDay] = useState<string | null>(null);   // วันที่เลือกจากปฏิทิน (YYYY-MM-DD)
  const [search, setSearch] = useState('');              // input ดิบ
  const [q, setQ] = useState('');                        // debounced → ส่ง query
  const [printOrder, setPrintOrder] = useState<SalesOrderResponse | null>(null);
  const [refundOrder, setRefundOrder] = useState<SalesOrderResponse | null>(null);
  const [returnOrder, setReturnOrder] = useState<SalesOrderResponse | null>(null);
  // FIX-150: ออกใบกำกับภาษีเต็มรูปแบบ (บิล PAID)
  const [taxInvoiceFor, setTaxInvoiceFor] = useState<SalesOrderResponse | null>(null);
  // ขั้นยืนยันด้วยรหัสความปลอดภัย — เก็บสิ่งที่จะทำไว้ระหว่างรอรหัส (FIX-103)
  const [pendingRefund, setPendingRefund] =
    useState<{ order: SalesOrderResponse; reason: string } | null>(null);
  const [pendingReturn, setPendingReturn] =
    useState<{ order: SalesOrderResponse; refundAmount: number; reason: string } | null>(null);

  // debounce คำค้น (เลขบิล/ลูกค้า)
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const { data, isLoading } = useQuery({
    queryKey: ['sales-orders', { page, status, day, q, activeBranchId }],
    queryFn: () => posApi.listOrders({
      page, size: 50,
      status: status || undefined,
      branchId: activeBranchId || undefined,   // กรองตามสาขาที่เลือก (Phase 2C)
      from: day || undefined,
      to: day || undefined,
      q: q || undefined,
    }),
  });

  // งานซ่อม — แทรกในหน้าแรกเมื่อดู "ทุกสถานะ" (ไม่กรองสถานะบิลขาย). ดึงมาชุดเดียวแล้วกรอง client-side
  const showRepairs = page === 0 && !status;
  const { data: repairData } = useQuery({
    queryKey: ['repair-tickets', 'history-merge'],
    queryFn: () => repairApi.list({ size: 200 }),
    enabled: showRepairs,
  });

  // รวม ขาย + ซ่อม → เรียงตามวันล่าสุด (ISO เรียงตามตัวอักษรได้เลย)
  const rows: HistoryRow[] = [
    ...(data?.content ?? []).map((s): HistoryRow => ({ kind: 'SALE', date: s.createdAt, sale: s })),
    ...(showRepairs ? (repairData?.content ?? []) : [])
      .filter((r) => !day || localDay(r.receivedAt) === day)
      .filter((r) => !q || repairMatches(r, q))
      .map((r): HistoryRow => ({ kind: 'REPAIR', date: r.receivedAt, repair: r })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const refund = useMutation({
    mutationFn: ({ id, reason, securityCode }: { id: string; reason: string; securityCode: string }) =>
      posApi.refund(id, securityCode, reason),
    onSuccess: (order) => {
      toast.success(`คืนเงินบิล ${order.billNo} สำเร็จ`);
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const handleRefund = (o: SalesOrderResponse) => {
    // V31 Q3 — แทน window.prompt ด้วย modal ที่ให้พนักงานเลือก method
    setRefundOrder(o);
  };

  const returnDevice = useMutation({
    mutationFn: ({ id, refundAmount, reason, securityCode }:
                 { id: string; refundAmount: number; reason: string; securityCode: string }) =>
      posApi.returnDevice(id, refundAmount, securityCode, reason),
    onSuccess: (order) => {
      toast.success(`รับเครื่องคืนบิล ${order.billNo} สำเร็จ — เครื่องเข้าสต็อกแล้ว`);
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const printer = usePrinter();

  /**
   * Reprint with ESC/POS via Bridge (DUPLICATE audit) — fallback ไป browser print
   * ถ้า Bridge/WebUSB/Browser ทั้ง 3 ล้มเหลว → จะใช้ window.print() ของ HTML
   */
  const handlePrint = async (id: string) => {
    try {
      // ลอง print ผ่าน Bridge ก่อน (จะ create DUPLICATE job + audit log)
      await printer.printReceipt(id, { duplicate: true, openDrawer: false });
    } catch {
      // Fallback: HTML print
      try {
        const order = await posApi.getOrder(id);
        setPrintOrder(order);
        setTimeout(() => window.print(), 100);
      } catch (e) {
        toast.error(extractErrorMessage(e));
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Receipt className="h-6 w-6 text-brand-600" /> ประวัติการขาย (Sales History)
          </h1>
          <p className="text-sm text-slate-500">บิลขาย + งานซ่อม (🔧) รวมในไทม์ไลน์เดียว</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {/* ค้นหาเลขบิล / ลูกค้า */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input w-56 pl-8"
              placeholder="ค้นหาเลขบิล / ชื่อลูกค้า / IMEI / Serial"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* ปฏิทินยอดขาย — มาร์กวันที่มีการขาย */}
          <SalesCalendar selected={day} onSelect={(d) => { setDay(d); setPage(0); }} />
          {/* สถานะ */}
          <select className="input w-40" value={status}
                  onChange={(e) => { setStatus(e.target.value as SalesOrderStatus | ''); setPage(0); }}>
            <option value="">ทุกสถานะ</option>
            <option value="PAID">จ่ายแล้ว</option>
            <option value="REFUNDED">คืนเงินแล้ว</option>
            <option value="DRAFT">ยังไม่ปิด</option>
            <option value="CANCELLED">ยกเลิก</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">เลขที่บิล</th>
                <th className="px-5 py-2.5">ลูกค้า</th>
                <th className="px-5 py-2.5 text-right">รายการ</th>
                <th className="px-5 py-2.5 text-right">ยอดสุทธิ</th>
                <th className="px-5 py-2.5">วิธีชำระ</th>
                <th className="px-5 py-2.5">สถานะ</th>
                <th className="px-5 py-2.5">ผู้ขาย</th>
                <th className="px-5 py-2.5">วันที่</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {rows.map((row) => row.kind === 'SALE' ? (
                <tr key={row.sale.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/pos/orders/${row.sale.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                      {row.sale.billNo}
                    </Link>
                    {row.sale.branchName && (
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">🏪 {row.sale.branchName}</span>
                    )}
                    {/* FinanceBadge ซ่อนชั่วคราว — ร้านผ่อนเอง ไม่ผ่านไฟแนนซ์ */}
                  </td>
                  <td className="px-5 py-3">{row.sale.customerName ?? <span className="text-slate-400">Walk-in</span>}</td>
                  <td className="px-5 py-3 text-right">{row.sale.items.length}</td>
                  <td className="px-5 py-3 text-right font-bold">{formatTHB(row.sale.grandTotal)}</td>
                  <td className="px-5 py-3 text-xs">{row.sale.paymentMethod ?? '-'}</td>
                  <td className="px-5 py-3"><span className={STATUS_BADGE[row.sale.status]}>{STATUS_LABEL[row.sale.status]}</span></td>
                  <td className="px-5 py-3 text-xs">{row.sale.createdBy}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(row.sale.createdAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                        title="พิมพ์ใบเสร็จ"
                        onClick={() => handlePrint(row.sale.id)}>
                        <Printer className="h-4 w-4" />
                      </button>
                      {row.sale.status === 'PAID' && (
                        <button
                          className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                          title="ออกใบกำกับภาษีเต็มรูปแบบ"
                          onClick={() => setTaxInvoiceFor(row.sale)}>
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                      {canRefund && row.sale.status === 'PAID' && row.sale.paymentMethod === 'INSTALLMENT' && (
                        <button
                          className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                          title="รับเครื่องคืน (ผ่อนไม่ไหว)"
                          onClick={() => setReturnOrder(row.sale)}>
                          <PackageOpen className="h-4 w-4" />
                        </button>
                      )}
                      {canRefund && row.sale.status === 'PAID' && (
                        <button
                          className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                          title="คืนเงิน"
                          onClick={() => handleRefund(row.sale)}>
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={`r-${row.repair.id}`} className="bg-amber-50/30 hover:bg-amber-50/60">
                  <td className="px-5 py-3">
                    <Link to="/repairs" className="font-mono font-semibold text-amber-700 hover:underline">
                      {row.repair.ticketNo}
                    </Link>
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      <Wrench className="h-3 w-3" /> ซ่อม
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {row.repair.customerName || <span className="text-slate-400">-</span>}
                    <div className="text-[11px] text-slate-400">
                      {[row.repair.deviceBrand, row.repair.deviceModel].filter(Boolean).join(' ')}
                      {row.repair.reportedSymptom ? ` · ${row.repair.reportedSymptom}` : ''}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300">—</td>
                  <td className="px-5 py-3 text-right font-bold">
                    {formatTHB(row.repair.repairCost || row.repair.estimatedCost || 0)}
                    {row.repair.depositAmount > 0 && (
                      <div className="text-[11px] font-normal text-slate-400">มัดจำ {formatTHB(row.repair.depositAmount)}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs">{row.repair.paymentMethod ?? '-'}</td>
                  <td className="px-5 py-3"><span className={REPAIR_STATUS[row.repair.status].cls}>{REPAIR_STATUS[row.repair.status].label}</span></td>
                  <td className="px-5 py-3 text-xs">{row.repair.receivedBy}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(row.repair.receivedAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link to="/repairs" className="inline-flex rounded p-1.5 text-slate-600 hover:bg-slate-100" title="ไปหน้างานซ่อม">
                        <Wrench className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">ยังไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
            <div>หน้า {data.page + 1} / {data.totalPages}</div>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              <button className="btn-secondary" disabled={data.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </div>
          </div>
        )}
      </div>

      {printOrder && <ReceiptPrintView order={printOrder} />}

      {refundOrder && (
        <RefundMethodModal
          order={refundOrder}
          loading={refund.isPending}
          onClose={() => setRefundOrder(null)}
          onConfirm={(reason) => {
            // ขั้นที่ 2 — ต้องผ่านรหัสความปลอดภัยของร้านก่อนเสมอ (FIX-103)
            setPendingRefund({ order: refundOrder, reason });
            setRefundOrder(null);
          }}
        />
      )}

      {pendingRefund && (
        <SecurityCodeModal
          action={`ยกเลิก/คืนเงินบิล ${pendingRefund.order.billNo}`}
          warning="เครื่องจะกลับเข้าสต็อกและยอดขายบิลนี้ถูกตัดออก — ย้อนกลับไม่ได้"
          pending={refund.isPending}
          onClose={() => setPendingRefund(null)}
          onConfirm={(securityCode) => {
            refund.mutate(
              { id: pendingRefund.order.id, reason: pendingRefund.reason, securityCode },
              { onSuccess: () => setPendingRefund(null) },
            );
          }}
        />
      )}

      {taxInvoiceFor && (
        <TaxInvoiceModal order={taxInvoiceFor} onClose={() => setTaxInvoiceFor(null)} />
      )}

      {returnOrder && (
        <ReturnDeviceModal
          order={returnOrder}
          loading={returnDevice.isPending}
          onClose={() => setReturnOrder(null)}
          onConfirm={(refundAmount, reason) => {
            setPendingReturn({ order: returnOrder, refundAmount, reason });
            setReturnOrder(null);
          }}
        />
      )}

      {pendingReturn && (
        <SecurityCodeModal
          action={`รับเครื่องคืนบิล ${pendingReturn.order.billNo}`}
          warning="เครื่องจะกลับเข้าสต็อกและยอดที่ชำระถูกปรับ — ย้อนกลับไม่ได้"
          pending={returnDevice.isPending}
          onClose={() => setPendingReturn(null)}
          onConfirm={(securityCode) => {
            returnDevice.mutate(
              {
                id: pendingReturn.order.id,
                refundAmount: pendingReturn.refundAmount,
                reason: pendingReturn.reason,
                securityCode,
              },
              { onSuccess: () => setPendingReturn(null) },
            );
          }}
        />
      )}
    </div>
  );
}
