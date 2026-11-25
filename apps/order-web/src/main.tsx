import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { Toaster } from '@edi/ui/components/sonner';
import { TooltipProvider } from '@edi/ui/components/tooltip';
import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { AppLayout } from '@/components/layout';
import { EmptyState } from '@/components/empty-state';
import { LoginPage, RegisterPage } from '@/pages/auth';
import { DashboardPage } from '@/pages/dashboard';
import { ShopPage } from '@/pages/shop';
import { CheckoutPage } from '@/pages/checkout';
import { OrdersPage } from '@/pages/orders';
import { OrderDetailPage } from '@/pages/order-detail';
import { BillsPage } from '@/pages/bills';
import { ReportsPage } from '@/pages/reports';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

function NotFound() {
  return <EmptyState icon={Compass} title="Page not found" description="The page you are looking for doesn't exist." action={<Button asChild><Link to="/">Go home</Link></Button>} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <TooltipProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="shop" element={<ShopPage />} />
                  <Route path="checkout" element={<CheckoutPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                  <Route path="bills" element={<BillsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              <Toaster position="top-right" />
            </TooltipProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
