import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, Mail, Send } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Input } from '@edi/ui/components/input';
import { toast } from '@edi/ui/components/sonner';
import { Textarea } from '@edi/ui/components/textarea';
import { BrandLogo } from '@/components/BrandLogo';
import { ErrorState, LoadingRows, Mono, NativeSelect, StatusBadge } from '@/components/common';
import { AckCodeBadge, LevelBadge } from '@/components/x12/IssuesTable';
import { api } from '@/lib/api';
import { aiLabel, EMAIL_STATUS, ITEM_STATUS, LAYER, PRIORITY, rptLabel, type HistoryEntry, type ItemStatus } from '@/lib/actions';
import { fmt } from '@/lib/format';

interface ItemDetail {
  id: string;
  number: number;
  kind: string;
  layer: string;
  title: string;
  errorCodes: string[];
  priority: string;
  status: ItemStatus;
  assignee: string | null;
  note: string | null;
  history: HistoryEntry[];
  occurredAt: string;
  partner: { id: string; name: string; isaId: string; specialty: string | null; contactName: string | null; contactEmail: string | null };
  interchange: {
    id: string;
    controlNumber: string;
    status: string;
    receivedAt: string;
    ta1AckCode: string | null;
    ta1NoteCode: string | null;
    fileTransfer: { id: string; fileName: string };
    transactions: Array<{ id: string; type: string; controlNumber: string; status: string; ackCode: string | null }>;
    issues: Array<{ id: string; level: string; code: string; x12Code: string | null; x12CodeSource: string; meaning: string | null; message: string; segmentId: string | null; segmentPosition: number | null; elementRef: string | null; badValue: string | null }>;
  };
  reports: Array<{ id: string; number: number; label: string; createdAt: string; emails: Array<{ id: string; direction: string; status: string; fromAddr: string; subject: string; createdAt: string; senderVerified: boolean }> }>;
}

const ACTION_LABEL: Record<string, string> = {
  created: 'Created',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  note: 'Note',
  comment: 'Comment',
  reported: 'Reported to producer',
  'producer-replied': 'Producer replied',
  'email-bounced': 'Report e-mail bounced',
  'email-complained': 'Report marked as spam',
};

