import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Receipt, Smartphone, Pencil, CreditCard, Package, User } from 'lucide-react';
import { posApi } from '@/api/pos';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { formatTHB, formatDateTime } from '@/lib/format';
import type { PaymentMethod, SalesOrderStatus } from '@/types/api';

const STATUS_LABEL: Record<SalesOrderStatus, { text: string; cls: string }> = {
  DRAFT: { text: 'ยังไม่ปิดบิล', cls: 'bg-slate-200 text-slate-600' },
  PAID: { text: 'จ่ายแล้ว', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { text: 'ยกเลิก', cls: 'bg-red-100 text-red-700' },
  REFUNDED: { text: 'คืนเงินแล้ว', cls: 'bg-amber-100 text-amber-800' },
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'เงินโอน',
  CARD: 'บัตร',
  QR: 'QR',
  INSTALLMENT: 'ผ่อนชำระ',
  MIXED: 'ผสม',
};

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}>{value}</span>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const canEditCost = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const { data: o, isLoading, isError } = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => posApi.getOrder(id!),
    enabled: !!id,
  });

  // แก้ทุนย้อนหลังของบรรทัดพิมพ์เอง — กรอกเป็น "รหัสตัวอักษร" (convention เดิม ไม่โชว์เลขทุนบนจอ) FIX-110
  const fixCost = useMutation({
    mutationFn: ({ itemId, code }: { itemId: string; code: string }) =>
      posApi.updateCustomLineCost(id!, itemId, code),
    onSuccess: () => {
      toast.success('บันทึกทุนแล้ว — รายงานกำไรจะคิดทุนนี้');
      qc.invalidateQueries({ queryKey: ['order-detail', id] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const promptFixCost = (itemId: string) => {
    const code = window.prompt('กรอกทุน/ชิ้น เป็นรหัสตัวอักษร (เช่น SRR):');
    if (code === null || !code.trim()) return;
    fixCost.mutate({ itemId, code: code.trim().toUpperCase() });
  };

  if (isLoading) return <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>;
  if (isError || !o) return (
    <div className="space-y-4">
      <Link to="/sales" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับประวัติการขาย
      </Link>
      <div className="p-8 text-center text-slate-400">ไม่พบบิลนี้</div>
    </div>
  );

  const st = STATUS_LABEL[o.status];
  const isInstallment = o.paymentMethod === 'INSTALLMENT';
  const addOnToday = isInstallment
    ? o.items.filter((item) => item.payToday === true).reduce((sum, item) => sum + item.lineTotal, 0)
    : 0;
  const installmentSettlement = o.tradeInSettlementAmount
    ?? o.paidAmount
    ?? ((o.downPaymentAmount ?? 0) + addOnToday);
  const remaining = isInstallment ? Math.max(0, o.grandTotal - installmentSettlement) : 0;
  const tradeInSettlement = isInstallment ? installmentSettlement : o.grandTotal;
  const tradeInDifference = o.tradeInDifferenceAmount
    ?? (tradeInSettlement - (o.tradeInValue ?? 0));

  return (
    <div className="space-y-5">
      <Link to="/sales" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับประวัติการขาย
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Receipt className="h-6 w-6 text-brand-600" /> {o.billNo}
          </h1>
          <p className="text-sm text-slate-500">
            {formatDateTime(o.createdAt)} · ผู้ขาย {o.createdBy}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.text}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ลูกค้า + การชำระ */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card">
            <div className="card-header"><User className="inline h-4 w-4 align-[-2px]" /> ลูกค้า</div>
            <div className="card-body">
              <div className="font-medium">{o.customerName ?? 'ลูกค้าหน้าร้าน (Walk-in)'}</div>
              {o.customerPhone && <div className="text-sm text-slate-500">{o.customerPhone}</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><CreditCard className="inline h-4 w-4 align-[-2px]" /> การชำระเงิน</div>
            <div className="card-body">
              <Row label="วิธีชำระ" value={o.paymentMethod ?? '-'} />
              {o.cashAmount > 0 && <Row label="เงินสด" value={formatTHB(o.cashAmount)} />}
              {o.transferAmount > 0 && <Row label="โอน / QR" value={formatTHB(o.transferAmount + o.qrAmount)} />}
              {o.cardAmount > 0 && <Row label="บัตร" value={formatTHB(o.cardAmount)} />}
              <Row label="ยอดที่จ่ายแล้ว" value={formatTHB(o.paidAmount)} strong />

              {isInstallment && (
                <div className="mt-3 rounded-md bg-purple-50 p-3">
                  <div className="mb-1 text-xs font-semibold text-purple-800">รายละเอียดผ่อนชำระ</div>
                  <Row label="เงินดาวน์" value={formatTHB(o.downPaymentAmount ?? 0)} />
                  <Row label="ส่วนที่เหลือผ่อน" value={formatTHB(remaining)} />
                  <Row
                    label="ค่างวด/เดือน"
                    value={
                      o.installmentMonthlyAmount != null && o.installmentMonthlyAmount > 0
                        ? `${formatTHB(o.installmentMonthlyAmount)} × ${o.installmentMonths ?? '-'} งวด`
                        : `${o.installmentMonths ?? '-'} งวด`
                    }
                    strong
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* รายการสินค้า + ยอดรวม */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <div className="card-header"><Package className="inline h-4 w-4 align-[-2px]" /> รายการสินค้า ({o.items.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">สินค้า</th>
                    <th className="px-4 py-2">IMEI / SN</th>
                    <th className="px-4 py-2 text-right">ราคา</th>
                    <th className="px-4 py-2 text-right">จำนวน</th>
                    <th className="px-4 py-2 text-right">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {o.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {it.productName}
                        </div>
                        {it.custom ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700">
                            พิมพ์เอง · ไม่ตัดสต็อก
                            {canEditCost && (
                              <button type="button" onClick={() => promptFixCost(it.id)}
                                      disabled={fixCost.isPending}
                                      className="inline-flex items-center gap-0.5 rounded border border-amber-300 px-1 py-0.5 text-[10px] font-medium hover:bg-amber-50"
                                      title="กรอก/แก้ทุนย้อนหลังเป็นรหัสตัวอักษร — รายงานกำไรจะคิดทุนนี้">
                                <Pencil className="h-2.5 w-2.5" /> แก้ทุน
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="font-mono text-xs text-slate-400">{it.sku}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{it.imei ?? '-'}</td>
                      <td className="px-4 py-2 text-right">{formatTHB(it.sellPrice)}</td>
                      <td className="px-4 py-2 text-right">{it.quantity}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatTHB(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <Row label="ยอดรวมสินค้า" value={formatTHB(o.subtotal)} />
              {o.discountAmount > 0 && <Row label="ส่วนลด" value={`- ${formatTHB(o.discountAmount)}`} />}
              {o.shippingFee > 0 && <Row label="ค่าจัดส่ง" value={formatTHB(o.shippingFee)} />}
              {o.vatAmount > 0 && <Row label="VAT" value={formatTHB(o.vatAmount)} />}
              <div className="my-2 border-t border-slate-200" />
              <Row label="ยอดสุทธิ" value={formatTHB(o.grandTotal)} strong />
              {(o.tradeInValue ?? 0) > 0 && (
                <>
                  <Row
                    label={isInstallment ? 'ยอดวันนี้ก่อนเทิร์น' : 'ฐานเทียบเทิร์น'}
                    value={formatTHB(tradeInSettlement)}
                  />
                  <Row label="มูลค่าเทิร์นเครื่องเก่า" value={`- ${formatTHB(o.tradeInValue!)}`} />
                  <Row
                    label={tradeInDifference >= 0 ? 'ลูกค้าจ่ายส่วนต่างให้ร้าน' : 'ร้านจ่ายส่วนต่างให้ลูกค้า'}
                    value={formatTHB(Math.abs(tradeInDifference))}
                    strong
                  />
                  {o.tradeInDifferenceMethod && (
                    <Row label="วิธีรับ/จ่ายส่วนต่าง" value={PAYMENT_LABEL[o.tradeInDifferenceMethod]} />
                  )}
                </>
              )}
            </div>
          </div>

          {o.note && (
            <div className="card">
              <div className="card-body text-sm">
                <span className="text-slate-500">หมายเหตุ: </span>{o.note}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
