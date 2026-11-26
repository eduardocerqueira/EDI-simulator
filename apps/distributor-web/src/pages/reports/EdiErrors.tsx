import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, FileWarning, Percent, Send, XCircle } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Progress } from '@edi/ui/components/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { ProducerDrillDrawer } from '@/components/actions/ProducerDrillDrawer';
import { ReportComposer, type ComposerTarget } from '@/components/actions/ReportComposer';
import { BrandLogo } from '@/components/BrandLogo';
import { DonutChart, VBarChart } from '@/components/charts';
import { EmptyState, ErrorState, LoadingRows, StatCard } from '@/components/common';
import { AckCodeBadge } from '@/components/x12/IssuesTable';
import { LAYER } from '@/lib/actions';
import { api, qs } from '@/lib/api';
import { fmt } from '@/lib/format';

export interface ErrorFilters {
  days: string;
  partnerId: string;
  type: string;
  layer: string;
  code: string;
}

interface ErrorReport {
  days: number;
  granularity: 'hour' | 'day';
  totals: { interchanges: number; rejectedInterchanges: number; transactions: number; rejectedTransactions: number; issues: number; openItems: number; errorRate: number | null };
  byPartner: Array<{
    id: string;
    name: string;
    isaId: string;
    specialty: string | null;
    interchanges: number;
    rejectedInterchanges: number;
    transactions: number;
    rejectedTransactions: number;
    syntaxRejected: number;
    businessRejected: number;
    errorRate: number | null;
    issues: number;
    topCode: { code: string; count: number } | null;
    openItems: number;
  }>;
  byCode: Array<{ code: string; x12Code: string | null; source: string; meaning: string | null; layer: string; count: number; producers: number }>;
  byLayer: Array<{ layer: string; count: number }>;
  daily: Array<{ day: string; accepted: number; envelope: number; syntax: number; business: number }>;
}

const rateColor = (r: number | null) => (r === null ? 'bg-muted-foreground' : r > 0.3 ? 'bg-destructive' : r > 0.1 ? 'bg-warning' : 'bg-success');

