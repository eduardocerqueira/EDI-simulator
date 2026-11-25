import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileCode2, Search, ShoppingCart, Sprout, Check } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent } from '@edi/ui/components/card';
import { Input } from '@edi/ui/components/input';
import { Label } from '@edi/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@edi/ui/components/select';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Switch } from '@edi/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import { toast } from '@edi/ui/components/sonner';
import { cn } from '@edi/ui/lib/utils';
import { api, qs, LOW_STOCK, type Facets, type Page, type Product } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { money, num, relative, TX_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { CategoryIcon } from '@/components/category-icon';
import { StockBadge } from '@/components/status-badge';
import { QuantityStepper } from '@/components/quantity-stepper';
import { EmptyState } from '@/components/empty-state';

const ALL = '__all';

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ShopPage() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [category, setCategory] = useState(ALL);
  const [producer, setProducer] = useState(ALL);
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, category, producer, inStock, sort]);

  const facets = useQuery({ queryKey: ['facets'], queryFn: () => api<Facets>('/products/facets'), refetchInterval: 20_000 });
  const products = useQuery({
    queryKey: ['products', { q, category, producer, inStock, sort, page }],
    queryFn: () =>
      api<Page<Product>>(`/products${qs({ q, category: category === ALL ? '' : category, producer: producer === ALL ? '' : producer, inStock, sort, page, pageSize: 24 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

  const totalPages = products.data ? Math.max(1, Math.ceil(products.data.total / products.data.pageSize)) : 1;
  const noInventory = facets.data && facets.data.totalProducts === 0;

  return (
    <div>
      <PageHeader
        title="Shop inventory"
        description={
          facets.data
            ? `${num(facets.data.totalProducts)} products from ${facets.data.producers.length} farms · ${num(facets.data.inStock)} in stock · ${num(facets.data.totalUnits)} units available`
            : 'Fresh products from our partner farms'
        }
      />

      {noInventory ? (
        <EmptyState
          icon={Sprout}
          title="The shelves are empty — for now"
          description={
            <>
              Inventory arrives when producers send EDI documents to the distributor: an <b>832 Price/Sales Catalog</b> adds products, an <b>846 Inventory Advice</b> sets available quantities and an <b>856 Ship Notice</b> adds received stock. Run the producer simulator (e.g. <code className="font-mono">npm run sim:producers -- --bootstrap --count 20</code>) and products will appear here within seconds.
            </>
          }
        />
      ) : (
        <>
          <Card className="mb-6 py-4">
            <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input className="pl-9" placeholder="Search products, farms or SKUs…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All categories</SelectItem>
                    {facets.data?.categories.map((c) => <SelectItem key={c.category} value={c.category}>{c.category} ({c.count})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={producer} onValueChange={setProducer}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Producer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All producers</SelectItem>
                    {facets.data?.producers.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name A–Z</SelectItem>
                    <SelectItem value="price_asc">Price: low to high</SelectItem>
                    <SelectItem value="price_desc">Price: high to low</SelectItem>
                    <SelectItem value="stock">Most in stock</SelectItem>
                    <SelectItem value="new">Recently synced</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch id="instock" checked={inStock} onCheckedChange={setInStock} />
                  <Label htmlFor="instock" className="text-sm">In stock only</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {products.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
            </div>
          ) : !products.data?.items.length ? (
            <EmptyState icon={Search} title="No products match" description="Try a different search or clear the filters." action={<Button variant="outline" onClick={() => { setSearch(''); setCategory(ALL); setProducer(ALL); setInStock(false); }}>Clear filters</Button>} />
          ) : (
            <>
              <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', products.isFetching && 'opacity-80')}>
                {products.data.items.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
              <div className="mt-6 flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Showing {(page - 1) * 24 + 1}–{Math.min(page * 24, products.data.total)} of {products.data.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /> Prev</Button>
                  <span className="text-sm tabular-nums">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight /></Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  const cart = useCart();
  const inCart = cart.quantityOf(p.id);
  const remaining = Math.max(0, p.available - inCart);
  const [qty, setQty] = useState(1);
  const out = p.available <= 0;

  const add = () => {
    if (remaining <= 0) return;
    const n = Math.min(qty, remaining);
    cart.add(p, n);
    toast.success(`Added ${n} ${p.uom} of ${p.name}`, { action: { label: 'View cart', onClick: () => cart.setOpen(true) } });
    setQty(1);
  };

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="from-muted/70 to-background relative flex h-28 items-center justify-center bg-gradient-to-br">
        <CategoryIcon category={p.category} size="lg" className="transition-transform group-hover:scale-110" />
        <Badge variant="outline" className="bg-background/80 absolute top-3 left-3 backdrop-blur">{p.category}</Badge>
        {inCart > 0 && (
          <Badge className="absolute top-3 right-3"><Check /> {inCart} in cart</Badge>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-1 font-medium" title={p.name}>{p.name}</h3>
          <p className="text-muted-foreground line-clamp-1 text-xs">{p.producerName} · SKU {p.sku}</p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-xl font-semibold tabular-nums">
            {money(p.price)}
            <span className="text-muted-foreground text-xs font-normal"> / {p.uom}</span>
          </p>
          <StockBadge available={p.available} />
        </div>
        {p.sourceTransactionType && (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-muted-foreground flex cursor-help items-center gap-1 truncate text-[11px]">
                <FileCode2 className="size-3 shrink-0" />
                Synced from EDI {TX_LABEL[p.sourceTransactionType] ?? p.sourceTransactionType} · ICN {p.sourceEnvelopeIcn ?? '—'} · {relative(p.lastSyncedAt)}
              </p>
            </TooltipTrigger>
            <TooltipContent>
              This price and stock level came from an X12 {p.sourceTransactionType} sent by {p.producerName}, converted to JSON by the distributor (interchange control number {p.sourceEnvelopeIcn}).
            </TooltipContent>
          </Tooltip>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {out ? (
            <Button variant="secondary" className="w-full" disabled>Out of stock</Button>
          ) : (
            <>
              <QuantityStepper size="sm" value={Math.min(qty, Math.max(1, remaining))} max={Math.max(1, remaining)} onChange={(v) => setQty(Math.max(1, v))} />
              <Button size="sm" className="flex-1" onClick={add} disabled={remaining <= 0}>
                <ShoppingCart /> {remaining <= 0 ? 'Max in cart' : 'Add'}
              </Button>
            </>
          )}
        </div>
        {!out && p.available <= LOW_STOCK && <p className="text-[11px] text-[oklch(0.55_0.13_70)]">Only {p.available} {p.uom} left — order soon.</p>}
      </CardContent>
    </Card>
  );
}
