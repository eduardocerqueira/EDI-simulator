import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, FileText, Mail, Package, ShoppingCart } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters, usePartners } from '@/lib/hooks';
import { EmptyState, ErrorState, Fields, LiveDot, LoadingPage, LoadingRows, Mono, NativeSelect, PageHeader, Pagination, StatCard } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { VBarChart } from '@/components/charts';

interface ProductRow {
  id: string;
  upc: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  pack: number | null;
  size: number | null;
  unitCost: number;
  sellPrice: number;
  quantityOnHand: number;
  updatedAt: string;
  partner: { id: string; name: string; isaId: string };
  lastTransaction: { id: string; type: string; controlNumber: string; interchange: { id: string; controlNumber: string } } | null;
}

function StockBadge({ qty, threshold, uom }: { qty: number; threshold: number; uom: string }) {
  if (qty <= 0) return <Badge variant="destructive">Out of stock</Badge>;
  if (qty <= threshold) return <Badge variant="warning">{qty} {uom} · low</Badge>;
  return <span className="tabular-nums">{qty.toLocaleString()} {uom}</span>;
}

export function InventoryPage() {
  const nav = useNavigate();
  const { values: f, page, set } = useUrlFilters({ q: '', category: '', partnerId: '', stock: '', sort: 'name' });
  const partners = usePartners();
  const q = useQuery({
    queryKey: ['inventory', f, page],
    queryFn: () => api<Page<ProductRow> & { categories: string[]; lowStockThreshold: number }>(`/inventory${qs({ ...f, page, pageSize: 30 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Products are created by 832 catalogs, quantities set by 846 inventory advices, increased by 856 ship notices and decreased by customer orders. Every change is traceable to its source."
        actions={<LiveDot />}
      />
      <Card className="gap-0 py-0">
        <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="Name, UPC or SKU" onReset={() => set({ q: '', category: '', partnerId: '', stock: '', sort: 'name' })}>
          <NativeSelect value={f.category} onChange={(v) => set({ category: v })} placeholder="All categories" options={(q.data?.categories ?? []).map((c) => ({ value: c, label: c }))} />
          <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <NativeSelect value={f.stock} onChange={(v) => set({ stock: v })} placeholder="Any stock" options={[{ value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} />
          <NativeSelect value={f.sort} onChange={(v) => set({ sort: v })} options={[{ value: 'name', label: 'Sort: name' }, { value: 'qty', label: 'Sort: quantity ↑' }, { value: 'updated', label: 'Sort: recently updated' }, { value: 'price', label: 'Sort: price ↓' }]} />
        </FilterBar>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState icon={Boxes} title="No products" description="Send 832 catalogs from the producer simulator (--bootstrap) to load the inventory." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>UPC / SKU</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sell price</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead>Last EDI source</TableHead>
                <TableHead className="pr-4 text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.items.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => nav(`/inventory/${p.id}`)}>
                  <TableCell className="pl-4 font-medium">{p.name}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{p.upc}</div>
                    <div className="text-muted-foreground font-mono text-xs">{p.sku}</div>
                  </TableCell>
                  <TableCell className="text-sm">{p.partner.name}</TableCell>
                  <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(p.unitCost)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt.money(p.sellPrice)}</TableCell>
                  <TableCell className="text-right"><StockBadge qty={p.quantityOnHand} threshold={q.data!.lowStockThreshold} uom={p.uom} /></TableCell>
                  <TableCell>
                    {p.lastTransaction ? (
                      <Link to={`/edi/transactions/${p.lastTransaction.id}`} onClick={(e) => e.stopPropagation()} className="text-primary font-mono text-xs hover:underline">
                        {p.lastTransaction.type} · ICN {p.lastTransaction.interchange.controlNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground pr-4 text-right text-xs">{fmt.ago(p.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}

interface ProductDetail extends Omit<ProductRow, 'partner'> {
  quantityReserved: number;
  createdAt: string;
  partner: { id: string; name: string; isaId: string; code: string };
  movements: Array<{
    id: string;
    type: string;
    quantityDelta: number;
    quantityAfter: number;
    unitCost: number | null;
    note: string | null;
    orderNumber: string | null;
    createdAt: string;
    transaction: { id: string; type: string; controlNumber: string; status: string; interchange: { id: string; controlNumber: string; receivedAt: string; fileTransfer: { fileName: string } } } | null;
  }>;
}

const MOVE_STYLE: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'muted' | 'destructive' }> = {
  CATALOG: { label: '832 catalog', variant: 'info' },
  INVENTORY_ADVICE: { label: '846 inventory advice', variant: 'info' },
  RECEIPT: { label: '856 receipt', variant: 'success' },
  ORDER_PLACED: { label: 'Order placed', variant: 'warning' },
  ORDER_CANCELLED: { label: 'Order cancelled', variant: 'muted' },
};

export function ProductDetailPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api<ProductDetail>(`/inventory/${id}`), refetchInterval: 5000 });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const p = q.data!;
  const history = [...p.movements].reverse().map((m) => ({ at: fmt.dateTime(m.createdAt), qty: m.quantityAfter }));
  const margin = p.sellPrice - p.unitCost;
  return (
    <>
      <PageHeader
        back={{ to: '/inventory', label: 'Inventory' }}
        title={p.name}
        description={
          <>
            {p.category} · from <Link to={`/partners/${p.partner.id}`} className="text-primary hover:underline">{p.partner.name}</Link> · UPC <Mono>{p.upc}</Mono> · SKU <Mono>{p.sku}</Mono>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="On hand" value={`${p.quantityOnHand.toLocaleString()} ${p.uom}`} icon={Boxes} tone={p.quantityOnHand <= 0 ? 'destructive' : 'default'} />
        <StatCard label="Unit cost (CTP03)" value={fmt.money(p.unitCost)} icon={Package} hint={p.pack ? `Pack ${p.pack} × ${p.size ?? 1} ${p.uom}` : undefined} />
        <StatCard label="Sell price" value={fmt.money(p.sellPrice)} icon={ShoppingCart} hint={`Margin ${fmt.money(margin)} (${fmt.pct(p.unitCost ? margin / p.unitCost : null, 0)} markup)`} tone="info" />
        <StatCard label="Stock value" value={fmt.money(Math.max(0, p.quantityOnHand) * p.unitCost)} icon={FileText} hint={`Last change ${fmt.ago(p.updatedAt)}`} />
      </div>
      <Card className="mt-4 gap-2">
        <CardHeader>
          <CardTitle>Quantity history</CardTitle>
          <CardDescription>Quantity after each movement</CardDescription>
        </CardHeader>
        <CardContent>
          <VBarChart data={history} xKey="at" config={{ qty: { label: 'On hand', color: 'var(--chart-1)' } }} className="h-[200px]" />
        </CardContent>
      </Card>
      <Card className="mt-4 gap-2">
        <CardHeader>
          <CardTitle>Movement ledger — traceability</CardTitle>
          <CardDescription>Every quantity or price change, linked to the X12 transaction set and envelope (or order) that caused it</CardDescription>
        </CardHeader>
        <CardContent className="px-3">
          {p.movements.length === 0 ? (
            <EmptyState title="No movements" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">Δ Qty</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.movements.map((m) => {
                  const s = MOVE_STYLE[m.type] ?? { label: m.type, variant: 'muted' as const };
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{fmt.dateTime(m.createdAt)}</TableCell>
                      <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                      <TableCell className={cn('text-right tabular-nums', m.quantityDelta > 0 ? 'text-success' : m.quantityDelta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.quantityAfter}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.unitCost != null ? fmt.money(m.unitCost) : '—'}</TableCell>
                      <TableCell>
                        {m.transaction ? (
                          <div className="flex flex-wrap items-center gap-1 text-xs">
                            <Link to={`/edi/transactions/${m.transaction.id}`} className="text-primary inline-flex items-center gap-1 font-mono hover:underline">
                              <FileText className="size-3" /> {m.transaction.type} #{m.transaction.controlNumber}
                            </Link>
                            <ArrowRight className="text-muted-foreground size-3" />
                            <Link to={`/edi/interchanges/${m.transaction.interchange.id}`} className="text-primary inline-flex items-center gap-1 font-mono hover:underline">
                              <Mail className="size-3" /> ICN {m.transaction.interchange.controlNumber}
                            </Link>
                            <span className="text-muted-foreground font-mono">({m.transaction.interchange.fileTransfer.fileName})</span>
                          </div>
                        ) : m.orderNumber ? (
                          <Link to={`/orders?q=${m.orderNumber}`} className="text-primary inline-flex items-center gap-1 text-xs hover:underline">
                            <ShoppingCart className="size-3" /> {m.orderNumber}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[280px] truncate text-xs" title={m.note ?? ''}>{m.note}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card className="mt-4 py-4">
        <CardContent className="px-4">
          <Fields cols={4} items={[['Producer ISA', <Mono>{p.partner.isaId}</Mono>], ['Reserved', p.quantityReserved], ['Created', fmt.dateTime(p.createdAt)], ['Pack / size', `${p.pack ?? '—'} / ${p.size ?? '—'} ${p.uom}`]]} />
        </CardContent>
      </Card>
    </>
  );
}
