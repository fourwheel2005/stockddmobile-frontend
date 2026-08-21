import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/api/auth';
import { useStockSocket } from '@/hooks/useStockSocket';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { WsStatusIndicator } from '@/components/WsStatusIndicator';
import { CashDrawerIndicator } from '@/components/CashDrawerIndicator';
import { BranchSelector } from '@/components/BranchSelector';
import {
  LayoutDashboard, Boxes, Package, ArrowUpFromLine,
  History, BellRing, LogOut, SlidersHorizontal, ScanLine, Users, Layers, Receipt,
  BarChart3, ShieldCheck, Tag, Wrench, Menu, X, Wallet, Landmark, Building2, ArrowLeftRight, UserCog,
  CreditCard, PackageOpen, PackageCheck,
} from 'lucide-react';

/**
 * สิทธิ์เมนู (FIX-102) — STAFF = "ขายหน้าร้านอย่างเดียว"
 * เห็นได้เฉพาะ POS / พิมพ์ใบจัดส่ง / เก๊ะเงินสด / งานซ่อม / ประวัติบิลขาย (เฉพาะบิลตัวเอง)
 * เมนูที่เหลือทั้งหมดเป็นของ ADMIN/MANAGER — backend ก็ปิดซ้ำอีกชั้น (deny-by-default)
 */
const ALL_ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;
const BACK_OFFICE = ['ADMIN', 'MANAGER'] as const;

export const navItems = [
  { to: '/',             label: 'Dashboard',     icon: LayoutDashboard,   roles: BACK_OFFICE },
  { to: '/pos',          label: 'POS ขายหน้าร้าน', icon: ScanLine,          roles: ALL_ROLES },
  { to: '/shipping-labels', label: 'พิมพ์ใบจัดส่ง', icon: PackageCheck,      roles: ALL_ROLES },
  { to: '/cash-register', label: 'เก๊ะเงินสด',      icon: Wallet,            roles: ALL_ROLES },
  { to: '/repairs',      label: 'งานซ่อม',        icon: Wrench,            roles: ALL_ROLES },
  { to: '/inventory',    label: 'คลังสต็อก',     icon: Boxes,             roles: BACK_OFFICE },
  { to: '/pending-intake', label: 'รอลงสต็อก',   icon: PackageOpen,       roles: BACK_OFFICE },
  { to: '/products',     label: 'สินค้า + คลัง', icon: Package,           roles: BACK_OFFICE },
  { to: '/outbound',     label: 'จ่ายสินค้า',     icon: ArrowUpFromLine,   roles: BACK_OFFICE },
  { to: '/warranty',     label: 'เช็คประกัน',     icon: ShieldCheck,       roles: BACK_OFFICE },
  { to: '/labels',       label: 'พิมพ์ Label',    icon: Tag,               roles: BACK_OFFICE },
  { to: '/customers',    label: 'ลูกค้า',        icon: Users,             roles: BACK_OFFICE },
  { to: '/adjustment',   label: 'ปรับสต็อก',     icon: SlidersHorizontal, roles: BACK_OFFICE },
  { to: '/lots',         label: 'ล็อตนำเข้า',    icon: Layers,            roles: BACK_OFFICE },
  { to: '/firsthand-installment', label: 'ตารางผ่อนมือ 1', icon: CreditCard, roles: BACK_OFFICE },
  { to: '/installment-presets', label: 'ตารางผ่อนมือ 2', icon: CreditCard, roles: BACK_OFFICE },
  { to: '/sales',        label: 'ประวัติบิลขาย',  icon: Receipt,           roles: ALL_ROLES },
  // ─── ซ่อนชั่วคราว — ยังไม่ใช้ในตอนนี้ (V31 finance partner tracking) ───
  // เก็บ route /finance-pending ไว้ + backend ทำงานตามปกติ
  // ถ้าอยากเปิดกลับ — uncomment บรรทัดถัดไป
  // { to: '/finance-pending', label: 'ไฟแนนซ์ค้างจ่าย', icon: Landmark, roles: ['ADMIN', 'MANAGER'] as const },
  { to: '/transactions', label: 'ประวัติสต็อก',  icon: History,           roles: BACK_OFFICE },
  { to: '/reports',      label: 'รายงาน',        icon: BarChart3,         roles: BACK_OFFICE },
  { to: '/alerts',       label: 'แจ้งเตือน',     icon: BellRing,          roles: BACK_OFFICE },
  { to: '/transfers',    label: 'โอนสาขา',       icon: ArrowLeftRight,    roles: BACK_OFFICE },
  { to: '/branches',     label: 'สาขา',          icon: Building2,         roles: BACK_OFFICE },
  { to: '/store-profile', label: 'ข้อมูลร้าน',    icon: Building2,         roles: BACK_OFFICE },
  { to: '/users',        label: 'จัดการพนักงาน',  icon: UserCog,           roles: ['ADMIN'] as const },
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
  useVersionCheck();   // เตือนเมื่อมี deploy ใหม่ — กันแท็บรันโค้ดเก่าค้าง (FIX-095)

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

        <CashDrawerIndicator />
        <BranchSelector />

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
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-800">{user?.fullName}</div>
              <WsStatusIndicator />
            </div>
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
        {/* grid 1fr_auto_1fr → โลโก้อยู่กึ่งกลางจริง (เดิม justify-between เบี้ยวเพราะปุ่มซ้าย/ขวากว้างไม่เท่ากัน) */}
        <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            className="justify-self-start rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดเมนู"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="justify-self-center"><Wordmark /></div>
          <div className="justify-self-end"><WsStatusIndicator /></div>
        </header>

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
