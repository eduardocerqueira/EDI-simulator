import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, FolderInput, FolderOutput, MapPin } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Progress } from '@edi/ui/components/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { statusVariant } from '@/lib/status';
import { EmptyState, ErrorState, Fields, LoadingPage, Mono, PageHeader, StatusBadge } from '@/components/common';
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

export function PartnersPage() {
  const q = useQuery({ queryKey: ['partners'], queryFn: () => api<PartnerRow[]>('/partners'), refetchInterval: 10000 });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader title="Producers" description="The 10 farm producers (trading partners). Each one has an ISA sender ID and its own FTP mailbox; files arriving in a mailbox must carry that partner's ISA06." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.data!.map((p) => (
          <Link key={p.id} to={`/partners/${p.id}`}>
            <Card className="h-full gap-4 transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{p.name}</span>
                  <Badge variant="outline" className="font-mono">{p.code}</Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {p.city}, {p.state} · {p.specialty}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">ISA</span>
                  <Mono className="bg-muted rounded px-1.5 py-0.5">{p.isaQualifier}:{p.isaId}</Mono>
                  <span className="text-muted-foreground ml-auto flex items-center gap-1"><Clock className="size-3" /> {fmt.ago(p.lastSeenAt)}</span>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">Acceptance rate</span>
                    <span className="font-medium tabular-nums">{fmt.pct(p.acceptanceRate)}</span>
                  </div>
                  <Progress value={(p.acceptanceRate ?? 0) * 100} indicatorClassName={rateColor(p.acceptanceRate)} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Products', p.productCount],
                    ['Units', fmt.num(p.unitsOnHand)],
                    ['Files', p.interchanges],
                    ['Rejected', p.interchangesRejected],
                  ].map(([l, v]) => (
                    <div key={l as string} className="bg-muted/50 rounded-md py-2">
                      <div className="font-semibold tabular-nums">{v}</div>
                      <div className="text-muted-foreground text-[11px]">{l}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
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
      <PageHeader back={{ to: '/partners', label: 'Producers' }} title={p.name} description={`${p.specialty ?? ''} · ${p.city}, ${p.state}`} />
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
              <Link key={ic.id} to={`/edi/interchanges/${ic.id}`} className="hover:bg-muted/60 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
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
