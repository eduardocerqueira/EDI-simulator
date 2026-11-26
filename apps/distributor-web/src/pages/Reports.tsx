import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import type { Kpis } from '@/lib/types';
import { ErrorState, LoadingPage, NativeSelect, PageHeader, StatCard } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { LAYER } from '@/lib/actions';
import { usePartners, useUrlFilters } from '@/lib/hooks';
import { EdiErrorsReport } from '@/pages/reports/EdiErrors';
import { DonutChart, HBarChart, VBarChart } from '@/components/charts';
import { CircleDollarSign, Receipt, ShoppingCart, TriangleAlert, XCircle } from '@edi/ui/icons';

interface ReportData {
  days: number;
  daily: Array<{ day: string; orders: number; cancelled: number; revenue: number }>;
  arAging: Array<{ bucket: string; amount: number; bills: number }>;
  billStatus: Array<{ status: string; count: number; amount: number }>;
  topProducts: Array<{ upc: string; name: string; quantity: number; revenue: number }>;
  revenueByCategory: Array<{ category: string; revenue: number }>;
  revenueByProducer: Array<{ producer: string; revenue: number }>;
  topCustomers: Array<{ id: string; name: string; revenue: number }>;
}

const money = (v: number) => fmt.moneyCompact(v);

const PERIODS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];
const EDI_TABS = ['edi', 'errors'];

