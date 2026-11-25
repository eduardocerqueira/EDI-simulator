import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowRight, Boxes, FileJson, Loader2, RotateCw } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { toast } from '@edi/ui/components/sonner';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { statusVariant, TYPE_NAMES } from '@/lib/status';
import type { ApiDelivery, DescribedSegment, ProcessingEvent, X12Issue } from '@/lib/types';
import { EmptyState, ErrorState, Fields, JsonView, LoadingPage, Mono, PageHeader, StatusBadge } from '@/components/common';
import { SegmentViewer } from '@/components/x12/SegmentViewer';
import { RawX12 } from '@/components/x12/RawX12';
import { IssuesTable } from '@/components/x12/IssuesTable';
import { Timeline } from '@/components/x12/Timeline';
import { DeliveryCard } from '@/components/x12/Deliveries';

interface TxDetail {
  id: string;
  type: string;
  typeName: string | null;
  controlNumber: string;
  status: string;
  ackCode: string | null;
  ak5Codes: string[];
  ak5Descriptions: Array<{ code: string; description?: string }>;
  segmentCount: number;
  declaredSegmentCount: string | null;
  itemCount: number;
  errorCount: number;
  raw: string;
  x12Json: any;
  normalizedJson: any;
  receivedAt: string;
  validatedAt: string | null;
  ingestedAt: string | null;
  deliveredAt: string | null;
  partner: { id: string; name: string; isaId: string; code: string } | null;
  interchange: {
    id: string;
    controlNumber: string;
    senderId: string;
    elementSeparator: string;
    segmentTerminator: string;
    receivedAt: string;
    fileTransfer: { id: string; fileName: string; remotePath: string; archivePath: string | null; transferredAt: string | null; sizeBytes: number; sha256: string | null };
  };
  group: { id: string; functionalId: string; controlNumber: string; ackCode: string; ak9Codes: string[] };
  issues: X12Issue[];
  events: ProcessingEvent[];
  deliveries: ApiDelivery[];
  movements: Array<{
    id: string;
    type: string;
    quantityDelta: number;
    quantityAfter: number;
    unitCost: number | null;
    note: string | null;
    createdAt: string;
    product: { id: string; name: string; upc: string; sku: string; uom: string };
  }>;
  segments: DescribedSegment[];
}

const STAGES = [
  { key: 'received', label: 'Received (FTP)' },
  { key: 'syntax', label: 'Syntax (997)' },
  { key: 'business', label: 'Business rules' },
  { key: 'ingested', label: 'Ingested' },
  { key: 'delivered', label: 'Delivered (REST)' },
];

function Pipeline({ t }: { t: TxDetail }) {
  const s = t.status;
  const state = (k: string): 'done' | 'fail' | 'pending' | 'skip' => {
    switch (k) {
      case 'received':
        return 'done';
      case 'syntax':
        return s === 'SYNTAX_REJECTED' || s === 'ENVELOPE_REJECTED' ? 'fail' : 'done';
      case 'business':
        return s === 'BUSINESS_REJECTED' ? 'fail' : ['SYNTAX_REJECTED', 'ENVELOPE_REJECTED'].includes(s) ? 'skip' : 'done';
      case 'ingested':
        return ['INGESTED', 'DELIVERED', 'DELIVERY_FAILED'].includes(s) ? 'done' : 'skip';
      case 'delivered':
        return s === 'DELIVERED' ? 'done' : s === 'DELIVERY_FAILED' ? 'fail' : s === 'INGESTED' ? 'pending' : 'skip';
    }
    return 'skip';
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {STAGES.map((st, i) => {
        const v = state(st.key);
        return (
          <div key={st.key} className="flex items-center gap-1">
            <div
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                v === 'done' && 'border-success/40 bg-success/10 text-success',
                v === 'fail' && 'border-destructive/40 bg-destructive/10 text-destructive',
                v === 'pending' && 'border-warning/50 bg-warning/15 animate-pulse',
                v === 'skip' && 'text-muted-foreground border-dashed',
              )}
            >
              {st.label}
            </div>
            {i < STAGES.length - 1 && <ArrowRight className="text-muted-foreground size-3.5" />}
          </div>
        );
      })}
    </div>
  );
}

