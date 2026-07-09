import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { ProductRegisterPage } from '@/pages/ProductRegisterPage';
import { InboundPage } from '@/pages/InboundPage';
import { OutboundPage } from '@/pages/OutboundPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { AdjustmentPage } from '@/pages/AdjustmentPage';
import { PosTerminalPage } from '@/pages/PosTerminalPage';
import { RepairListPage } from '@/pages/RepairListPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { LotsPage } from '@/pages/LotsPage';
import { SalesHistoryPage } from '@/pages/SalesHistoryPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { BranchesPage } from '@/pages/BranchesPage';
import { TransfersPage } from '@/pages/TransfersPage';
import { WarrantyPage } from '@/pages/WarrantyPage';
import { ScannerTestPage } from '@/pages/ScannerTestPage';
import { PrintLabelsPage } from '@/pages/PrintLabelsPage';
import { CashRegisterPage } from '@/pages/CashRegisterPage';
import { FinancePendingPage } from '@/pages/FinancePendingPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
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
          <Route path="/pos" element={<PosTerminalPage />} />
          <Route path="/cash-register" element={<CashRegisterPage />} />
          <Route path="/repairs" element={<RepairListPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/warranty" element={<WarrantyPage />} />
          <Route path="/scanner-test" element={<ScannerTestPage />} />
          <Route path="/labels" element={<PrintLabelsPage />} />
          {/* /sales: STAFF เข้าได้ — แต่ปุ่ม refund จะ disable ตาม role ใน UI */}
          <Route path="/sales" element={<SalesHistoryPage />} />
          <Route path="/pos/orders/:id" element={<OrderDetailPage />} />
          <Route path="/branches" element={<BranchesPage />} />
          <Route path="/transfers" element={<TransfersPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} />}>
        <Route element={<AppShell />}>
          {/* /inbound (เก่า) เก็บไว้ admin-only เผื่อ link เก่า — UI ไม่มี nav แล้ว */}
          <Route path="/inbound-legacy" element={<InboundPage />} />
          <Route path="/adjustment" element={<AdjustmentPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/lots" element={<LotsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          {/* V31 — ไฟแนนซ์ค้างจ่าย */}
          <Route path="/finance-pending" element={<FinancePendingPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
