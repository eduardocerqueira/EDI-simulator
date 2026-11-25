import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, Clock, FileInput, Gauge, Hourglass, Send, ShoppingCart, Timer, Warehouse,
} from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Progress } from '@edi/ui/components/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import type { Kpis } from '@/lib/types';
import { statusVariant } from '@/lib/status';
import { EmptyState, ErrorState, LiveDot, LoadingPage, PageHeader, RangeSelect, StatCard, StatusBadge } from '@/components/common';
import { HBarChart, StackedAreaChart, bucketLabel } from '@/components/charts';

interface DashboardData {
  kpis: Kpis;
  recentInterchanges: Array<{
    id: string;
    controlNumber: string;
    status: string;
    receivedAt: string;
    ta1AckCode: string | null;
    partner: { name: string } | null;
    transactions: Array<{ type: string; status: string }>;
    fileTransfer: { fileName: string };
  }>;
  notifications: Array<{ id: string; severity: string; title: string; message: string; createdAt: string; interchangeId?: string | null; transactionId?: string | null }>;
  unreadNotifications: number;
}

export function DashboardPage() {
  const [hours, setHours] = useState(24);
  const q = useQuery({ queryKey: ['dashboard', hours], queryFn: () => api<DashboardData>(`/dashboard?hours=${hours}`), refetchInterval: 5000 });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const { kpis: k, recentInterchanges, notifications } = q.data!;
  const step = bucketLabel(k.range.stepMs);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live view of X12 traffic from 10 farm producers: FTP intake, validation, ingestion and delivery to the order app."
        actions={
          <>
            <LiveDot label="Refreshing every 5s" />
            <RangeSelect value={hours} onChange={setHours} />
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Files received" value={fmt.num(k.edi.filesReceived)} hint={`${fmt.bytes(k.edi.inboundBytes)} · ${k.edi.retriedDownloads} retried downloads`} icon={FileInput} to="/edi/files" />
        <StatCard
          label="Acceptance rate"
          value={fmt.pct(k.edi.acceptanceRate)}
          hint={`${fmt.num(k.edi.transactionsIngested)} of ${fmt.num(k.edi.transactions)} transaction sets ingested`}
          icon={CheckCircle2}
          tone={k.edi.acceptanceRate !== null && k.edi.acceptanceRate < 0.8 ? 'warning' : 'success'}
          help="Transaction sets that passed syntax + business validation and were ingested, divided by all received."
          to="/edi/transactions"
        />
        <StatCard
          label="First-pass yield"
          value={fmt.pct(k.edi.firstPassYield)}
          hint={`${k.edi.interchangesAccepted} accepted · ${k.edi.interchangesPartial} partial · ${k.edi.interchangesRejected} rejected`}
          icon={Gauge}
          tone="info"
          help="Interchanges (files) where every transaction set was accepted on the first try."
          to="/edi/interchanges"
        />
        <StatCard
          label="Processing time"
          value={fmt.ms(k.edi.avgProcessingMs)}
          hint={`p95 ${fmt.ms(k.edi.p95ProcessingMs)} · end-to-end ${fmt.ms(k.edi.avgEndToEndMs)}`}
          icon={Timer}
          help="Average time to parse, validate, map and ingest one interchange. End-to-end = file received → JSON delivered to the order app."
          to="/kpis"
        />
        <StatCard
          label="API delivery success"
          value={fmt.pct(k.delivery.successRate)}
          hint={`${k.delivery.backlog} in backlog · ${k.delivery.retries} retries · ${k.delivery.dead} dead`}
          icon={Send}
          tone={k.delivery.dead > 0 ? 'warning' : 'success'}
          to="/edi/deliveries"
        />
        <StatCard
          label="Validation errors"
          value={fmt.num(k.validation.byLevel.reduce((n, l) => n + l.count, 0))}
          hint={`${k.edi.transactionsSyntaxRejected} syntax · ${k.edi.transactionsBusinessRejected} business rejects`}
          icon={AlertTriangle}
          tone="destructive"
          to="/edi/validation"
        />
        <StatCard label="Revenue" value={fmt.money(k.orders.revenue)} hint={`${k.orders.orders} orders · ${fmt.pct(k.orders.cancellationRate)} cancelled`} icon={ShoppingCart} tone="info" to="/orders" />
        <StatCard
          label="Open receivables"
          value={fmt.money(k.orders.openAmount)}
          hint={`${k.orders.openBills} open · ${k.orders.overdueBills} overdue (${fmt.money(k.orders.overdueAmount)})`}
          icon={CircleDollarSign}
          tone={k.orders.overdueBills > 0 ? 'warning' : 'default'}
          to="/bills"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Interchanges over time</CardTitle>
            <CardDescription>Each FTP file is one ISA/IEA interchange</CardDescription>
          </CardHeader>
          <CardContent>
            <StackedAreaChart
              data={k.timeseries.interchanges}
              xKey="bucket"
              xFormatter={step}
              config={{
                accepted: { label: 'Accepted', color: 'var(--chart-1)' },
                partial: { label: 'Partial', color: 'var(--chart-2)' },
                rejected: { label: 'Rejected', color: 'var(--chart-3)' },
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top validation errors</CardTitle>
            <CardDescription>What producers get wrong most often</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/edi/validation">All <ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <HBarChart data={k.validation.topErrors.slice(0, 8)} labelKey="code" valueKey="count" color="var(--chart-3)" labelWidth={170} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Transaction sets</CardTitle>
            <CardDescription>ST/SE documents by outcome</CardDescription>
          </CardHeader>
          <CardContent>
            <StackedAreaChart
              data={k.timeseries.transactions}
              xKey="bucket"
              xFormatter={step}
              stacked={false}
              config={{
                ingested: { label: 'Ingested', color: 'var(--chart-1)' },
                delivered: { label: 'Delivered (REST)', color: 'var(--chart-4)' },
                businessRejected: { label: 'Business rejected', color: 'var(--chart-2)' },
                syntaxRejected: { label: 'Syntax rejected', color: 'var(--chart-3)' },
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By transaction type</CardTitle>
            <CardDescription>832 catalog · 846 inventory · 856 ASN</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {k.byType.map((t) => (
              <div key={t.type}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">
                    <span className="font-mono">{t.type}</span>{' '}
                    <span className="text-muted-foreground">{{ '832': 'Price/Sales Catalog', '846': 'Inventory Advice', '856': 'Ship Notice' }[t.type]}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">{t.total}</span>
                </div>
                <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                  {t.total > 0 && (
                    <>
                      <div className="bg-chart-1" style={{ width: `${(t.ingested / t.total) * 100}%` }} />
                      <div className="bg-chart-2" style={{ width: `${(t.businessRejected / t.total) * 100}%` }} />
                      <div className="bg-chart-3" style={{ width: `${(t.syntaxRejected / t.total) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 flex gap-3 text-xs">
                  <span>{t.ingested} ingested</span>
                  <span>{t.businessRejected} business</span>
                  <span>{t.syntaxRejected} syntax</span>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 border-t pt-4 text-center">
              <div>
                <Warehouse className="text-muted-foreground mx-auto size-4" />
                <div className="mt-1 font-semibold tabular-nums">{fmt.num(k.inventory.skus)}</div>
                <div className="text-muted-foreground text-xs">SKUs</div>
              </div>
              <div>
                <Hourglass className="text-muted-foreground mx-auto size-4" />
                <div className="mt-1 font-semibold tabular-nums">{fmt.num(k.inventory.lowStock)}</div>
                <div className="text-muted-foreground text-xs">Low stock</div>
              </div>
              <div>
                <CircleDollarSign className="text-muted-foreground mx-auto size-4" />
                <div className="mt-1 font-semibold tabular-nums">{fmt.moneyCompact(k.inventory.stockValueCost)}</div>
                <div className="text-muted-foreground text-xs">Stock value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="gap-2 xl:col-span-3">
          <CardHeader>
            <CardTitle>Recent interchanges</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/edi/interchanges">View all <ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-3">
            {recentInterchanges.length === 0 ? (
              <EmptyState title="No files received yet" description="Run the producer simulator: npm run sim:producers -- --bootstrap --count 20" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ICN</TableHead>
                    <TableHead>Producer</TableHead>
                    <TableHead>Sets</TableHead>
                    <TableHead>TA1</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInterchanges.map((ic) => (
                    <TableRow key={ic.id} className="cursor-pointer">
                      <TableCell>
                        <Link to={`/edi/interchanges/${ic.id}`} className="text-primary font-mono text-xs hover:underline">
                          {ic.controlNumber || '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">{ic.partner?.name}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {ic.transactions.map((t, i) => (
                            <Badge key={i} variant={statusVariant(t.status)} className="font-mono">{t.type}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{ic.ta1AckCode && <Badge variant={statusVariant(ic.ta1AckCode)}>{ic.ta1AckCode}</Badge>}</TableCell>
                      <TableCell>
                        <StatusBadge status={ic.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs">{fmt.ago(ic.receivedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="gap-2 xl:col-span-2">
          <CardHeader>
            <CardTitle>Latest notifications</CardTitle>
            <CardDescription>Delivered through RabbitMQ</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/notifications">All <ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {notifications.length === 0 && <EmptyState title="No notifications" />}
            {notifications.map((n) => (
              <Link
                key={n.id}
                to={n.transactionId ? `/edi/transactions/${n.transactionId}` : n.interchangeId ? `/edi/interchanges/${n.interchangeId}` : '/notifications'}
                className="hover:bg-muted/60 flex gap-3 rounded-md p-2"
              >
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', {
                    ERROR: 'bg-destructive',
                    WARNING: 'bg-warning',
                    INFO: 'bg-info',
                  }[n.severity] ?? 'bg-muted-foreground')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{n.title}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs font-normal">{fmt.ago(n.createdAt)}</span>
                  </div>
                  <div className="text-muted-foreground line-clamp-2 text-xs">{n.message}</div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 gap-2">
        <CardHeader>
          <CardTitle>Producer scorecard</CardTitle>
          <CardDescription>Acceptance rate per trading partner in the selected range</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link to="/partners">Producers <ArrowRight /></Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producer</TableHead>
                <TableHead>ISA ID</TableHead>
                <TableHead className="text-right">Interchanges</TableHead>
                <TableHead className="text-right">Sets</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="w-[220px]">Acceptance</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {k.partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to={`/partners/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.isaId}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.interchanges}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.transactions}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.errors}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={(p.acceptanceRate ?? 0) * 100}
                        indicatorClassName={cn((p.acceptanceRate ?? 1) < 0.7 ? 'bg-destructive' : (p.acceptanceRate ?? 1) < 0.9 ? 'bg-warning' : 'bg-success')}
                      />
                      <span className="w-12 text-right text-xs tabular-nums">{fmt.pct(p.acceptanceRate, 0)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {fmt.ago(p.lastSeenAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
