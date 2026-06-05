import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Boxes, Package, AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { productsApi } from '@/api/products';
import { alertsApi } from '@/api/alerts';
import { cashRegisterApi } from '@/api/cashRegister';
import { formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { useWsStore } from '@/stores/wsStore';
import { OpenSessionModal } from '@/components/OpenSessionModal';
import { ShippingPartnerWidget } from '@/components/dashboard/ShippingPartnerWidget';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const inventory = useQuery({
    queryKey: ['inventory', { size: 5, lowStockOnly: false }],
    queryFn: () => inventoryApi.list({ size: 5 }),
  });

  const products = useQuery({
    queryKey: ['products', { size: 1 }],
    queryFn: () => productsApi.list({ size: 1 }),
  });

  const alerts = useQuery({
    queryKey: ['alerts', 'ACTIVE'],
    queryFn: () => alertsApi.list({ status: 'ACTIVE', size: 5 }),
    enabled: isManagerOrAdmin,
  });

  const lowStockCount = inventory.data?.content.filter((i) => i.lowStock).length ?? 0;

  // Cash session check — auto prompt เปิดเก๊ะถ้ายังไม่มี
  const session = useQuery({
    queryKey: ['cash-session', 'current'],
    queryFn: cashRegisterApi.current,
    refetchInterval: 60_000,
  });
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [autoPromptShown, setAutoPromptShown] = useState(false);
  useEffect(() => {
    if (!autoPromptShown && session.isFetched && !session.data) {
      setShowOpenSession(true);
      setAutoPromptShown(true);
    }
  }, [session.isFetched, session.data, autoPromptShown]);

  // Flash a "Just updated" pulse for 2s every time a WS event arrives
  const lastEventAt = useWsStore((s) => s.lastEventAt);
  const [justUpdated, setJustUpdated] = useState(false);
  useEffect(() => {
    if (!lastEventAt) return;
    setJustUpdated(true);
    const t = setTimeout(() => setJustUpdated(false), 2000);
    return () => clearTimeout(t);
  }, [lastEventAt]);

  return (
    <div className="space-y-6">
      {showOpenSession && (
        <OpenSessionModal onClose={() => setShowOpenSession(false)} />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-slate-500">ภาพรวมระบบสต็อก</p>
        </div>
        {justUpdated && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 animate-pulse">
            <Zap className="h-3.5 w-3.5" />
            Just updated
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="สินค้าทั้งหมด"
          value={formatNumber(products.data?.totalElements)}
          color="bg-blue-100 text-blue-700"
        />
        <StatCard
          icon={<Boxes className="h-5 w-5" />}
          label="รุ่นย่อยที่มีสต็อก"
          value={formatNumber(inventory.data?.totalElements)}
          color="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="สินค้าใกล้หมด"
          value={formatNumber(lowStockCount)}
          color="bg-amber-100 text-amber-700"
        />
        {isManagerOrAdmin && (
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="แจ้งเตือนที่ยังไม่จัดการ"
            value={formatNumber(alerts.data?.totalElements ?? 0)}
            color="bg-red-100 text-red-700"
          />
        )}
      </div>

      {/* Q4 — Shipping partner widget */}
      <ShippingPartnerWidget />

      {/* Recent Inventory */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span>สต็อกล่าสุด <span className="ml-1 text-xs font-normal text-slate-500">(เฉพาะรุ่นที่มีของแล้ว — รับเข้าด้วย Inbound เพื่อให้ขึ้นที่นี่)</span></span>
          <Link to="/inventory" className="text-sm font-normal text-brand-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">รหัสสินค้า (SKU)</th>
                <th className="px-5 py-2.5">สินค้า</th>
                <th className="px-5 py-2.5 text-right">จำนวน</th>
                <th className="px-5 py-2.5 text-right">จุดสั่งใหม่</th>
                <th className="px-5 py-2.5">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventory.data?.content.map((row) => (
                <tr key={row.variantId}>
                  <td className="px-5 py-3 font-mono text-xs">{row.sku}</td>
                  <td className="px-5 py-3">
                    {row.productName}
                    {row.color && <span className="ml-2 text-xs text-slate-500">{row.color} {row.storage}</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{formatNumber(row.quantity)}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{formatNumber(row.reorderPoint)}</td>
                  <td className="px-5 py-3">
                    {row.lowStock
                      ? <span className="badge-amber">ใกล้หมด</span>
                      : <span className="badge-green">ปกติ</span>}
                  </td>
                </tr>
              ))}
              {!inventory.isLoading && inventory.data?.content.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  ยังไม่มีสต็อกในระบบ — ไปที่เมนู <strong>รับสินค้า</strong> เพื่อเพิ่มของเข้าคลัง
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="card group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="card-body flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${color}`}>{icon}</div>
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="font-display text-2xl font-bold tracking-tight">{value}</div>
        </div>
      </div>
    </div>
  );
}
