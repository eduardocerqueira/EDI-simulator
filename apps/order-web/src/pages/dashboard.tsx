import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CalendarClock, DollarSign, Package, Receipt, ShoppingBasket, Store, BarChart3 } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@edi/ui/components/chart';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { api, type Summary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dayLabel, daysUntil, money, monthLabel, relative } from '@/lib/format';
import { StatCard } from '@/components/stat-card';
import { BillStatusBadge, OrderStatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';

const chartConfig = { spend: { label: 'Spend', color: 'var(--chart-1)' }, orders: { label: 'Orders', color: 'var(--chart-4)' } } satisfies ChartConfig;

export function DashboardPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'daily' | 'monthly'>('daily');
  const { data, isLoading } = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/summary'), refetchInterval: 15_000 });
  const t = data?.totals;
  const next = t?.nextDue;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const series = view === 'daily'
    ? (data?.daily ?? []).slice(-30).map((d) => ({ label: dayLabel(d.day), spend: d.spend, orders: d.orders }))
    : (data?.monthly ?? []).map((m) => ({ label: monthLabel(m.month), spend: m.spend, orders: m.orders }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{greet},</p>
          <h1 className="text-3xl font-semibold tracking-tight">{user?.name.split(' ')[0]} 👋</h1>
          <p className="text-muted-foreground mt-1 text-sm">{user?.company ? `${user.company} · ` : ''}Here's what's happening with your account.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/bills"><Receipt /> Bills</Link></Button>
          <Button asChild><Link to="/shop"><Store /> Shop inventory</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard loading={isLoading} label="Total spend" value={money(t?.spend)} hint={`Avg order ${money(t?.avgOrderValue)}`} icon={DollarSign} />
        <StatCard loading={isLoading} label="Orders" value={t?.placed ?? 0} hint={`${t?.cancelled ?? 0} cancelled · ${t?.orders ?? 0} total`} icon={Package} tone="info" />
        <StatCard loading={isLoading} label="Open bills" value={money(t?.openAmount)} hint={`${t?.openBills ?? 0} bill(s) awaiting payment`} icon={Receipt} tone="success" />
        <StatCard
          loading={isLoading}
          label="Overdue"
          value={money(t?.overdueAmount)}
          hint={t?.overdueBills ? `${t.overdueBills} overdue bill(s)` : 'All caught up'}
          icon={AlertTriangle}
          tone={t?.overdueBills ? 'destructive' : 'warning'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Spending</CardTitle>
            <CardDescription>{view === 'daily' ? 'Last 30 active days' : 'By month'} · excludes cancelled orders</CardDescription>
            <CardAction>
              <Tabs value={view} onValueChange={(v) => setView(v as 'daily' | 'monthly')}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : series.length === 0 ? (
              <EmptyState icon={BarChart3} title="No spending yet" description="Place your first order to see your spend trend here." className="h-64" />
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
                {view === 'daily' ? (
                  <AreaChart data={series} margin={{ left: 4, right: 8 }}>
                    <defs>
                      <linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-spend)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-spend)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `$${v}`} />
                    <ChartTooltip content={<ChartTooltipContent valueFormatter={(v, k) => (k === 'spend' ? money(Number(v)) : String(v))} />} />
                    <Area dataKey="spend" type="monotone" stroke="var(--color-spend)" strokeWidth={2} fill="url(#fillSpend)" />
                  </AreaChart>
                ) : (
                  <BarChart data={series} margin={{ left: 4, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `$${v}`} />
                    <ChartTooltip content={<ChartTooltipContent valueFormatter={(v, k) => (k === 'spend' ? money(Number(v)) : String(v))} />} />
                    <Bar dataKey="spend" fill="var(--color-spend)" radius={0} />
                  </BarChart>
                )}
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="text-primary size-5" /> Next bill due</CardTitle>
            <CardDescription>Net 30 payment terms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : next ? (
              <>
                <div className="bg-muted/50 rounded-none border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{next.billNumber}</span>
                    <BillStatusBadge status={next.effectiveStatus} />
                  </div>
                  <p className="mt-3 text-3xl font-semibold tabular-nums">{money(next.amount)}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Due {date(next.dueDate)} ·{' '}
                    {daysUntil(next.dueDate) >= 0 ? `${daysUntil(next.dueDate)} day(s) left` : <span className="text-destructive">{-daysUntil(next.dueDate)} day(s) overdue</span>}
                  </p>
                </div>
                <Button variant="outline" className="w-full" asChild><Link to="/bills">Review & pay bills <ArrowRight /></Link></Button>
              </>
            ) : (
              <EmptyState icon={Receipt} title="No open bills" description="You're all settled up." className="py-8" />
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <QuickLink to="/shop" icon={ShoppingBasket} label="Browse catalog" />
              <QuickLink to="/orders" icon={Package} label="Order history" />
              <QuickLink to="/bills" icon={Receipt} label="Bills" />
              <QuickLink to="/reports" icon={BarChart3} label="Reports" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>Your latest 5 orders</CardDescription>
          <CardAction><Button variant="ghost" size="sm" asChild><Link to="/orders">View all <ArrowRight /></Link></Button></CardAction>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !data?.recentOrders.length ? (
            <EmptyState icon={Package} title="No orders yet" description="Your orders will show up here." action={<Button asChild><Link to="/shop">Start shopping</Link></Button>} />
          ) : (
            <ul className="divide-y">
              {data.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="hover:bg-muted/50 -mx-2 flex items-center gap-4 rounded-none px-2 py-3 transition-colors">
                    <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-none"><Package className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{o.orderNumber}</span>
                        <OrderStatusBadge status={o.status} />
                      </div>
                      <p className="text-muted-foreground truncate text-xs">{o.items.length} line(s) · {relative(o.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{money(o.total)}</p>
                      {o.bill && <BillStatusBadge status={o.bill.effectiveStatus} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Package; label: string }) {
  return (
    <Link to={to} className="hover:border-primary/50 hover:bg-primary/5 flex items-center gap-2 rounded-none border p-2.5 text-sm transition-colors">
      <Icon className="text-primary size-4" /> {label}
    </Link>
  );
}
