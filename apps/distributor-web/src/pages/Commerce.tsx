import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, CircleDollarSign, Mail, Receipt, ShoppingCart, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@edi/ui/components/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { cn } from '@edi/ui/lib/utils';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters } from '@/lib/hooks';
import { EmptyState, ErrorState, LiveDot, LoadingPage, LoadingRows, NativeSelect, PageHeader, Pagination, StatCard, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';

interface OrderItem {
  upc: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  subtotal: number;
  total: number;
  itemCount: number;
  items: OrderItem[];
  createdAt: string;
  cancelledAt: string | null;
  syncedAt: string;
  customer?: { id: string; name: string; company: string | null };
}
interface Bill {
  id: string;
  billNumber: string;
  orderId: string;
  customerId: string;
  amount: number;
  status: string;
  effectiveStatus: string;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  customer?: { id: string; name: string; company: string | null };
}

const initials = (s: string) => s.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

function dueLabel(b: Bill) {
  if (b.status !== 'OPEN') return null;
  const days = Math.round((new Date(b.dueDate).getTime() - Date.now()) / 86400_000);
  return days < 0 ? <span className="text-destructive text-xs">{-days}d overdue</span> : <span className="text-muted-foreground text-xs">due in {days}d</span>;
}

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api<Array<{ id: string; name: string; email: string; company: string | null; createdAt: string; orderCount: number; cancelledCount: number; totalSpent: number; openBalance: number; overdueBalance: number; lastOrderAt: string | null }>>(`/customers${qs({ q: search })}`),
    refetchInterval: 8000,
    placeholderData: keepPreviousData,
  });
  const nav = useNavigate();
  return (
    <>
      <PageHeader title="Customers" description="Replica of the order app's customers, kept up to date by consuming order.events from RabbitMQ (customer.registered, order.created, order.cancelled, bill.paid)." actions={<LiveDot />} />
      <Card className="gap-0 py-0">
        <FilterBar search={search} onSearch={setSearch} placeholder="Name, company or email" />
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet" description="Customers appear when the order app publishes customer.registered events." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Total spent</TableHead>
                <TableHead className="text-right">Open balance</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="pr-4 text-right">Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => nav(`/customers/${c.id}`)}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar><AvatarFallback className="bg-primary/10 text-primary">{initials(c.company ?? c.name)}</AvatarFallback></Avatar>
                      <div>
                        <div className="font-medium">{c.company ?? c.name}</div>
                        <div className="text-muted-foreground text-xs">{c.name}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.email}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.cancelledCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt.money(c.totalSpent)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(c.openBalance)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', c.overdueBalance > 0 && 'text-destructive font-medium')}>{fmt.money(c.overdueBalance)}</TableCell>
                  <TableCell className="text-muted-foreground pr-4 text-right text-xs">{fmt.ago(c.lastOrderAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function OrderDrawer({ order, onClose }: { order: Order | null; onClose: () => void }) {
  return (
    <Drawer open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="lg">
        {order && (
          <>
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">Order {order.orderNumber} <StatusBadge status={order.status} /></DrawerTitle>
              <DrawerDescription>
                {order.customer?.company ?? order.customer?.name} · placed {fmt.dateTime(order.createdAt)}
                {order.cancelledAt && ` · cancelled ${fmt.dateTime(order.cancelledAt)}`}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>UPC</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((i) => (
                  <TableRow key={i.upc}>
                    <TableCell>{i.name}</TableCell>
                    <TableCell className="font-mono text-xs">{i.upc}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(i.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(i.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(order.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function OrdersTable({ orders, onOpen, showCustomer = true }: { orders: Order[]; onOpen: (o: Order) => void; showCustomer?: boolean }) {
  if (!orders.length) return <EmptyState icon={ShoppingCart} title="No orders" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Order</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead className="text-right">Lines</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Placed</TableHead>
          <TableHead className="pr-4">Synced via MQ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpen(o)}>
            <TableCell className="pl-4 font-mono text-xs font-medium">{o.orderNumber}</TableCell>
            {showCustomer && (
              <TableCell>
                <Link className="hover:underline" to={`/customers/${o.customer?.id ?? o.customerId}`} onClick={(e) => e.stopPropagation()}>{o.customer?.company ?? o.customer?.name}</Link>
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">{o.items.length}</TableCell>
            <TableCell className="text-right tabular-nums">{o.itemCount}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{fmt.money(o.total)}</TableCell>
            <TableCell><StatusBadge status={o.status} /></TableCell>
            <TableCell className="text-xs">{fmt.dateTime(o.createdAt)}</TableCell>
            <TableCell className="text-muted-foreground pr-4 text-xs">{fmt.ago(o.syncedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BillsTable({ bills, showCustomer = true }: { bills: Bill[]; showCustomer?: boolean }) {
  if (!bills.length) return <EmptyState icon={Receipt} title="No bills" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Bill</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Due (net 30)</TableHead>
          <TableHead className="pr-4">Paid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bills.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="pl-4 font-mono text-xs font-medium">{b.billNumber}</TableCell>
            {showCustomer && (
              <TableCell>
                <Link className="hover:underline" to={`/customers/${b.customerId}`}>{b.customer?.company ?? b.customer?.name}</Link>
              </TableCell>
            )}
            <TableCell className="text-right font-medium tabular-nums">{fmt.money(b.amount)}</TableCell>
            <TableCell><StatusBadge status={b.effectiveStatus} /></TableCell>
            <TableCell className="text-xs">{fmt.date(b.issuedAt)}</TableCell>
            <TableCell className="text-xs">
              {fmt.date(b.dueDate)} <span className="ml-1">{dueLabel(b)}</span>
            </TableCell>
            <TableCell className="pr-4 text-xs">{fmt.date(b.paidAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const [open, setOpen] = useState<Order | null>(null);
  const q = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<{ id: string; name: string; email: string; company: string | null; createdAt: string; syncedAt: string; orders: Order[]; bills: Bill[] }>(`/customers/${id}`),
    refetchInterval: 8000,
  });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const c = q.data!;
  const placed = c.orders.filter((o) => o.status !== 'CANCELLED');
  const open$ = c.bills.filter((b) => b.status === 'OPEN').reduce((n, b) => n + b.amount, 0);
  const overdue = c.bills.filter((b) => b.effectiveStatus === 'OVERDUE').reduce((n, b) => n + b.amount, 0);
  return (
    <>
      <PageHeader
        back={{ to: '/customers', label: 'Customers' }}
        title={
          <span className="flex items-center gap-3">
            <Avatar className="size-10"><AvatarFallback className="bg-primary/10 text-primary">{initials(c.company ?? c.name)}</AvatarFallback></Avatar>
            {c.company ?? c.name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1"><Building2 className="size-3.5" /> {c.name}</span>
            <span className="flex items-center gap-1"><Mail className="size-3.5" /> {c.email}</span>
            <span>customer since {fmt.date(c.createdAt)}</span>
          </span>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders" value={c.orders.length} hint={`${c.orders.length - placed.length} cancelled`} icon={ShoppingCart} />
        <StatCard label="Total spent" value={fmt.money(placed.reduce((n, o) => n + o.total, 0))} icon={CircleDollarSign} tone="success" />
        <StatCard label="Open balance" value={fmt.money(open$)} icon={Receipt} tone="info" />
        <StatCard label="Overdue" value={fmt.money(overdue)} icon={Receipt} tone={overdue > 0 ? 'destructive' : 'default'} />
      </div>
      <Tabs defaultValue="orders" className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">Orders ({c.orders.length})</TabsTrigger>
          <TabsTrigger value="bills">Bills ({c.bills.length})</TabsTrigger>
        </TabsList>
        <Card className="mt-2 py-0">
          <TabsContent value="orders"><OrdersTable orders={c.orders} onOpen={setOpen} showCustomer={false} /></TabsContent>
          <TabsContent value="bills"><BillsTable bills={c.bills} showCustomer={false} /></TabsContent>
        </Card>
      </Tabs>
      <OrderDrawer order={open ? { ...open, customer: { id: c.id, name: c.name, company: c.company } } : null} onClose={() => setOpen(null)} />
    </>
  );
}

export function OrdersPage() {
  const { values: f, page, set } = useUrlFilters({ q: '', status: '' });
  const [open, setOpen] = useState<Order | null>(null);
  const q = useQuery({
    queryKey: ['orders', f, page],
    queryFn: () => api<Page<Order>>(`/orders${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Orders" description="Customer orders placed in the Harvest Market order app. Each order.created event decrements distributor stock; order.cancelled puts it back." actions={<LiveDot />} />
      <Card className="gap-0 py-0">
        <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="Order number" onReset={() => set({ q: '', status: '' })}>
          <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={[{ value: 'PLACED', label: 'Placed' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
        </FilterBar>
        {q.isLoading ? <LoadingRows /> : q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : <OrdersTable orders={q.data!.items} onOpen={setOpen} />}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <OrderDrawer order={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function BillsPage() {
  const { values: f, page, set } = useUrlFilters({ status: '' });
  const q = useQuery({
    queryKey: ['bills', f, page],
    queryFn: () => api<Page<Bill>>(`/bills${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Billing" description="Bills are created with every order and are due 30 days after the order date (net 30). Open bills past their due date are overdue." actions={<LiveDot />} />
      <Tabs value={f.status || 'all'} onValueChange={(v) => set({ status: v === 'all' ? '' : v })} className="mb-3">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="OPEN">Open</TabsTrigger>
          <TabsTrigger value="OVERDUE">Overdue</TabsTrigger>
          <TabsTrigger value="PAID">Paid</TabsTrigger>
          <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="gap-0 py-0">
        {q.isLoading ? <LoadingRows /> : q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : <BillsTable bills={q.data!.items} />}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}

