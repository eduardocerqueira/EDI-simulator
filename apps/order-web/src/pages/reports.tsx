import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@edi/ui/components/chart';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { api, type Summary } from '@/lib/api';
import { money, monthLabel, num } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { BillStatusBadge } from '@/components/status-badge';
import { CategoryIcon } from '@/components/category-icon';

const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-3)', 'oklch(0.65 0.12 190)', 'oklch(0.6 0.1 110)', 'oklch(0.55 0.08 30)'];

const monthlyConfig = { spend: { label: 'Spend', color: 'var(--chart-1)' }, orders: { label: 'Orders', color: 'var(--chart-4)' }, cancelled: { label: 'Cancelled', color: 'var(--chart-3)' } } satisfies ChartConfig;
const producerConfig = { spend: { label: 'Spend', color: 'var(--chart-2)' } } satisfies ChartConfig;

export function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/summary') });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Reports" />
        <div className="grid gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-xl" />)}</div>
      </div>
    );
  }
  if (!data || data.totals.orders === 0) {
    return (
      <div>
        <PageHeader title="Reports" description="Spending insights for your account." />
        <EmptyState icon={BarChart3} title="No data yet" description="Reports are built from your orders and bills. Place an order to get started." />
      </div>
    );
  }

  const monthly = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const categoryConfig: ChartConfig = Object.fromEntries(data.byCategory.map((c, i) => [c.category, { label: c.category, color: PALETTE[i % PALETTE.length] }]));
  const categoryData = data.byCategory.map((c, i) => ({ ...c, fill: PALETTE[i % PALETTE.length] }));
  const totalCat = data.byCategory.reduce((n, c) => n + c.spend, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description={`${num(data.totals.placed)} orders · ${money(data.totals.spend)} total spend · avg ${money(data.totals.avgOrderValue)} per order`} />

      <Card>
        <CardHeader>
          <CardTitle>Monthly spend & orders</CardTitle>
          <CardDescription>Bars: spend (excl. cancelled). Lines: number of orders and cancellations.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={monthlyConfig} className="aspect-auto h-72 w-full">
            <ComposedChart data={monthly} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis yAxisId="spend" tickLine={false} axisLine={false} width={60} tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="orders" orientation="right" tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent valueFormatter={(v, k) => (k === 'spend' ? money(Number(v)) : String(v))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar yAxisId="spend" dataKey="spend" fill="var(--color-spend)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              <Line yAxisId="orders" dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} dot />
              <Line yAxisId="orders" dataKey="cancelled" stroke="var(--color-cancelled)" strokeWidth={2} strokeDasharray="4 4" dot />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend by category</CardTitle>
            <CardDescription>Share of spend per product category</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <EmptyState icon={PieIcon} title="No category data" />
            ) : (
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <ChartContainer config={categoryConfig} className="aspect-square h-56 shrink-0">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel valueFormatter={(v) => money(Number(v))} />} />
                    <Pie data={categoryData} dataKey="spend" nameKey="category" innerRadius={60} outerRadius={95} strokeWidth={2} paddingAngle={1}>
                      {categoryData.map((c) => <Cell key={c.category} fill={c.fill} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="w-full space-y-2 text-sm">
                  {categoryData.map((c) => (
                    <li key={c.category} className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: c.fill }} />
                      <span className="flex-1 truncate">{c.category}</span>
                      <span className="text-muted-foreground tabular-nums">{totalCat ? Math.round((c.spend / totalCat) * 100) : 0}%</span>
                      <span className="w-20 text-right font-medium tabular-nums">{money(c.spend)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spend by producer</CardTitle>
            <CardDescription>Which partner farms you buy from most</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={producerConfig} className="aspect-auto w-full" style={{ height: Math.max(180, data.byProducer.length * 36) }}>
              <BarChart data={data.byProducer} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="producer" tickLine={false} axisLine={false} width={140} />
                <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => money(Number(v))} />} />
                <Bar dataKey="spend" fill="var(--color-spend)" radius={[0, 6, 6, 0]} maxBarSize={24} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By spend, excluding cancelled orders</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topProducts.map((p, i) => (
                  <TableRow key={p.name}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(p.quantity)} {p.uom}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(p.spend)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bills by status</CardTitle>
            <CardDescription>Count and amount</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.billStatus.map((b) => {
              const max = Math.max(1, ...data.billStatus.map((x) => x.amount));
              return (
                <div key={b.status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><BillStatusBadge status={b.status} /> <span className="text-muted-foreground">{b.count}</span></span>
                    <span className="font-medium tabular-nums">{money(b.amount)}</span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(b.amount / max) * 100}%`, backgroundColor: b.status === 'PAID' ? 'var(--success)' : b.status === 'OVERDUE' ? 'var(--destructive)' : b.status === 'OPEN' ? 'var(--info)' : 'var(--muted-foreground)' }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2 pt-3">
              {data.byCategory.slice(0, 4).map((c) => (
                <div key={c.category} className="flex items-center gap-2 rounded-lg border p-2">
                  <CategoryIcon category={c.category} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-xs">{c.category}</p>
                    <p className="text-sm font-medium tabular-nums">{money(c.spend)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
