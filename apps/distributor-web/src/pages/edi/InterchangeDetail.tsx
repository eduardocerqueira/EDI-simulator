import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileText, HardDrive, Info, Server, XCircle } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { ACK_LABEL, statusVariant } from '@/lib/status';
import type { Acknowledgment, ApiDelivery, DescribedSegment, ProcessingEvent, X12Issue } from '@/lib/types';
import { EmptyState, ErrorState, Fields, LoadingPage, Mono, PageHeader, StatusBadge } from '@/components/common';
import { EnvelopeDiagram } from '@/components/x12/EnvelopeDiagram';
import { SegmentViewer } from '@/components/x12/SegmentViewer';
import { RawX12 } from '@/components/x12/RawX12';
import { IssuesTable } from '@/components/x12/IssuesTable';
import { Timeline } from '@/components/x12/Timeline';
import { DeliveryList } from '@/components/x12/Deliveries';

export interface InterchangeDetail {
  id: string;
  status: string;
  senderQualifier: string;
  senderId: string;
  receiverQualifier: string;
  receiverId: string;
  controlNumber: string;
  interchangeDate: string;
  interchangeTime: string;
  version: string;
  usageIndicator: string;
  ackRequested: string;
  elementSeparator: string;
  componentSeparator: string;
  segmentTerminator: string;
  isaLength: number | null;
  declaredGroupCount: string | null;
  trailerControlNumber: string | null;
  groupCount: number;
  transactionCount: number;
  acceptedCount: number;
  segmentCount: number;
  errorCount: number;
  ta1AckCode: string | null;
  ta1NoteCode: string | null;
  ta1Description?: string;
  processingMs: number | null;
  receivedAt: string;
  processedAt: string | null;
  partner: { id: string; name: string; isaId: string; code: string; ftpUser: string } | null;
  fileTransfer: {
    id: string;
    fileName: string;
    remotePath: string;
    archivePath: string | null;
    sizeBytes: number;
    sha256: string | null;
    status: string;
    attempts: number;
    protocol: string;
    content: string | null;
    discoveredAt: string;
    transferredAt: string | null;
    processedAt: string | null;
  };
  groups: Array<{
    id: string;
    index: number;
    functionalId: string;
    senderCode: string;
    receiverCode: string;
    date: string;
    time: string;
    controlNumber: string;
    version: string;
    declaredTransactionCount: string | null;
    transactionCount: number;
    acceptedCount: number;
    ackCode: string;
    ak9Codes: string[];
    transactions: Array<{ id: string; type: string; typeName: string | null; controlNumber: string; status: string; ackCode: string | null; ak5Codes: string[]; segmentCount: number; itemCount: number; errorCount: number }>;
  }>;
  issues: X12Issue[];
  timeline: ProcessingEvent[];
  acknowledgments: Acknowledgment[];
  deliveries: ApiDelivery[];
  segments: DescribedSegment[];
}

function Verdict({ ic }: { ic: InterchangeDetail }) {
  const cfg = {
    ACCEPTED: { icon: CheckCircle2, cls: 'border-success/40 bg-success/8 text-success', text: 'All transaction sets were accepted, ingested into inventory and queued for the order app.' },
    PARTIALLY_ACCEPTED: { icon: AlertTriangle, cls: 'border-warning/50 bg-warning/10 text-[oklch(0.5_0.12_70)] dark:text-warning', text: 'Some transaction sets were rejected; the rest were ingested. See Validation.' },
    REJECTED: { icon: XCircle, cls: 'border-destructive/40 bg-destructive/8 text-destructive', text: ic.ta1AckCode === 'R' ? `The envelope itself was rejected (TA1 R / ${ic.ta1NoteCode}: ${ic.ta1Description ?? ''}). Nothing inside was processed.` : 'No transaction set could be ingested. See Validation for the reasons.' },
    ERROR: { icon: XCircle, cls: 'border-destructive/40 bg-destructive/8 text-destructive', text: 'An unexpected processing error occurred. See the timeline.' },
    RECEIVED: { icon: Info, cls: 'border-info/40 bg-info/8 text-info', text: 'Processing…' },
  }[ic.status] ?? { icon: Info, cls: '', text: '' };
  const Icon = cfg.icon;
  return (
    <div className={cn('flex items-start gap-3 rounded-none border p-4', cfg.cls)}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm">
        <div className="font-semibold">{ic.status.replace('_', ' ')}</div>
        <div className="text-foreground/80">{cfg.text}</div>
      </div>
    </div>
  );
}

