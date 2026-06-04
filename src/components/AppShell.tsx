import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/auth';
import { useStockSocket } from '@/hooks/useStockSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { WsStatusIndicator } from '@/components/WsStatusIndicator';
import {
  LayoutDashboard, Boxes, Package, ArrowUpFromLine,
  History, BellRing, LogOut, SlidersHorizontal, ScanLine, Users, Layers, Receipt,
  BarChart3, ShieldCheck, Tag, Wrench, Menu, X, Wallet,
} from 'lucide-react';

const navItems = [
  { to: '/',             label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/pos',          label: 'POS ขายหน้าร้าน', icon: ScanLine },
  { to: '/cash-register', label: 'เก๊ะเงินสด',      icon: Wallet },
  { to: '/repairs',      label: 'งานซ่อม',        icon: Wrench },
  { to: '/inventory',    label: 'คลังสต็อก',     icon: Boxes },
  { to: '/products',     label: 'สินค้า + คลัง', icon: Package },
  { to: '/outbound',     label: 'จ่ายสินค้า',     icon: ArrowUpFromLine },
  { to: '/warranty',     label: 'เช็คประกัน',     icon: ShieldCheck },
  { to: '/labels',       label: 'พิมพ์ Label',    icon: Tag },
  { to: '/customers',    label: 'ลูกค้า',        icon: Users },
  { to: '/adjustment',   label: 'ปรับสต็อก',     icon: SlidersHorizontal, roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/lots',         label: 'ล็อตนำเข้า',    icon: Layers,            roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/sales',        label: 'ประวัติบิลขาย',  icon: Receipt },
  { to: '/transactions', label: 'ประวัติสต็อก',  icon: History,           roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/reports',      label: 'รายงาน',        icon: BarChart3,         roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/alerts',       label: 'แจ้งเตือน',     icon: BellRing,          roles: ['ADMIN', 'MANAGER'] as const },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
        <Boxes className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-base font-bold tracking-tight text-slate-900">
          Stockdd<span className="text-brand-600">Mobile</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">iPhone &amp; Accessories</div>
      </div>
    </div>
  );
}

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useStockSocket();
  useKeyboardShortcuts();

  // ปิด drawer อัตโนมัติเมื่อเปลี่ยนหน้า
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      {/* Overlay (mobile only) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar / Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white
                    transition-transform duration-300 ease-out
                    md:static md:z-auto md:w-64 md:translate-x-0
                    ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <Wordmark />
          <button
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="ปิดเมนู"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:translate-x-0.5 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600 transition-all duration-200 ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                    aria-hidden
                  />
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-2 text-sm">
            <div className="font-semibold text-slate-800">{user?.fullName}</div>
            <div className="text-xs text-slate-500">@{user?.username}</div>
            <span className="badge-blue mt-1.5">{user?.role}</span>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start">
            <LogOut className="h-4 w-4" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดเมนู"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Wordmark />
          <WsStatusIndicator />
        </header>

        {/* Desktop live indicator strip */}
        <div className="hidden items-center justify-end border-b border-slate-200 bg-white px-6 py-2 md:flex">
          <WsStatusIndicator />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
