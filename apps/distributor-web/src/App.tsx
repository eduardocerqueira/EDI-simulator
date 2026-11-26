import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { InterchangesPage } from '@/pages/edi/Interchanges';
import { InterchangeDetailPage } from '@/pages/edi/InterchangeDetail';
import { TransactionsPage } from '@/pages/edi/Transactions';
import { TransactionDetailPage } from '@/pages/edi/TransactionDetail';
import { FilesPage } from '@/pages/edi/Files';
import { ValidationPage } from '@/pages/edi/Validation';
import { DeliveriesPage } from '@/pages/edi/Deliveries';
import { AcksPage } from '@/pages/edi/Acks';
import { NotificationsPage } from '@/pages/Notifications';
import { PartnersPage, PartnerDetailPage } from '@/pages/Partners';
import { InventoryPage, ProductDetailPage } from '@/pages/Inventory';
import { CustomersPage, CustomerDetailPage, OrdersPage, BillsPage } from '@/pages/Commerce';
import { ReportsPage } from '@/pages/Reports';
import { KpisPage } from '@/pages/Kpis';
import { InspectorPage } from '@/pages/x12/Inspector';
import { ReferencePage } from '@/pages/x12/Reference';
import { ClusterPage } from '@/pages/platform/Cluster';
import { StoragePage } from '@/pages/platform/Storage';
import { EmptyState } from '@/components/common';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="kpis" element={<KpisPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="edi" element={<Navigate to="/edi/interchanges" replace />} />
        <Route path="edi/interchanges" element={<InterchangesPage />} />
        <Route path="edi/interchanges/:id" element={<InterchangeDetailPage />} />
        <Route path="edi/transactions" element={<TransactionsPage />} />
        <Route path="edi/transactions/:id" element={<TransactionDetailPage />} />
        <Route path="edi/files" element={<FilesPage />} />
        <Route path="edi/validation" element={<ValidationPage />} />
        <Route path="edi/deliveries" element={<DeliveriesPage />} />
        <Route path="edi/acks" element={<AcksPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="partners/:id" element={<PartnerDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/:id" element={<ProductDetailPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="x12/inspector" element={<InspectorPage />} />
        <Route path="x12/reference" element={<ReferencePage />} />
        <Route path="platform" element={<ClusterPage />} />
        <Route path="platform/storage" element={<StoragePage />} />
        <Route path="*" element={<EmptyState title="Page not found" description="The page you are looking for does not exist." />} />
      </Route>
    </Routes>
  );
}
