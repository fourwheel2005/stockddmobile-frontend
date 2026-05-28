import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
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
import { ReportsPage } from '@/pages/ReportsPage';
import { WarrantyPage } from '@/pages/WarrantyPage';
import { ScannerTestPage } from '@/pages/ScannerTestPage';
import { PrintLabelsPage } from '@/pages/PrintLabelsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/inbound" element={<InboundPage />} />
          <Route path="/outbound" element={<OutboundPage />} />
          <Route path="/pos" element={<PosTerminalPage />} />
          <Route path="/repairs" element={<RepairListPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/warranty" element={<WarrantyPage />} />
          <Route path="/scanner-test" element={<ScannerTestPage />} />
          <Route path="/labels" element={<PrintLabelsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} />}>
        <Route element={<AppShell />}>
          <Route path="/adjustment" element={<AdjustmentPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/lots" element={<LotsPage />} />
          <Route path="/sales" element={<SalesHistoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