export function ActionItemDrawer({ id, onClose, onReport, onOpenReport }: { id: string | null; onClose: () => void; onReport: (partnerId: string, itemIds: string[]) => void; onOpenReport: (reportId: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['action-items', 'detail', id], queryFn: () => api<ItemDetail>(`/action-items/${id}`), enabled: !!id, refetchInterval: 4000 });
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    setAssignee(q.data?.assignee ?? '');
    setNote(q.data?.note ?? '');
    // only when another item is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.id]);
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api(`/action-items/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items'] });
      setComment('');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const it = q.data;

  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{it ? aiLabel(it.number) : 'Action item'}</span>
            {it && <Badge variant={ITEM_STATUS[it.status]?.variant}>{ITEM_STATUS[it.status]?.label}</Badge>}
            {it && <Badge variant={PRIORITY[it.priority]?.variant}>{PRIORITY[it.priority]?.label} priority</Badge>}
          </DrawerTitle>
          <DrawerDescription>{it?.title ?? 'Loading…'}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-5">
          {q.isLoading ? (
            <LoadingRows rows={8} />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : it ? (
            <>
              <div className="flex items-center gap-3 rounded-none border p-3">
                <BrandLogo name={it.partner.name} kind="producer" hint={it.partner.specialty} size="md" />
                <div className="min-w-0 flex-1">
                  <Link to={`/partners/${it.partner.id}`} className="font-medium hover:underline">
                    {it.partner.name}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {it.partner.contactName} · <Mono>{it.partner.contactEmail}</Mono>
                  </div>
                </div>
                <Button size="sm" onClick={() => onReport(it.partner.id, [it.id])}>
                  <Send /> Report to producer
                </Button>
              </div>

              <section className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Status</span>
                  <NativeSelect
                    className="w-full"
                    value={it.status}
                    onChange={(v) => update.mutate({ status: v, comment: comment || undefined })}
                    options={Object.entries(ITEM_STATUS).map(([value, s]) => ({ value, label: s.label }))}
                  />
                  <span className="text-muted-foreground mt-1 block text-xs">{ITEM_STATUS[it.status]?.help}</span>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Priority</span>
                  <NativeSelect className="w-full" value={it.priority} onChange={(v) => update.mutate({ priority: v })} options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Assignee</span>
                  <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} onBlur={() => assignee !== (it.assignee ?? '') && update.mutate({ assignee })} placeholder="Who is on it?" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Layer</span>
                  <div className="flex h-9 items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-none" style={{ background: LAYER[it.layer]?.color }} />
                    {LAYER[it.layer]?.label ?? it.layer} <span className="text-muted-foreground truncate text-xs">— {LAYER[it.layer]?.help}</span>
                  </div>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">Internal note</span>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (it.note ?? '') && update.mutate({ note })} placeholder="Root cause, next step…" className="min-h-16" />
                </label>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Failed interchange</h3>
                <div className="space-y-2 rounded-none border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/edi/interchanges/${it.interchange.id}`} className="text-primary inline-flex items-center gap-1 font-mono hover:underline">
                      <Mail className="size-3.5" /> ICN {it.interchange.controlNumber || '(none)'}
                    </Link>
                    <StatusBadge status={it.interchange.status} />
                    {it.interchange.ta1AckCode && (
                      <Badge variant="outline" className="font-mono">
                        TA1 {it.interchange.ta1AckCode}
                        {it.interchange.ta1NoteCode ? ` ${it.interchange.ta1NoteCode}` : ''}
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-auto text-xs">{fmt.dateTime(it.interchange.receivedAt)}</span>
                  </div>
                  <div className="text-muted-foreground font-mono text-xs break-all">{it.interchange.fileTransfer.fileName}</div>
                  {it.interchange.transactions.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <ArrowRight className="text-muted-foreground size-3" />
                      <Link to={`/edi/transactions/${t.id}`} className="text-primary inline-flex items-center gap-1 font-mono hover:underline">
                        <FileText className="size-3" /> {t.type} #{t.controlNumber}
                      </Link>
                      <StatusBadge status={t.status} />
                      {t.ackCode && <span className="text-muted-foreground">997 AK5 {t.ackCode}</span>}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Issues ({it.interchange.issues.length})</h3>
                <ul className="divide-y rounded-none border">
                  {it.interchange.issues.map((i) => (
                    <li key={i.id} className="space-y-1 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <LevelBadge level={i.level} />
                        <span className="font-mono text-xs font-medium">{i.code}</span>
                        <AckCodeBadge source={i.x12CodeSource} code={i.x12Code} description={i.meaning} />
                        {i.segmentId && (
                          <span className="text-muted-foreground ml-auto font-mono text-xs">
                            {i.segmentId}
                            {i.segmentPosition ? ` · seg ${i.segmentPosition}` : ''}
                            {i.elementRef ? ` · ${i.elementRef}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {i.message}
                        {i.badValue ? (
                          <>
                            {' '}
                            · value <Mono>{JSON.stringify(i.badValue)}</Mono>
                          </>
                        ) : null}
                      </p>
                    </li>
                  ))}
                  {!it.interchange.issues.length && <li className="text-muted-foreground px-3 py-2 text-sm">No validation issues recorded (processing error).</li>}
                </ul>
              </section>

              {!!it.reports.length && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Reports</h3>
                  <ul className="divide-y rounded-none border text-sm">
                    {it.reports.map((r) => (
                      <li key={r.id}>
                        <button className="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left" onClick={() => onOpenReport(r.id)}>
                          <span className="font-mono">{rptLabel(r.number)}</span>
                          <span className="text-muted-foreground text-xs">{fmt.ago(r.createdAt)}</span>
                          <span className="ml-auto flex gap-1">
                            {r.emails.map((e) => (
                              <Badge key={e.id} variant={EMAIL_STATUS[e.status]?.variant ?? 'outline'}>
                                {e.direction === 'INBOUND' ? 'reply · ' : ''}
                                {EMAIL_STATUS[e.status]?.label ?? e.status}
                              </Badge>
                            ))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold">History</h3>
                <ol className="relative space-y-3 border-l pl-4">
                  {[...it.history].reverse().map((h, i) => (
                    <li key={i} className="text-sm">
                      <span className="bg-border absolute -left-[5px] mt-1.5 size-2.5 rounded-none" />
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                        {h.from && h.to && (
                          <span className="text-muted-foreground text-xs">
                            {(ITEM_STATUS[h.from as ItemStatus]?.label ?? h.from).toString()} → {(ITEM_STATUS[h.to as ItemStatus]?.label ?? h.to).toString()}
                          </span>
                        )}
                        <span className="text-muted-foreground ml-auto text-xs" title={fmt.dateTime(h.at)}>
                          {h.by} · {fmt.ago(h.at)}
                        </span>
                      </div>
                      {h.note && <p className="text-muted-foreground mt-0.5 text-xs break-words whitespace-pre-wrap">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          ) : null}
        </DrawerBody>
        {it && (
          <DrawerFooter className="sm:items-center">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment to the history…" className="sm:flex-1" />
            <Button variant="outline" disabled={!comment.trim() || update.isPending} onClick={() => update.mutate({ comment })}>
              Comment
            </Button>
            {it.status !== 'RESOLVED' && (
              <Button onClick={() => update.mutate({ status: 'RESOLVED', comment: comment || undefined })} disabled={update.isPending}>
                Mark resolved
              </Button>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
