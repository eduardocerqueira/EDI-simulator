import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ExternalLink } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Progress } from '@edi/ui/components/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import type { Kpis } from '@/lib/types';
import { ErrorState, LiveDot, LoadingPage, PageHeader, RangeSelect } from '@/components/common';
import { StackedAreaChart, bucketLabel } from '@/components/charts';

interface KpiDef {
  name: string;
  value: string;
  target?: string;
  ok?: boolean | null;
  definition: string;
  formula: string;
}

function KpiTile({ k }: { k: KpiDef }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium">{k.name}</div>
          {k.ok !== undefined && k.ok !== null && <Badge variant={k.ok ? 'success' : 'warning'}>{k.ok ? 'on target' : 'attention'}</Badge>}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
        {k.target && <div className="text-muted-foreground text-xs">Target {k.target}</div>}
        <p className="text-muted-foreground mt-2 text-xs">{k.definition}</p>
        <code className="bg-muted mt-2 block rounded px-2 py-1 font-mono text-[11px]">{k.formula}</code>
      </CardContent>
    </Card>
  );
}

export function KpisPage() {
  const [hours, setHours] = useState(24);
  const q = useQuery({ queryKey: ['kpis', hours], queryFn: () => api<Kpis>(`/kpis?hours=${hours}`), refetchInterval: 5000 });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ status: string; db: boolean; rabbitmq: boolean; time: string }>('/health'), refetchInterval: 10000 });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const k = q.data!;
  const e = k.edi;
  const groups: Array<{ title: string; items: KpiDef[] }> = [
    {
      title: 'EDI quality',
      items: [
        { name: 'Transaction acceptance rate', value: fmt.pct(e.acceptanceRate), target: '≥ 90%', ok: e.acceptanceRate === null ? null : e.acceptanceRate >= 0.9, definition: 'Share of received transaction sets that passed syntax and business validation and were ingested.', formula: 'ingested ÷ received transaction sets' },
        { name: 'First-pass yield', value: fmt.pct(e.firstPassYield), target: '≥ 85%', ok: e.firstPassYield === null ? null : e.firstPassYield >= 0.85, definition: 'Share of interchanges (files) fully accepted without any rejected transaction set.', formula: 'ACCEPTED interchanges ÷ all interchanges' },
        { name: 'Envelope rejections', value: fmt.num(e.interchangesRejected), definition: 'Interchanges rejected (TA1 R) or with no ingested transaction set.', formula: 'count(status = REJECTED)' },
        { name: 'Syntax vs business rejects', value: `${e.transactionsSyntaxRejected} / ${e.transactionsBusinessRejected}`, definition: 'Syntax rejects are reported to the partner in the 997; business rejects pass the 997 but fail distributor rules.', formula: 'SYNTAX_REJECTED / BUSINESS_REJECTED' },
      ],
    },
    {
      title: 'Latency',
      items: [
        { name: 'Processing time (avg)', value: fmt.ms(e.avgProcessingMs), target: '< 1 s', ok: e.avgProcessingMs === null ? null : e.avgProcessingMs < 1000, definition: 'Parse + validate + map + ingest + generate acks for one interchange.', formula: 'avg(processedAt − downloadedAt)' },
        { name: 'Processing time (p95)', value: fmt.ms(e.p95ProcessingMs), target: '< 2 s', ok: e.p95ProcessingMs === null ? null : e.p95ProcessingMs < 2000, definition: '95% of interchanges are processed faster than this.', formula: 'percentile_cont(0.95)' },
        { name: 'End-to-end latency (avg / p95)', value: `${fmt.ms(e.avgEndToEndMs)} / ${fmt.ms(e.p95EndToEndMs)}`, target: '< 10 s', ok: e.avgEndToEndMs === null ? null : e.avgEndToEndMs < 10000, definition: 'From file downloaded over FTP until the JSON is accepted by the order app.', formula: 'avg(deliveredAt − receivedAt)' },
        { name: 'Ack turnaround', value: fmt.ms(e.avgAckTurnaroundMs), target: '< 30 s', ok: e.avgAckTurnaroundMs === null ? null : e.avgAckTurnaroundMs < 30000, definition: 'How fast the partner gets its TA1/997 back in from_distributor/.', formula: 'avg(ack.sentAt − receivedAt)' },
      ],
    },
    {
      title: 'Integration & transport',
      items: [
        { name: 'Delivery success rate', value: fmt.pct(k.delivery.successRate), target: '≥ 99%', ok: k.delivery.successRate === null ? null : k.delivery.successRate >= 0.99, definition: 'REST deliveries to the order app that eventually succeeded (after retries).', formula: 'SUCCESS ÷ (SUCCESS + DEAD)' },
        { name: 'First-attempt success', value: fmt.pct(k.delivery.firstAttemptSuccessRate), definition: 'Deliveries that succeeded without any retry — shows transient failure pressure.', formula: '(SUCCESS − retried) ÷ total' },
        { name: 'Delivery backlog', value: fmt.num(k.delivery.backlog), target: '≈ 0', ok: k.delivery.backlog < 10, definition: 'Deliveries pending or waiting for a retry. A growing backlog means the order app is down or slow.', formula: 'count(PENDING | RETRYING)' },
        { name: 'Retries / dead letters', value: `${k.delivery.retries} / ${k.delivery.dead}`, definition: 'Total retry attempts and deliveries that exhausted all attempts.', formula: 'Σ(attempts − 1) / count(DEAD)' },
        { name: 'FTP files in / out', value: `${e.filesReceived} / ${e.filesSent}`, definition: 'Inbound X12 files downloaded vs outbound TA1/997 files uploaded.', formula: 'FileTransfer by direction' },
        { name: 'FTP download retries', value: `${e.retriedDownloads} retried · ${e.failedTransfers} failed`, definition: 'Files that needed more than one download attempt, and transfers that failed.', formula: 'attempts > 1' },
      ],
    },
  ];
  return (
    <>
      <PageHeader
        title="KPIs & Observability"
        description="Operational KPIs for the EDI gateway with their definitions. Every number is computed live from the traceability tables."
        actions={
          <>
            <LiveDot />
            <RangeSelect value={hours} onChange={setHours} />
          </>
        }
      />
      <Card className="mb-4 py-4">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 text-sm">
          <span className="flex items-center gap-2 font-medium"><Activity className="size-4" /> Health</span>
          <span className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', health.data?.db ? 'bg-success' : 'bg-destructive')} /> PostgreSQL</span>
          <span className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', health.data?.rabbitmq ? 'bg-success' : 'bg-destructive')} /> RabbitMQ</span>
          <span className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', e.filesReceived > 0 ? 'bg-success' : 'bg-muted-foreground')} /> FTP intake {e.filesReceived > 0 ? 'active' : 'idle'}</span>
          <span className="text-muted-foreground ml-auto flex flex-wrap items-center gap-3 text-xs">
            Prometheus metrics: <a className="text-primary inline-flex items-center gap-1 hover:underline" href="http://localhost:4000/metrics" target="_blank" rel="noreferrer">:4000/metrics <ExternalLink className="size-3" /></a>
            RabbitMQ UI: <a className="text-primary inline-flex items-center gap-1 hover:underline" href="http://localhost:15672" target="_blank" rel="noreferrer">:15672 <ExternalLink className="size-3" /></a>
          </span>
        </CardContent>
      </Card>
      {groups.map((g) => (
        <section key={g.title} className="mb-6">
          <h2 className="mb-3 text-base font-semibold">{g.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {g.items.map((i) => <KpiTile key={i.name} k={i} />)}
          </div>
        </section>
      ))}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Throughput</CardTitle><CardDescription>Interchanges per bucket</CardDescription></CardHeader>
          <CardContent>
            <StackedAreaChart data={k.timeseries.interchanges} xKey="bucket" xFormatter={bucketLabel(k.range.stepMs)} config={{ accepted: { label: 'Accepted', color: 'var(--chart-1)' }, partial: { label: 'Partial', color: 'var(--chart-2)' }, rejected: { label: 'Rejected', color: 'var(--chart-3)' } }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Delivery pipeline</CardTitle><CardDescription>Transaction sets ingested vs delivered over REST</CardDescription></CardHeader>
          <CardContent>
            <StackedAreaChart data={k.timeseries.transactions} xKey="bucket" stacked={false} xFormatter={bucketLabel(k.range.stepMs)} config={{ ingested: { label: 'Ingested', color: 'var(--chart-1)' }, delivered: { label: 'Delivered', color: 'var(--chart-4)' } }} />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4 gap-2">
        <CardHeader><CardTitle>Partner scorecard</CardTitle><CardDescription>Trading partner data quality</CardDescription></CardHeader>
        <CardContent className="px-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producer</TableHead>
                <TableHead className="text-right">Interchanges</TableHead>
                <TableHead className="text-right">Transaction sets</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Issues</TableHead>
                <TableHead className="w-[240px]">Acceptance rate</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...k.partners].sort((a, b) => (a.acceptanceRate ?? 2) - (b.acceptanceRate ?? 2)).map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link className="font-medium hover:underline" to={`/partners/${p.id}`}>{p.name}</Link> <span className="text-muted-foreground font-mono text-xs">{p.isaId}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{p.interchanges}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.transactions}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.accepted}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.errors}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={(p.acceptanceRate ?? 0) * 100} indicatorClassName={cn((p.acceptanceRate ?? 1) < 0.7 ? 'bg-destructive' : (p.acceptanceRate ?? 1) < 0.9 ? 'bg-warning' : 'bg-success')} />
                      <span className="w-12 text-right text-xs tabular-nums">{fmt.pct(p.acceptanceRate, 0)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs">{fmt.ago(p.lastSeenAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mt-4 gap-2">
        <CardHeader><CardTitle>Prometheus metrics</CardTitle><CardDescription>Scraped from GET /metrics (also available to the optional Prometheus service)</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            {[
              ['edi_files_received_total{partner}', 'Files downloaded from FTP'],
              ['edi_interchanges_total{partner,status}', 'Interchanges by final status'],
              ['edi_transactions_total{type,status}', 'Transaction sets by outcome'],
              ['edi_validation_errors_total{level,code}', 'Validation issues by code'],
              ['edi_processing_duration_seconds', 'Histogram of interchange processing time'],
              ['edi_delivery_attempts_total{result}', 'REST delivery attempts'],
              ['edi_acks_sent_total{type,code}', 'TA1 / 997 uploaded'],
              ['mq_messages_published_total{routing_key}', 'RabbitMQ publishes'],
            ].map(([m, d]) => (
              <div key={m} className="flex items-baseline gap-3 rounded-md border px-3 py-2">
                <code className="font-mono text-xs">{m}</code>
                <span className="text-muted-foreground ml-auto text-xs">{d}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
