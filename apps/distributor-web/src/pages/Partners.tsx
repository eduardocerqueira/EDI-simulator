import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, FolderInput, FolderOutput, LayoutGrid, List, MapPin } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Progress } from '@edi/ui/components/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { statusVariant } from '@/lib/status';
import { EmptyState, ErrorState, Fields, LoadingPage, Mono, NativeSelect, PageHeader, Pagination, StatusBadge } from '@/components/common';
import { BrandLogo } from '@/components/BrandLogo';
import { FilterBar } from '@/components/FilterBar';
import { useUrlFilters } from '@/lib/hooks';
import { HBarChart } from '@/components/charts';

interface PartnerRow {
  id: string;
  code: string;
  name: string;
  isaQualifier: string;
  isaId: string;
  gsCode: string;
  ftpUser: string;
  specialty: string | null;
  city: string | null;
  state: string | null;
  active: boolean;
  productCount: number;
  unitsOnHand: number;
  interchanges: number;
  interchangesRejected: number;
  transactions: number;
  transactionsAccepted: number;
  acceptanceRate: number | null;
  lastSeenAt: string | null;
}

const rateColor = (r: number | null) => (r === null ? 'bg-muted-foreground' : r < 0.7 ? 'bg-destructive' : r < 0.9 ? 'bg-warning' : 'bg-success');

const HEALTH: Record<string, { label: string; test: (r: number | null) => boolean }> = {
  healthy: { label: 'Healthy (≥ 90% accepted)', test: (r) => r !== null && r >= 0.9 },
  warning: { label: 'Watch (70–90%)', test: (r) => r !== null && r >= 0.7 && r < 0.9 },
  poor: { label: 'Poor (< 70%)', test: (r) => r !== null && r < 0.7 },
  none: { label: 'No transactions yet', test: (r) => r === null },
};
const ACTIVITY: Record<string, { label: string; test: (last: string | null) => boolean }> = {
  '1h': { label: 'Sent in the last hour', test: (d) => !!d && Date.now() - new Date(d).getTime() < 3600_000 },
  '24h': { label: 'Sent in the last 24h', test: (d) => !!d && Date.now() - new Date(d).getTime() < 86400_000 },
  idle: { label: 'Idle for 24h+', test: (d) => !d || Date.now() - new Date(d).getTime() >= 86400_000 },
};
const SORTS: Record<string, { label: string; cmp: (a: PartnerRow, b: PartnerRow) => number }> = {
  name: { label: 'Name A→Z', cmp: (a, b) => a.name.localeCompare(b.name) },
  acceptance: { label: 'Acceptance (lowest first)', cmp: (a, b) => (a.acceptanceRate ?? 2) - (b.acceptanceRate ?? 2) },
  rejected: { label: 'Most rejected files', cmp: (a, b) => b.interchangesRejected - a.interchangesRejected },
  files: { label: 'Most files', cmp: (a, b) => b.interchanges - a.interchanges },
  recent: { label: 'Most recently seen', cmp: (a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '') },
  products: { label: 'Most products', cmp: (a, b) => b.productCount - a.productCount },
};

function AcceptanceBar({ rate, className }: { rate: number | null; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress value={(rate ?? 0) * 100} className="h-1.5" indicatorClassName={rateColor(rate)} />
      <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">{fmt.pct(rate)}</span>
    </div>
  );
}