export function ReportsPage() {
  const { values: f, set } = useUrlFilters({ tab: 'sales', days: '30', partnerId: '', type: '', layer: '', code: '' });
  const partners = usePartners();
  const days = Number(f.days) || 30;
  const isEdi = EDI_TABS.includes(f.tab);
  const filtered = !!(f.partnerId || f.type || f.layer || f.code || f.days !== '30');
  const r = useQuery({ queryKey: ['reports', days], queryFn: () => api<ReportData>(`/reports?days=${days}`), refetchInterval: 15000 });
  const k = useQuery({ queryKey: ['kpis', days * 24], queryFn: () => api<Kpis>(`/kpis?hours=${days * 24}`), refetchInterval: 15000 });
  if (r.isLoading || k.isLoading) return <LoadingPage />;
  if (r.error || k.error) return <ErrorState error={r.error ?? k.error} />;
  const d = r.data!;
  const kp = k.data!;
  const revenue = d.daily.reduce((n, x) => n + x.revenue, 0);
  const orders = d.daily.reduce((n, x) => n + x.orders, 0);
  const cancelled = d.daily.reduce((n, x) => n + x.cancelled, 0);

  return (
    <>
      <PageHeader title="Reports" description="Customer, order and billing reports, EDI volume, and EDI errors per producer with drill-down and exception reports." />
      <div className="bg-card mb-4 rounded-none border">
        <FilterBar onReset={filtered ? () => set({ days: '30', partnerId: '', type: '', layer: '', code: '' }) : undefined}>
          <NativeSelect value={f.days} onChange={(v) => set({ days: v || '30' })} options={PERIODS} />
          {isEdi && (
            <>
              <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
              <NativeSelect
                value={f.type}
                onChange={(v) => set({ type: v })}
                placeholder="All transaction types"
                options={[
                  { value: '832', label: '832 Price/Sales Catalog' },
                  { value: '846', label: '846 Inventory Advice' },
                  { value: '856', label: '856 Ship Notice' },
                ]}
              />
            </>
          )}
          {f.tab === 'errors' && (
            <>
              <NativeSelect value={f.layer} onChange={(v) => set({ layer: v })} placeholder="Any layer" options={['ENVELOPE', 'SYNTAX', 'BUSINESS'].map((l) => ({ value: l, label: LAYER[l]!.label }))} />
              {f.code && (
                <button onClick={() => set({ code: '' })} className="bg-primary/10 text-primary inline-flex h-9 cursor-pointer items-center gap-1 rounded-none px-3 font-mono text-xs">
                  code: {f.code} ✕
                </button>
              )}
            </>
          )}
          {!isEdi && <span className="text-muted-foreground text-xs">Producer and transaction-type filters apply to the EDI tabs.</span>}
        </FilterBar>
      </div>
      <Tabs value={f.tab} onValueChange={(v) => set({ tab: v })}>
        <TabsList>
          <TabsTrigger value="sales">Orders & revenue</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="customers">Customers & products</TabsTrigger>
          <TabsTrigger value="edi">EDI volume</TabsTrigger>
          <TabsTrigger value="errors">
            <TriangleAlert /> EDI errors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-4">
          <EdiErrorsReport filters={{ days: f.days, partnerId: f.partnerId, type: f.type, layer: f.layer, code: f.code }} setFilter={(patch) => set(patch)} />
        </TabsContent>

        <TabsContent value="sales" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Revenue" value={fmt.money(revenue)} icon={CircleDollarSign} tone="success" />
            <StatCard label="Orders" value={fmt.num(orders)} icon={ShoppingCart} />
            <StatCard label="Avg order value" value={fmt.money(orders - cancelled ? revenue / (orders - cancelled) : 0)} icon={Receipt} tone="info" />
            <StatCard label="Cancelled" value={fmt.num(cancelled)} hint={fmt.pct(orders ? cancelled / orders : null)} icon={XCircle} tone="warning" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Daily revenue</CardTitle></CardHeader>
              <CardContent><VBarChart data={d.daily} xKey="day" config={{ revenue: { label: 'Revenue', color: 'var(--chart-1)' } }} yFormatter={money} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Daily orders</CardTitle><CardDescription>Placed vs cancelled</CardDescription></CardHeader>
              <CardContent>
                <VBarChart data={d.daily.map((x) => ({ ...x, placed: x.orders - x.cancelled }))} xKey="day" stacked config={{ placed: { label: 'Placed', color: 'var(--chart-4)' }, cancelled: { label: 'Cancelled', color: 'var(--chart-3)' } }} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Revenue by category</CardTitle></CardHeader>
              <CardContent><DonutChart data={d.revenueByCategory} nameKey="category" valueKey="revenue" valueFormatter={money} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Revenue by producer</CardTitle></CardHeader>
              <CardContent><HBarChart data={d.revenueByProducer} labelKey="producer" valueKey="revenue" valueFormatter={money} labelWidth={160} /></CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Open receivables" value={fmt.money(kp.orders.openAmount)} hint={`${kp.orders.openBills} open bills`} icon={Receipt} tone="info" />
            <StatCard label="Overdue" value={fmt.money(kp.orders.overdueAmount)} hint={`${kp.orders.overdueBills} bills past net-30`} icon={Receipt} tone="destructive" />
            <StatCard label="Collected" value={fmt.money(kp.orders.paidAmount)} icon={CircleDollarSign} tone="success" />
            <StatCard label="Customers" value={kp.orders.customers} icon={ShoppingCart} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Accounts receivable aging</CardTitle><CardDescription>Bills by days past due date</CardDescription></CardHeader>
              <CardContent><VBarChart data={d.arAging} xKey="bucket" config={{ amount: { label: 'Amount', color: 'var(--chart-2)' } }} yFormatter={money} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Bill status</CardTitle></CardHeader>
              <CardContent>
                <DonutChart data={d.billStatus} nameKey="status" valueKey="amount" valueFormatter={money} colors={['var(--chart-4)', 'var(--chart-1)', 'var(--muted-foreground)', 'var(--chart-3)']} />
              </CardContent>
            </Card>
          </div>
          <Card className="gap-2">
            <CardHeader><CardTitle>Aging detail</CardTitle></CardHeader>
            <CardContent className="px-3">
              <Table>
                <TableHeader><TableRow><TableHead>Bucket</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.arAging.map((a) => (
                    <TableRow key={a.bucket}><TableCell>{a.bucket}</TableCell><TableCell className="text-right tabular-nums">{a.bills}</TableCell><TableCell className="text-right tabular-nums">{fmt.money(a.amount)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-2">
              <CardHeader><CardTitle>Top customers</CardTitle></CardHeader>
              <CardContent className="px-3">
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.topCustomers.map((c, i) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell><Link className="hover:underline" to={`/customers/${c.id}`}>{c.name}</Link></TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt.money(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="gap-2">
              <CardHeader><CardTitle>Top products</CardTitle></CardHeader>
              <CardContent className="px-3">
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.topProducts.map((p) => (
                      <TableRow key={p.upc}>
                        <TableCell><div>{p.name}</div><div className="text-muted-foreground font-mono text-xs">{p.upc}</div></TableCell>
                        <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt.money(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="edi" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Transaction sets by type</CardTitle></CardHeader>
              <CardContent>
                <VBarChart
                  data={kp.byType}
                  xKey="type"
                  stacked
                  config={{ ingested: { label: 'Ingested', color: 'var(--chart-1)' }, businessRejected: { label: 'Business rejected', color: 'var(--chart-2)' }, syntaxRejected: { label: 'Syntax rejected', color: 'var(--chart-3)' } }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Issues by level</CardTitle></CardHeader>
              <CardContent><DonutChart data={kp.validation.byLevel} nameKey="level" valueKey="count" /></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Transaction sets by producer</CardTitle></CardHeader>
            <CardContent>
              <VBarChart
                data={kp.partners.filter((p) => !f.partnerId || p.id === f.partnerId).map((p) => ({ name: p.isaId, accepted: p.accepted, rejected: p.transactions - p.accepted }))}
                xKey="name"
                stacked
                config={{ accepted: { label: 'Accepted', color: 'var(--chart-1)' }, rejected: { label: 'Rejected', color: 'var(--chart-3)' } }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
