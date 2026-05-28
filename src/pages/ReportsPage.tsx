import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BarChart3, TrendingUp, Wallet, Boxes, Trophy } from 'lucide-react';
import { reportsApi } from '@/api/reports';
import { formatTHB, formatNumber } from '@/lib/format';
import type { PaymentMethod } from '@/types/api';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7'];

const PAYMENT_LABEL_TH: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  CARD: 'บัตร',
  TRANSFER: 'โอน / QR',
  QR: 'QR',
  INSTALLMENT: 'ผ่อน',
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const PRESETS: Array<{ label: string; days: number }> = [
  { label: '7 วันล่าสุด',  days: 7 },
  { label: '30 วันล่าสุด', days: 30 },
  { label: '90 วันล่าสุด', days: 90 },
  { label: '365 วันล่าสุด', days: 365 },
];

export function ReportsPage() {
  const today = useMemo(() => new Date(), []);
  const [days, setDays] = useState(30);
  const range = useMemo(() => {
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    return { from: isoDate(from), to: isoDate(today) };
  }, [days, today]);

  const summary       = useQuery({ queryKey: ['report-summary', range],     queryFn: () => reportsApi.summary(range) });
  const daily         = useQuery({ queryKey: ['report-daily', range],       queryFn: () => reportsApi.salesByDay(range) });
  const topProducts   = useQuery({ queryKey: ['report-top', range],         queryFn: () => reportsApi.topProducts({ ...range, limit: 10 }) });
  const paymentMethods= useQuery({ queryKey: ['report-payments', range],    queryFn: () => reportsApi.paymentMethods(range) });
  const inventory     = useQuery({ queryKey: ['report-inv'],                queryFn: reportsApi.inventoryValue });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6 text-brand-600" /> รายงาน & วิเคราะห์
          </h1>
          <p className="text-sm text-slate-500">
            ยอดขาย, กำไร, สินค้าขายดี — ช่วง {range.from} ถึง {range.to}
          </p>
        </div>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button key={p.days}
                    className={days === p.days ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<TrendingUp className="h-5 w-5" />}
                 label="รายได้รวม (ขาย + ซ่อม)"
                 value={formatTHB(summary.data?.totalRevenue ?? 0)}
                 sub={`${formatNumber(summary.data?.totalOrders ?? 0)} บิล`
                   + ((summary.data?.repairRevenue ?? 0) > 0
                       ? ` · ค่าซ่อม ${formatTHB(summary.data!.repairRevenue)} (${formatNumber(summary.data!.repairCount)} งาน)`
                       : '')}
                 color="bg-emerald-100 text-emerald-700" />
        <KpiCard icon={<Wallet className="h-5 w-5" />}
                 label="กำไรรวม"
                 value={formatTHB(summary.data?.totalProfit ?? 0)}
                 sub={`Margin ${Number(summary.data?.profitMargin ?? 0).toFixed(1)}%`}
                 color="bg-blue-100 text-blue-700" />
        <KpiCard icon={<Boxes className="h-5 w-5" />}
                 label="จำนวนชิ้นที่ขาย"
                 value={formatNumber(summary.data?.totalItems ?? 0)}
                 sub={`เฉลี่ย ${formatTHB(summary.data?.avgOrderValue ?? 0)}/บิล`}
                 color="bg-amber-100 text-amber-700" />
        <KpiCard icon={<Boxes className="h-5 w-5" />}
                 label="มูลค่าสต็อกคงคลัง"
                 value={formatTHB(inventory.data?.totalCostValue ?? 0)}
                 sub={`${formatNumber(inventory.data?.totalUnits ?? 0)} ชิ้น · ขายได้ ${formatTHB(inventory.data?.totalSellValue ?? 0)}`}
                 color="bg-slate-100 text-slate-700" />
      </div>

      {/* Daily Sales Line Chart */}
      <div className="card">
        <div className="card-header">ยอดขาย & กำไรรายวัน</div>
        <div className="card-body">
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={daily.data ?? []} margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }}
                       tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }}
                       tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                <Tooltip formatter={(v) => formatTHB(Number(v))}
                         labelFormatter={(l) => `วันที่ ${l}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="ยอดขาย" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit"  name="กำไร"   stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Top Products Bar Chart */}
        <div className="card lg:col-span-2">
          <div className="card-header flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-600" /> สินค้าขายดี 10 อันดับ
          </div>
          <div className="card-body">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={topProducts.data ?? []} layout="vertical"
                          margin={{ top: 5, right: 30, bottom: 5, left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="sku" tick={{ fontSize: 10 }} width={130} />
                  <Tooltip formatter={(v, name) => name === 'จำนวนที่ขาย' ? formatNumber(Number(v)) : formatTHB(Number(v))} />
                  <Legend />
                  <Bar dataKey="qtySold" name="จำนวนที่ขาย" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Payment Methods Pie */}
        <div className="card">
          <div className="card-header">วิธีชำระเงิน</div>
          <div className="card-body">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={paymentMethods.data ?? []}
                       dataKey="total"
                       nameKey="method"
                       cx="50%" cy="50%"
                       outerRadius={100}
                       label={(e: any) => PAYMENT_LABEL_TH[e.method as PaymentMethod] ?? e.method}>
                    {(paymentMethods.data ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatTHB(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {(paymentMethods.data ?? []).length === 0 && (
              <p className="text-center text-sm text-slate-400">ยังไม่มียอดขายในช่วงนี้</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Products Table */}
      <div className="card">
        <div className="card-header">รายละเอียดสินค้าขายดี</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">SKU</th>
                <th className="px-5 py-2.5">สินค้า</th>
                <th className="px-5 py-2.5 text-right">จำนวนที่ขาย</th>
                <th className="px-5 py-2.5 text-right">ยอดขาย</th>
                <th className="px-5 py-2.5 text-right">กำไร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(topProducts.data ?? []).map((p) => (
                <tr key={p.variantId}>
                  <td className="px-5 py-3 font-mono text-xs">{p.sku}</td>
                  <td className="px-5 py-3">
                    {p.productName}
                    {(p.color || p.storage) && (
                      <span className="ml-2 text-xs text-slate-500">
                        {[p.color, p.storage].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{formatNumber(p.qtySold)}</td>
                  <td className="px-5 py-3 text-right">{formatTHB(p.revenue)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${
                    p.profit > 0 ? 'text-emerald-600' : p.profit < 0 ? 'text-red-600' : 'text-slate-500'
                  }`}>{formatTHB(p.profit)}</td>
                </tr>
              ))}
              {(topProducts.data ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">ยังไม่มียอดขายในช่วงนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="card">
      <div className="card-body flex items-start gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="truncate text-2xl font-bold">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