export function TransactionDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api<TxDetail>(`/transactions/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'INGESTED' || query.state.data?.deliveries.some((d) => d.status === 'RETRYING') ? 3000 : false),
  });
  const redeliver = useMutation({
    mutationFn: () => api(`/transactions/${id}/redeliver`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Delivery re-queued');
      void qc.invalidateQueries({ queryKey: ['transaction', id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const t = q.data!;
  const delivery = t.deliveries[t.deliveries.length - 1];
  const relStart = t.segments[0]?.position;
  const sep = t.interchange.elementSeparator || '*';
  const term = t.interchange.segmentTerminator || '~';

  return (
    <>
      <PageHeader
        back={{ to: '/edi/transactions', label: 'Transaction sets' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Mono className="text-xl">{t.type}</Mono> {t.typeName ?? TYPE_NAMES[t.type]} <Mono className="text-muted-foreground text-xl">#{t.controlNumber}</Mono>
            <StatusBadge status={t.status} />
          </span>
        }
        description={
          <>
            From {t.partner?.name} in interchange{' '}
            <Link className="text-primary font-mono hover:underline" to={`/edi/interchanges/${t.interchange.id}`}>{t.interchange.controlNumber}</Link> · group {t.group.functionalId}/{t.group.controlNumber} · file{' '}
            <Mono className="text-xs">{t.interchange.fileTransfer.fileName}</Mono>
          </>
        }
        actions={
          delivery && (
            <Button variant="outline" onClick={() => redeliver.mutate()} disabled={redeliver.isPending}>
              {redeliver.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />} Redeliver to order app
            </Button>
          )
        }
      />
      <Card className="mb-4 gap-4">
        <CardContent className="space-y-4">
          <Pipeline t={t} />
          <Fields
            cols={4}
            items={[
              ['997 AK5', t.ackCode ? <Badge variant={statusVariant(t.ackCode)}>{t.ackCode}{t.ak5Codes.length ? ` · ${t.ak5Codes.join(', ')}` : ''}</Badge> : '—'],
              ['Segments (SE01 declared)', `${t.segmentCount} (${t.declaredSegmentCount ?? 'missing'})`],
              ['Items', t.itemCount],
              ['Issues', t.errorCount],
              ['Received', fmt.dateTime(t.receivedAt)],
              ['Validated', fmt.dateTime(t.validatedAt)],
              ['Ingested', fmt.dateTime(t.ingestedAt)],
              ['Delivered', fmt.dateTime(t.deliveredAt)],
            ]}
          />
          {t.ak5Descriptions.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {t.ak5Descriptions.map((d) => (
                <Badge key={d.code} variant="destructive" className="font-mono">AK5 {d.code}: {d.description}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="compare">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="compare"><ArrowLeftRight /> X12 ⇄ JSON</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="raw">Raw X12</TabsTrigger>
          <TabsTrigger value="x12json"><FileJson /> X12 JSON</TabsTrigger>
          <TabsTrigger value="normalized">Normalized JSON</TabsTrigger>
          <TabsTrigger value="payload">Payload → Order API</TabsTrigger>
          <TabsTrigger value="issues">Issues {t.issues.length > 0 && <Badge variant="destructive" className="ml-1">{t.issues.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="inventory"><Boxes /> Inventory ({t.movements.length})</TabsTrigger>
        </TabsList>
        <Card className="mt-2 py-4">
          <CardContent className="px-4">
            <TabsContent value="compare">
              <p className="text-muted-foreground mb-3 text-sm">
                Left: the transaction set as received. Right: the same data converted to structure-preserving JSON — each segment becomes a key (e.g. <Mono>BIA</Mono> → <Mono>beginningSegmentForInventoryInquiryAdvice</Mono>), each element a named field, and loops become arrays.
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-semibold">X12</div>
                  <RawX12 content={t.raw.split('\n').join('')} elementSep={sep} segmentTerm={term} maxHeight="max-h-[640px]" />
                </div>
                <div>
                  <div className="mb-2 text-sm font-semibold">JSON</div>
                  <JsonView value={t.x12Json?.message?.transactionSets?.[0] ?? t.x12Json} maxHeight="max-h-[640px]" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="segments">
              <p className="text-muted-foreground mb-3 text-sm">Positions are relative to ST (ST = 1), which is how the 997 AK3 segment reports errors.</p>
              <SegmentViewer segments={t.segments} relativeTo={relStart} />
            </TabsContent>
            <TabsContent value="raw">
              <RawX12 content={t.raw.split('\n').join('')} elementSep={sep} segmentTerm={term} />
            </TabsContent>
            <TabsContent value="x12json">
              <p className="text-muted-foreground mb-3 text-sm">Envelope metadata + the transaction set tree (the "X12 ⇄ JSON conversion").</p>
              <JsonView value={t.x12Json} />
            </TabsContent>
            <TabsContent value="normalized">
              <p className="text-muted-foreground mb-3 text-sm">Business-friendly document produced by the mapper (e.g. LIN03 → upc, CTP03 → unitPrice). This is what business rules and ingestion use.</p>
              <JsonView value={t.normalizedJson} />
            </TabsContent>
            <TabsContent value="payload">
              {delivery ? (
                <>
                  <p className="text-muted-foreground mb-3 text-sm">
                    JSON body POSTed to <Mono>{delivery.endpoint}</Mono> (idempotency key = transaction id). Quantities and sell prices are the distributor's values after ingestion.
                  </p>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-semibold">Request</div>
                      <JsonView value={{ deliveryId: delivery.id, ...delivery.payload }} />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold">Last response ({delivery.lastStatusCode ?? '—'})</div>
                      {delivery.responseBody ? <JsonView value={delivery.responseBody} /> : <EmptyState title="No response yet" />}
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState title="Not sent to the order app" description="Only transaction sets that pass syntax and business validation are ingested and delivered." />
              )}
            </TabsContent>
            <TabsContent value="issues">
              <IssuesTable issues={t.issues} />
            </TabsContent>
            <TabsContent value="timeline">
              <Timeline events={t.events} />
            </TabsContent>
            <TabsContent value="delivery">
              {t.deliveries.length ? (
                <div className="space-y-4">
                  {t.deliveries.map((d) => (
                    <DeliveryCard key={d.id} d={d} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No REST deliveries" />
              )}
            </TabsContent>
            <TabsContent value="inventory">
              {t.movements.length === 0 ? (
                <EmptyState icon={Boxes} title="No inventory changes" description="This transaction set did not change the inventory." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>UPC</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-right">Δ Qty</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {t.movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Link className="text-primary hover:underline" to={`/inventory/${m.product.id}`}>{m.product.name}</Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{m.product.upc}</TableCell>
                        <TableCell><Badge variant="outline">{m.type.replace(/_/g, ' ').toLowerCase()}</Badge></TableCell>
                        <TableCell className={cn('text-right tabular-nums', m.quantityDelta > 0 ? 'text-success' : m.quantityDelta < 0 ? 'text-destructive' : '')}>
                          {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.quantityAfter} {m.product.uom}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.unitCost != null ? fmt.money(m.unitCost) : '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{m.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
      <Card className="mt-4 gap-2">
        <CardHeader>
          <CardTitle className="text-sm">Source file</CardTitle>
          <CardDescription>Traceability back to the FTP transfer</CardDescription>
        </CardHeader>
        <CardContent>
          <Fields
            cols={4}
            items={[
              ['FTP path', <Mono className="text-xs">{t.interchange.fileTransfer.remotePath}</Mono>],
              ['Archive', <Mono className="text-xs">{t.interchange.fileTransfer.archivePath ?? '—'}</Mono>],
              ['Downloaded', fmt.dateTime(t.interchange.fileTransfer.transferredAt)],
              ['SHA-256', <Mono className="text-xs">{t.interchange.fileTransfer.sha256?.slice(0, 24)}…</Mono>],
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}