function PartnerCard({ p }: { p: PartnerRow }) {
  return (
    <Link to={`/partners/${p.id}`}>
      <Card className="h-full gap-4 transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-start gap-3">
            <BrandLogo name={p.name} kind="producer" hint={p.specialty} size="md" />
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <Badge variant="outline" className="font-mono">
                  {p.code}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1 flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {p.city}, {p.state} · {p.specialty}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">ISA</span>
            <Mono className="bg-muted rounded-none px-1.5 py-0.5">
              {p.isaQualifier}:{p.isaId}
            </Mono>
            <span className="text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="size-3" /> {fmt.ago(p.lastSeenAt)}
            </span>
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-xs">Acceptance rate</div>
            <AcceptanceBar rate={p.acceptanceRate} />
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Products', p.productCount],
              ['Units', fmt.num(p.unitsOnHand)],
              ['Files', p.interchanges],
              ['Rejected', p.interchangesRejected],
            ].map(([l, v]) => (
              <div key={l as string} className="bg-muted/50 rounded-none py-2">
                <div className="font-semibold tabular-nums">{v}</div>
                <div className="text-muted-foreground text-[11px]">{l}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function PartnerTable({ rows }: { rows: PartnerRow[] }) {
  const nav = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producer</TableHead>
          <TableHead>ISA ID</TableHead>
          <TableHead>Location</TableHead>
          <TableHead className="text-right">Products</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Files</TableHead>
          <TableHead className="text-right">Rejected</TableHead>
          <TableHead className="w-44">Acceptance</TableHead>
          <TableHead className="text-right">Last file</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id} className="cursor-pointer" onClick={() => nav(`/partners/${p.id}`)}>
            <TableCell>
              <div className="flex items-center gap-3">
                <BrandLogo name={p.name} kind="producer" hint={p.specialty} size="sm" />
                <div className="min-w-0">
                  <Link to={`/partners/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {p.name}
                  </Link>
                  <div className="text-muted-foreground text-xs">{p.specialty}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Mono className="text-xs">
                {p.isaQualifier}:{p.isaId}
              </Mono>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
              {p.city}, {p.state}
            </TableCell>
            <TableCell className="text-right tabular-nums">{p.productCount}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.num(p.unitsOnHand)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.num(p.interchanges)}</TableCell>
            <TableCell className={cn('text-right tabular-nums', p.interchangesRejected ? 'text-destructive font-medium' : 'text-muted-foreground')}>{fmt.num(p.interchangesRejected)}</TableCell>
            <TableCell>
              <AcceptanceBar rate={p.acceptanceRate} />
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap" title={p.lastSeenAt ? fmt.dateTime(p.lastSeenAt) : undefined}>
              {fmt.ago(p.lastSeenAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PartnersPage() {
  const q = useQuery({ queryKey: ['partners'], queryFn: () => api<PartnerRow[]>('/partners'), refetchInterval: 10000 });
  const { values: f, page, set } = useUrlFilters({ q: '', specialty: '', state: '', health: '', activity: '', sort: 'name', view: 'cards', size: '9' });
  const all = q.data ?? [];
  const specialties = [...new Set(all.map((p) => p.specialty).filter((x): x is string => !!x))].sort();
  const states = [...new Set(all.map((p) => p.state).filter((x): x is string => !!x))].sort();
  const needle = f.q.trim().toLowerCase();
  const rows = all
    .filter(
      (p) =>
        (!needle || [p.name, p.code, p.isaId, p.city ?? '', p.ftpUser].some((v) => v.toLowerCase().includes(needle))) &&
        (!f.specialty || p.specialty === f.specialty) &&
        (!f.state || p.state === f.state) &&
        (!f.health || HEALTH[f.health]?.test(p.acceptanceRate)) &&
        (!f.activity || ACTIVITY[f.activity]?.test(p.lastSeenAt)),
    )
    .sort(SORTS[f.sort]?.cmp ?? SORTS.name!.cmp);
  const size = Number(f.size) || 9;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * size, current * size);
  const filtered = !!(f.q || f.specialty || f.state || f.health || f.activity);

  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        title="Producers"
        description="The 10 farm producers (trading partners). Each one has an ISA sender ID and its own FTP mailbox; files arriving in a mailbox must carry that partner's ISA06."
        actions={
          <div className="bg-muted inline-flex rounded-none p-[3px]" role="group" aria-label="View">
            {(
              [
                ['cards', LayoutGrid, 'Cards'],
                ['table', List, 'Table'],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => set({ view: v, page: current })}
                aria-pressed={f.view === v}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-none px-3 py-1 text-sm font-medium transition-colors',
                  f.view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        }
      />
      <Card className="gap-0 py-0">
        <FilterBar
          search={f.q}
          onSearch={(v) => set({ q: v })}
          placeholder="Name, code, ISA ID, city"
          onReset={filtered ? () => set({ q: '', specialty: '', state: '', health: '', activity: '' }) : undefined}
        >
          <NativeSelect value={f.specialty} onChange={(v) => set({ specialty: v })} placeholder="All specialties" options={specialties.map((s) => ({ value: s, label: s }))} />
          <NativeSelect value={f.state} onChange={(v) => set({ state: v })} placeholder="All states" options={states.map((s) => ({ value: s, label: s }))} />
          <NativeSelect value={f.health} onChange={(v) => set({ health: v })} placeholder="Any acceptance" options={Object.entries(HEALTH).map(([value, h]) => ({ value, label: h.label }))} />
          <NativeSelect value={f.activity} onChange={(v) => set({ activity: v })} placeholder="Any activity" options={Object.entries(ACTIVITY).map(([value, a]) => ({ value, label: a.label }))} />
          <NativeSelect value={f.sort} onChange={(v) => set({ sort: v || 'name' })} options={Object.entries(SORTS).map(([value, s]) => ({ value, label: `Sort: ${s.label}` }))} />
        </FilterBar>
        {visible.length === 0 ? (
          <EmptyState title={filtered ? 'No producers match these filters' : 'No producers'} />
        ) : f.view === 'table' ? (
          <PartnerTable rows={visible} />
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <PartnerCard key={p.id} p={p} />
            ))}
          </div>
        )}
        <div className="flex items-center border-t [&>div>div]:border-t-0">
          <div className="flex-1">
            <Pagination page={current} pageSize={size} total={rows.length} onPage={(n) => set({ page: n })} />
          </div>
          <label className="text-muted-foreground flex items-center gap-2 pr-4 text-sm whitespace-nowrap">
            Per page
            <NativeSelect className="h-8" value={String(size)} onChange={(v) => set({ size: v })} options={['3', '6', '9', '12', '24'].map((n) => ({ value: n, label: n }))} />
          </label>
        </div>
      </Card>
    </>
  );
}

interface PartnerDetail extends PartnerRow {
  products: Array<{ id: string; name: string; upc: string; sku: string; category: string; uom: string; unitCost: number; sellPrice: number; quantityOnHand: number; updatedAt: string }>;
  interchanges: never;
  topIssues: Array<{ code: string; count: number }>;
  mailbox: { inbound: string; outbound: string };
}

export function PartnerDetailPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['partner', id], queryFn: () => api<Omit<PartnerDetail, 'interchanges'> & { interchanges: Array<{ id: string; controlNumber: string; status: string; receivedAt: string; errorCount: number; transactions: Array<{ type: string; status: string }> }> }>(`/partners/${id}`), refetchInterval: 10000 });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const p = q.data!;
  return (
    <>
      <PageHeader
        back={{ to: '/partners', label: 'Producers' }}
        title={
          <span className="flex items-center gap-3">
            <BrandLogo name={p.name} kind="producer" hint={p.specialty} size="lg" />
            {p.name}
          </span>
        }
        description={`${p.specialty ?? ''} · ${p.city}, ${p.state}`}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-sm">EDI identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Fields
              items={[
                ['Partner code (N104)', <Mono>{p.code}</Mono>],
                ['ISA05/06 sender', <Mono>{p.isaQualifier}:{p.isaId}</Mono>],
                ['GS02 app code', <Mono>{p.gsCode}</Mono>],
                ['FTP user', <Mono>{p.ftpUser}</Mono>],
                ['Status', p.active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>],
              ]}
            />
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><FolderInput className="text-muted-foreground size-4" /> <Mono className="text-xs">{p.mailbox.inbound}</Mono></div>
              <div className="flex items-center gap-2"><FolderOutput className="text-muted-foreground size-4" /> <Mono className="text-xs">{p.mailbox.outbound}</Mono></div>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-sm">Most frequent issues</CardTitle>
            <CardDescription>All time</CardDescription>
          </CardHeader>
          <CardContent>
            <HBarChart data={p.topIssues} labelKey="code" valueKey="count" color="var(--chart-3)" labelWidth={160} />
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm">Recent interchanges</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[320px] space-y-1 overflow-y-auto">
            {p.interchanges.length === 0 && <EmptyState title="No files yet" />}
            {p.interchanges.map((ic) => (
              <Link key={ic.id} to={`/edi/interchanges/${ic.id}`} className="hover:bg-muted/60 flex items-center gap-2 rounded-none px-2 py-1.5 text-sm">
                <Mono className="text-xs">{ic.controlNumber || '—'}</Mono>
                <div className="flex gap-1">
                  {ic.transactions.map((t, i) => (
                    <Badge key={i} variant={statusVariant(t.status)} className="font-mono">{t.type}</Badge>
                  ))}
                </div>
                <span className="ml-auto"><StatusBadge status={ic.status} /></span>
                <span className="text-muted-foreground w-16 text-right text-xs">{fmt.ago(ic.receivedAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4 gap-2">
        <CardHeader>
          <CardTitle>Products ({p.products.length})</CardTitle>
          <CardDescription>Loaded from this producer's 832 catalogs</CardDescription>
        </CardHeader>
        <CardContent className="px-3">
          {p.products.length === 0 ? (
            <EmptyState title="No products yet" description="The catalog fills up when this producer sends an 832 Price/Sales Catalog." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>UPC</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Sell</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.products.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell><Link to={`/inventory/${x.id}`} className="font-medium hover:underline">{x.name}</Link></TableCell>
                    <TableCell className="font-mono text-xs">{x.sku}</TableCell>
                    <TableCell className="font-mono text-xs">{x.upc}</TableCell>
                    <TableCell>{x.category}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(x.unitCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(x.sellPrice)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', x.quantityOnHand <= 0 && 'text-destructive')}>{x.quantityOnHand} {x.uom}</TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs">{fmt.ago(x.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