/** Reports → EDI errors: where EDI is failing, for whom, and why — with drill-down and report-to-producer. */
export function EdiErrorsReport({ filters, setFilter }: { filters: ErrorFilters; setFilter: (patch: Partial<ErrorFilters>) => void }) {
  const [drill, setDrill] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const q = useQuery({
    queryKey: ['edi-errors', filters],
    queryFn: () => api<ErrorReport>(`/edi/errors${qs({ ...filters })}`),
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <LoadingRows rows={10} />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data!;
  const t = d.totals;
  const xFmt = (v: unknown) => (d.granularity === 'hour' ? new Date(String(v)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : fmt.date(String(v)).replace(/, \d{4}$/, ''));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Error rate" value={fmt.pct(t.errorRate)} icon={Percent} tone={(t.errorRate ?? 0) > 0.2 ? 'destructive' : (t.errorRate ?? 0) > 0.05 ? 'warning' : 'success'} hint="rejected ÷ received transaction sets" />
        <StatCard label="Rejected interchanges" value={fmt.num(t.rejectedInterchanges)} icon={XCircle} tone="destructive" hint={`of ${fmt.num(t.interchanges)} received`} />
        <StatCard label="Rejected transaction sets" value={fmt.num(t.rejectedTransactions)} icon={FileWarning} tone="warning" hint={`of ${fmt.num(t.transactions)}`} />
        <StatCard label="Validation issues" value={fmt.num(t.issues)} icon={AlertTriangle} tone="info" hint={`${d.byCode.length} distinct error codes`} />
        <StatCard label="Open action items" value={fmt.num(t.openItems)} icon={ClipboardList} tone={t.openItems ? 'destructive' : 'success'} hint="backlog to follow up" to="/edi/action-items" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="gap-2 xl:col-span-2">
          <CardHeader>
            <CardTitle>Accepted vs rejected transaction sets</CardTitle>
            <CardDescription>Per {d.granularity}, rejections split by the layer that failed</CardDescription>
          </CardHeader>
          <CardContent>
            <VBarChart
              data={d.daily}
              xKey="day"
              stacked
              animate={false}
              xFormatter={xFmt}
              config={{
                accepted: { label: 'Accepted', color: 'var(--chart-1)' },
                envelope: { label: 'Envelope', color: LAYER.ENVELOPE!.color },
                syntax: { label: 'Syntax', color: LAYER.SYNTAX!.color },
                business: { label: 'Business', color: LAYER.BUSINESS!.color },
              }}
            />
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle>Issues by layer</CardTitle>
            <CardDescription>Click a layer to filter</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={d.byLayer.map((l) => ({ layer: LAYER[l.layer]?.label ?? l.layer, count: l.count }))}
              nameKey="layer"
              valueKey="count"
              colors={d.byLayer.map((l) => LAYER[l.layer]?.color ?? 'var(--muted-foreground)')}
              center={{ value: fmt.num(t.issues), label: 'issues' }}
              legend={false}
            />
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {d.byLayer.map((l) => (
                <button key={l.layer} onClick={() => setFilter({ layer: filters.layer === l.layer ? '' : l.layer })} className="cursor-pointer" title={LAYER[l.layer]?.help}>
                  <Badge variant={filters.layer === l.layer ? 'default' : 'outline'}>
                    <span className="size-2 rounded-none" style={{ background: LAYER[l.layer]?.color }} />
                    {LAYER[l.layer]?.label} {l.count}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Errors by producer</CardTitle>
          <CardDescription>Worst error rate first. Click a producer to drill down, or report its open failures straight away.</CardDescription>
        </CardHeader>
        {!d.byPartner.length ? (
          <EmptyState title="No producers match" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producer</TableHead>
                <TableHead className="text-right">Interchanges</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Syntax / business</TableHead>
                <TableHead className="w-40">Error rate</TableHead>
                <TableHead>Top error</TableHead>
                <TableHead className="text-right">Open items</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.byPartner.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setDrill(p.id)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <BrandLogo name={p.name} kind="producer" hint={p.specialty} size="sm" />
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-muted-foreground font-mono text-[11px]">ZZ:{p.isaId}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.num(p.interchanges)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', p.rejectedInterchanges && 'text-destructive font-medium')}>{fmt.num(p.rejectedInterchanges)}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {p.syntaxRejected} / {p.businessRejected}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={(p.errorRate ?? 0) * 100} className="h-1.5" indicatorClassName={rateColor(p.errorRate)} />
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{fmt.pct(p.errorRate)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.topCode ? (
                      <button
                        className="cursor-pointer font-mono text-xs hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilter({ code: p.topCode!.code });
                        }}
                      >
                        {p.topCode.code} <span className="text-muted-foreground">×{p.topCode.count}</span>
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.openItems ? (
                      <Link to={`/edi/action-items?partnerId=${p.id}`} onClick={(e) => e.stopPropagation()}>
                        <Badge variant="destructive">{p.openItems}</Badge>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!p.openItems}
                      onClick={(e) => {
                        e.stopPropagation();
                        setComposer({ partnerId: p.id, days: Number(filters.days) || undefined });
                      }}
                    >
                      <Send /> Report
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Error codes</CardTitle>
          <CardDescription>What the validator found, with the X12 acknowledgment code the producer sees in its TA1 / 997. Click a code to filter the whole report.</CardDescription>
        </CardHeader>
        {!d.byCode.length ? (
          <EmptyState title="No errors in this period" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>X12 acknowledgment</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead className="text-right">Occurrences</TableHead>
                <TableHead className="text-right">Producers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.byCode.map((c) => (
                <TableRow key={`${c.code}-${c.x12Code}-${c.layer}`} className={cn('cursor-pointer', filters.code === c.code && 'bg-primary/[0.05]')} onClick={() => setFilter({ code: filters.code === c.code ? '' : c.code })}>
                  <TableCell className="font-mono text-xs font-medium">{c.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <AckCodeBadge source={c.source} code={c.x12Code} description={c.meaning} />
                      <span className="text-muted-foreground truncate text-xs">{c.meaning}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="size-2 rounded-none" style={{ background: LAYER[c.layer]?.color }} />
                      {LAYER[c.layer]?.label ?? c.layer}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.num(c.count)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.producers}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ProducerDrillDrawer
        partnerId={drill}
        filters={{ days: filters.days, type: filters.type, layer: filters.layer, code: filters.code }}
        onClose={() => setDrill(null)}
        onReport={(partnerId) => {
          setDrill(null);
          setComposer({ partnerId, days: Number(filters.days) || undefined });
        }}
      />
      <ReportComposer target={composer} onClose={() => setComposer(null)} />
    </div>
  );
}
