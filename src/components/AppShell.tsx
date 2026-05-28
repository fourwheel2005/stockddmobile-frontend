import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/auth';
import { useStockSocket } from '@/hooks/useStockSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { WsStatusIndicator } from '@/components/WsStatusIndicator';
import {
  LayoutDashboard, Boxes, Package, ArrowDownToLine, ArrowUpFromLine,
  History, BellRing, LogOut, SlidersHorizontal, ScanLine, Users, Layers, Receipt,
  BarChart3, ShieldCheck, Tag, Wrench,
} from 'lucide-react';

const navItems = [
  { to: '/',             label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/pos',          label: 'POS ขายหน้าร้าน', icon: ScanLine },
  { to: '/repairs',      label: 'งานซ่อม',        icon: Wrench },
  { to: '/inventory',    label: 'คลังสต็อก',     icon: Boxes },
  { to: '/products',     label: 'สินค้า',        icon: Package },
  { to: '/inbound',      label: 'รับสินค้า',     icon: ArrowDownToLine },
  { to: '/outbound',     label: 'จ่ายสินค้า',     icon: ArrowUpFromLine },
  { to: '/warranty',     label: 'เช็คประกัน',     icon: ShieldCheck },
  { to: '/labels',       label: 'พิมพ์ Label',    icon: Tag },
  { to: '/customers',    label: 'ลูกค้า',        icon: Users },
  { to: '/adjustment',   label: 'ปรับสต็อก',     icon: SlidersHorizontal, roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/lots',         label: 'ล็อตนำเข้า',    icon: Layers,            roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/sales',        label: 'ประวัติบิลขาย',  icon: Receipt,           roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/transactions', label: 'ประวัติสต็อก',  icon: History,           roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/reports',      label: 'รายงาน',        icon: BarChart3,         roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/alerts',       label: 'แจ้งเตือน',     icon: BellRing,          roles: ['ADMIN', 'MANAGER'] as const },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  useStockSocket();
  useKeyboardShortcuts();

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch { /* ignore */ }
    clear();
    navigate('/login', { replace: true });
  };

  const visibleNav = navItems.filter(
    (n) => !n.roles || (user && n.roles.includes(user.role as never))
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold text-brand-700">Stockdd Mobile</div>
            <WsStatusIndicator />
          </div>
          <div className="text-xs text-slate-500">iPhone & Accessories</div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="mb-2 text-sm">
            <div className="font-medium">{user?.fullName}</div>
            <div className="text-xs text-slate-500">@{user?.username}</div>
            <span className="badge-blue mt-1">{user?.role}</span>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