export function InterchangeDetailPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ['interchange', id],
    queryFn: () => api<InterchangeDetail>(`/interchanges/${id}`),
    refetchInterval: (query) => {
      const d = query.state.data;
      const busy = d && (d.status === 'RECEIVED' || d.acknowledgments.some((a) => a.status !== 'SENT') || d.deliveries.some((x) => x.status === 'PENDING' || x.status === 'RETRYING'));
      return busy ? 3000 : false;
    },
  });
  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const ic = q.data!;
  const ft = ic.fileTransfer;

  return (
    <>
      <PageHeader
        back={{ to: '/edi/interchanges', label: 'Interchanges' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Interchange <Mono className="text-xl">{ic.controlNumber || '(unreadable)'}</Mono>
            <StatusBadge status={ic.status} />
            {ic.ta1AckCode && (
              <Badge variant={statusVariant(ic.ta1AckCode)} className="font-mono" title={ic.ta1Description}>
                TA1 {ic.ta1AckCode} · {ic.ta1NoteCode}
              </Badge>
            )}
          </span>
        }
        description={
          <>
            From <Link className="text-primary hover:underline" to={`/partners/${ic.partner?.id}`}>{ic.partner?.name}</Link> ({ic.senderQualifier}:{ic.senderId || ic.partner?.isaId}) to {ic.receiverQualifier}:{ic.receiverId} ·{' '}
            {ic.groupCount} group(s), {ic.transactionCount} transaction set(s), {ic.segmentCount} segments · received {fmt.dateTime(ic.receivedAt)}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Verdict ic={ic} />
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><Server className="size-4" /> FTP file transfer</CardTitle>
              <CardDescription>How this envelope arrived</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Fields
                cols={1}
                items={[
                  ['File', <Mono>{ft.fileName}</Mono>],
                  ['Picked up from', <Mono className="text-xs">{ft.remotePath}</Mono>],
                  ['Archived to', <Mono className="text-xs">{ft.archivePath ?? '—'}</Mono>],
                ]}
              />
              <Fields
                items={[
                  ['Protocol', ft.protocol],
                  ['Transfer status', <StatusBadge status={ft.status} />],
                  ['Size', fmt.bytes(ft.sizeBytes)],
                  ['Download attempts', ft.attempts],
                  ['Discovered', fmt.dateTime(ft.discoveredAt)],
                  ['Downloaded', fmt.dateTime(ft.transferredAt)],
                  ['Processed', fmt.dateTime(ic.processedAt)],
                  ['Processing time', fmt.ms(ic.processingMs)],
                ]}
              />
              <div>
                <div className="text-muted-foreground text-xs">SHA-256</div>
                <Mono className="block text-[11px] break-all">{ft.sha256 ?? '—'}</Mono>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><HardDrive className="size-4" /> Envelope facts</CardTitle>
            </CardHeader>
            <CardContent>
              <Fields
                items={[
                  ['ISA length', <span className={cn(ic.isaLength !== 106 && 'text-destructive')}>{ic.isaLength ?? '—'} {ic.isaLength === 106 ? '✓' : '(must be 106)'}</span>],
                  ['Delimiters', <Mono>{`${ic.elementSeparator} ${ic.componentSeparator} ${ic.segmentTerminator}`}</Mono>],
                  ['Usage', ic.usageIndicator === 'P' ? 'Production' : ic.usageIndicator === 'T' ? 'Test' : ic.usageIndicator || '—'],
                  ['TA1 requested', ic.ackRequested === '1' ? 'Yes (ISA14=1)' : 'No'],
                  ['Accepted sets', `${ic.acceptedCount} / ${ic.transactionCount}`],
                  ['Issues', ic.errorCount],
                ]}
              />
            </CardContent>
          </Card>
        </div>
        <Card className="gap-4 lg:col-span-2">
          <CardHeader>
            <CardTitle>Envelope structure</CardTitle>
            <CardDescription>ISA/IEA → GS/GE → ST/SE. Hover a field for its meaning; click a transaction set to open it.</CardDescription>
          </CardHeader>
          <CardContent>
            <EnvelopeDiagram ic={ic} />
            {ic.groups.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {ic.groups.flatMap((g) => g.transactions).map((t) => (
                  <Link key={t.id} to={`/edi/transactions/${t.id}`} className="hover:bg-muted inline-flex items-center gap-2 rounded-none border px-3 py-1.5 text-sm">
                    <FileText className="size-4" /> {t.type} #{t.controlNumber} <StatusBadge status={t.status} /> <ArrowRight className="size-3.5" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="segments" className="mt-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="raw">Raw X12</TabsTrigger>
          <TabsTrigger value="validation">
            Validation {ic.issues.length > 0 && <Badge variant="destructive" className="ml-1">{ic.issues.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="acks">Acknowledgments ({ic.acknowledgments.length})</TabsTrigger>
          <TabsTrigger value="deliveries">REST deliveries ({ic.deliveries.length})</TabsTrigger>
        </TabsList>
        <Card className="mt-2 py-4">
          <CardContent className="px-4">
            <TabsContent value="segments">
              <p className="text-muted-foreground mb-3 text-sm">Click any segment to see each element: its position (e.g. ISA06), dictionary reference, name, value and code meaning. Segments with errors are expanded.</p>
              <SegmentViewer segments={ic.segments} />
            </TabsContent>
            <TabsContent value="raw">
              <RawX12 content={ft.content} elementSep={ic.elementSeparator || '*'} segmentTerm={ic.segmentTerminator || '~'} />
            </TabsContent>
            <TabsContent value="validation">
              <IssuesTable issues={ic.issues} />
            </TabsContent>
            <TabsContent value="timeline">
              <Timeline events={ic.timeline} />
            </TabsContent>
            <TabsContent value="acks">
              <AckList acks={ic.acknowledgments} />
            </TabsContent>
            <TabsContent value="deliveries">
              <DeliveryList deliveries={ic.deliveries} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </>
  );
}

export function AckList({ acks }: { acks: Acknowledgment[] }) {
  if (!acks.length) return <EmptyState title="No acknowledgments" description="TA1 is sent when the envelope is rejected or ISA14=1; a 997 is sent per functional group when the envelope is readable." />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {acks.map((a) => (
        <Card key={a.id} className="gap-3">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Download className="size-4" /> {a.type === 'TA1' ? 'TA1 Interchange Acknowledgment' : '997 Functional Acknowledgment'}
              <Badge variant={statusVariant(a.ackCode.length === 1 ? a.ackCode : a.ackCode.includes('R') ? 'R' : 'A')} className="font-mono">
                {a.ackCode} {a.ackCode.length === 1 ? `· ${ACK_LABEL[a.ackCode] ?? ''}` : ''}
              </Badge>
              <StatusBadge status={a.status} />
            </CardTitle>
            <CardDescription>
              <Mono className="text-xs">{a.remotePath}</Mono> · ICN {a.controlNumber} · {a.sentAt ? `sent ${fmt.dateTime(a.sentAt)}` : `attempts ${a.attempts}`}
              {a.lastError && <span className="text-destructive"> · {a.lastError}</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RawX12 content={a.content} maxHeight="max-h-[320px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
