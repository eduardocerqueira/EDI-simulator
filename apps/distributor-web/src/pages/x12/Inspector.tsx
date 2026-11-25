import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ScanSearch, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { Textarea } from '@edi/ui/components/textarea';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { statusVariant } from '@/lib/status';
import type { DescribedSegment, X12Issue } from '@/lib/types';
import { EmptyState, Fields, JsonView, Mono, PageHeader } from '@/components/common';
import { SegmentViewer } from '@/components/x12/SegmentViewer';
import { IssuesTable } from '@/components/x12/IssuesTable';
import { SAMPLE_BAD_ENVELOPE, SAMPLE_BROKEN_846, SAMPLE_VALID_846 } from './samples';

interface InspectResult {
  ok: boolean;
  summary: string;
  segments: DescribedSegment[];
  result: {
    ok: boolean;
    parseError?: { message: string; ta1Code: string; code: string };
    header?: Record<string, string>;
    isaLength?: number;
    issues: X12Issue[];
    ta1: { ackCode: string; noteCode: string };
    groups: Array<{
      index: number;
      functionalId: string;
      controlNumber: string;
      ackCode: string;
      ak9Codes: string[];
      issues: X12Issue[];
      transactions: Array<{ index: number; type: string; controlNumber: string; ackCode: string; ak5Codes: string[]; issues: X12Issue[] }>;
    }>;
  };
  documents: Array<{ groupIndex: number; transactionIndex: number; type: string; controlNumber: string; ackCode: string; x12Json: unknown; normalized: unknown }>;
}

export function InspectorPage() {
  const [content, setContent] = useState(SAMPLE_VALID_846);
  const inspect = useMutation({ mutationFn: (c: string) => api<InspectResult>('/x12/inspect', { method: 'POST', json: { content: c } }) });
  const r = inspect.data;
  const allIssues: X12Issue[] = r
    ? [...r.result.issues, ...r.result.groups.flatMap((g) => [...g.issues, ...g.transactions.flatMap((t) => t.issues)])]
    : [];
  const load = (s: string) => {
    setContent(s);
    inspect.mutate(s);
  };

  return (
    <>
      <PageHeader
        title="X12 Inspector"
        description="Paste any X12 interchange to see how the receiver reads it: delimiters, envelope, every segment and element annotated with the dictionary, all validation errors with the TA1/997 code they would produce, and the JSON conversion."
      />
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="gap-3 xl:col-span-2">
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Line breaks between segments are optional</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => load(SAMPLE_VALID_846)}>Sample: valid 846</Button>
              <Button size="sm" variant="outline" onClick={() => load(SAMPLE_BROKEN_846)}>Sample: broken 846</Button>
              <Button size="sm" variant="outline" onClick={() => load(SAMPLE_BAD_ENVELOPE)}>Sample: bad envelope</Button>
              <Button size="sm" variant="ghost" onClick={() => setContent('')}><Trash2 /> Clear</Button>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="min-h-[420px] font-mono text-xs leading-5"
              placeholder="ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *…~"
            />
            <Button className="w-full" onClick={() => inspect.mutate(content)} disabled={!content.trim() || inspect.isPending}>
              {inspect.isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />} Inspect
            </Button>
            {inspect.error && <p className="text-destructive text-sm">{(inspect.error as Error).message}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          {!r ? (
            <Card>
              <CardContent>
                <EmptyState icon={ScanSearch} title="Nothing inspected yet" description="Load a sample or paste your own interchange, then click Inspect." />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className={cn('flex items-start gap-3 rounded-lg border p-4', r.ok ? 'border-success/40 bg-success/8' : 'border-destructive/40 bg-destructive/8')}>
                {r.ok ? <CheckCircle2 className="text-success mt-0.5 size-5" /> : <XCircle className="text-destructive mt-0.5 size-5" />}
                <div className="text-sm">
                  <div className="font-semibold">{r.ok ? 'Valid interchange' : 'Problems found'}</div>
                  <div className="text-foreground/80">{r.summary}</div>
                </div>
              </div>
              {r.result.header && (
                <Card className="gap-3 py-4">
                  <CardContent className="px-4">
                    <Fields
                      cols={4}
                      items={[
                        ['Sender (ISA05:06)', <Mono>{r.result.header.senderQualifier}:{r.result.header.senderId}</Mono>],
                        ['Receiver (ISA07:08)', <Mono>{r.result.header.receiverQualifier}:{r.result.header.receiverId}</Mono>],
                        ['ICN (ISA13)', <Mono>{r.result.header.controlNumber}</Mono>],
                        ['ISA length', <span className={cn(r.result.isaLength !== 106 && 'text-destructive')}>{r.result.isaLength} / 106</span>],
                        ['TA1', <Badge variant={statusVariant(r.result.ta1.ackCode)}>{r.result.ta1.ackCode} · {r.result.ta1.noteCode}</Badge>],
                        ...r.result.groups.map((g) => [`Group ${g.functionalId} #${g.controlNumber} (AK9)`, <Badge variant={statusVariant(g.ackCode)}>{g.ackCode}{g.ak9Codes.length ? ` · ${g.ak9Codes.join(',')}` : ''}</Badge>] as [string, React.ReactNode]),
                        ...r.result.groups.flatMap((g) => g.transactions.map((t) => [`${t.type} #${t.controlNumber} (AK5)`, <Badge variant={statusVariant(t.ackCode)}>{t.ackCode}{t.ak5Codes.length ? ` · ${t.ak5Codes.join(',')}` : ''}</Badge>] as [string, React.ReactNode])),
                      ]}
                    />
                  </CardContent>
                </Card>
              )}
              <Tabs defaultValue="segments">
                <TabsList>
                  <TabsTrigger value="segments">Annotated segments</TabsTrigger>
                  <TabsTrigger value="issues">Issues {allIssues.length > 0 && <Badge variant="destructive" className="ml-1">{allIssues.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="json">JSON ({r.documents.length})</TabsTrigger>
                </TabsList>
                <Card className="mt-2 py-4">
                  <CardContent className="px-4">
                    <TabsContent value="segments"><SegmentViewer segments={r.segments} /></TabsContent>
                    <TabsContent value="issues"><IssuesTable issues={allIssues} /></TabsContent>
                    <TabsContent value="json">
                      {r.documents.length === 0 ? (
                        <EmptyState title="No transaction sets" />
                      ) : (
                        <div className="space-y-6">
                          {r.documents.map((d) => (
                            <div key={`${d.groupIndex}-${d.transactionIndex}`}>
                              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                {d.type} #{d.controlNumber} <Badge variant={statusVariant(d.ackCode)}>AK5 {d.ackCode}</Badge>
                              </div>
                              <div className="grid gap-4 2xl:grid-cols-2">
                                <div>
                                  <div className="text-muted-foreground mb-1 text-xs">X12 JSON (structure preserving)</div>
                                  <JsonView value={d.x12Json} maxHeight="max-h-[420px]" />
                                </div>
                                <div>
                                  <div className="text-muted-foreground mb-1 text-xs">Normalized business document</div>
                                  <JsonView value={d.normalized} maxHeight="max-h-[420px]" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </CardContent>
                </Card>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </>
  );
}
