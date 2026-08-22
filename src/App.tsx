import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { ProductRegisterPage } from '@/pages/ProductRegisterPage';
import { OutboundPage } from '@/pages/OutboundPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { AdjustmentPage } from '@/pages/AdjustmentPage';
import { PosTerminalPage } from '@/pages/PosTerminalPage';
import { RepairListPage } from '@/pages/RepairListPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { LotsPage } from '@/pages/LotsPage';
import { InstallmentPresetsPage } from '@/pages/InstallmentPresetsPage';
import { FirstHandInstallmentPage } from '@/pages/FirstHandInstallmentPage';
import { PendingIntakePage } from '@/pages/PendingIntakePage';
import { SalesHistoryPage } from '@/pages/SalesHistoryPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { BranchesPage } from '@/pages/BranchesPage';
import { TransfersPage } from '@/pages/TransfersPage';
import { WarrantyPage } from '@/pages/WarrantyPage';
import { ScannerTestPage } from '@/pages/ScannerTestPage';
import { PrintLabelsPage } from '@/pages/PrintLabelsPage';
import { ShippingLabelsPage } from '@/pages/ShippingLabelsPage';
import { CashRegisterPage } from '@/pages/CashRegisterPage';
import { FinancePendingPage } from '@/pages/FinancePendingPage';
import { UsersPage } from '@/pages/UsersPage';
import { AuditTrailPage } from '@/pages/AuditTrailPage';
import { StoreProfilePage } from '@/pages/StoreProfilePage';
import { useAuthStore } from '@/stores/authStore';

/** หน้าแรกต่างกันตาม role — STAFF ไม่มี Dashboard แล้ว (FIX-102) */
function HomeRedirect() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === 'STAFF' ? '/pos' : '/'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ─── STAFF เข้าได้: POS + พิมพ์ใบจัดส่ง + เก๊ะ + งานซ่อม + ประวัติบิลตัวเอง ─── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/pos" element={<PosTerminalPage />} />
          <Route path="/shipping-labels" element={<ShippingLabelsPage />} />
          <Route path="/cash-register" element={<CashRegisterPage />} />
          <Route path="/repairs" element={<RepairListPage />} />
          <Route path="/sales" element={<SalesHistoryPage />} />
          <Route path="/pos/orders/:id" element={<OrderDetailPage />} />
        </Route>
      </Route>

      {/* ─── หลังร้าน: ข้อมูลต้นทุน/สต็อก/รายงาน — STAFF ห้ามเข้า ─── */}
      <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/products" element={<ProductsPage />} />
          {/* Redirect routes เก่า → /products (รวมเป็นหน้าเดียว) */}
          <Route path="/receive" element={<Navigate to="/products" replace />} />
          <Route path="/inbound" element={<Navigate to="/products" replace />} />
          {/* สร้างสินค้าใหม่ (FIX-089: ลบ wizard เก่า /products/new/advanced — ไม่มีลิงก์ชี้ไปแล้ว
              clone/add-variant ใช้ ProductRegisterPage + AddVariantModal แทนครบ) */}
          <Route path="/products/new" element={<ProductRegisterPage />} />
          <Route path="/products/new/advanced" element={<Navigate to="/products/new" replace />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/outbound" element={<OutboundPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/warranty" element={<WarrantyPage />} />
          <Route path="/scanner-test" element={<ScannerTestPage />} />
          <Route path="/labels" element={<PrintLabelsPage />} />
          <Route path="/branches" element={<BranchesPage />} />
          <Route path="/transfers" element={<TransfersPage />} />
          {/* /inbound-legacy ถูกลบ (FIX-114) — รับเข้าใช้ปุ่ม "รับสินค้าเข้า" ที่ /products */}
          <Route path="/inbound-legacy" element={<Navigate to="/products" replace />} />
          <Route path="/adjustment" element={<AdjustmentPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/lots" element={<LotsPage />} />
          {/* ตารางดาวน์/ผ่อนมือ 2 ต่อ รุ่น×ความจุ — auto-apply ตอนรับเครื่องเข้า (FIX-123) */}
          <Route path="/installment-presets" element={<InstallmentPresetsPage />} />
          {/* ตารางดาวน์/ผ่อนมือ 1 ต่อ รุ่น×ความจุ — เขียนลง SKU มือ 1 (FIX-138) */}
          <Route path="/firsthand-installment" element={<FirstHandInstallmentPage />} />
          {/* เครื่องเทิร์นรอลงสต็อก — แก้ข้อมูล/เพิ่มรูป แล้วรับเข้าสต็อก (FIX-142) */}
          <Route path="/pending-intake" element={<PendingIntakePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/store-profile" element={<StoreProfilePage />} />
          {/* V31 — ไฟแนนซ์ค้างจ่าย */}
          <Route path="/finance-pending" element={<FinancePendingPage />} />
        </Route>
      </Route>

      {/* ─── จัดการพนักงาน — ADMIN เท่านั้น (FIX-104) ─── */}
      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route element={<AppShell />}>
          <Route path="/users" element={<UsersPage />} />
        </Route>
      </Route>

      {/* ─── รายงานหลังบ้านทั้งหมด — เจ้าของ (FREEDOM) คนเดียว (FIX-159) ─── */}
      <Route element={<ProtectedRoute roles={['FREEDOM']} />}>
        <Route element={<AppShell />}>
          <Route path="/audit" element={<AuditTrailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
