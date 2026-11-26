import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CheckCheck, Download, MessageSquareReply, ShieldAlert, ShieldCheck, UserX } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { toast } from '@edi/ui/components/sonner';
import { cn } from '@edi/ui/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';
import { ErrorState, LoadingRows, NativeSelect } from '@/components/common';
import { api } from '@/lib/api';
import { aiLabel, downloadAuthed, EMAIL_STATUS, ITEM_STATUS, OPEN_STATUSES, PRIORITY, type ItemStatus } from '@/lib/actions';
import { fmt } from '@/lib/format';

interface ReportDetail {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  periodFrom: string;
  periodTo: string;
  csvRows: number;
  summary: { interchanges: number; failedTransactions: number; issues: number; codes: Array<{ code: string; x12Code: string | null; source: string; meaning: string | null; interchanges: number }> };
  partner: { id: string; name: string; isaId: string; specialty: string | null; contactName: string | null; contactEmail: string | null };
  items: Array<{ id: string; number: number; title: string; status: ItemStatus; priority: string; layer: string; occurredAt: string }>;
  emails: Array<{
    id: string;
    direction: 'OUTBOUND' | 'INBOUND';
    status: string;
    fromAddr: string;
    to: string[];
    cc: string[];
    subject: string;
    text: string;
    senderVerified: boolean;
    createdAt: string;
    sentAt: string | null;
    deliveredAt: string | null;
    openedAt: string | null;
    bouncedAt: string | null;
    receivedAt: string | null;
    attachments: Array<{ filename: string; size: number; rows?: number }>;
    events: Array<{ id: string; type: string; receivedAt: string; outcome: string; verified: boolean }>;
  }>;
}

const STEPS = [
  ['sentAt', 'Sent'],
  ['deliveredAt', 'Delivered'],
  ['openedAt', 'Opened'],
] as const;

export function ReportDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [variant, setVariant] = useState('');
  const q = useQuery({ queryKey: ['producer-reports', id], queryFn: () => api<ReportDetail>(`/producer-reports/${id}`), enabled: !!id, refetchInterval: 2000 });
  const reply = useMutation({
    mutationFn: (unknownSender: boolean) => api(`/producer-reports/${id}/simulate-reply`, { method: 'POST', json: { unknownSender, variant: variant || undefined } }),
    onSuccess: (_r, unknownSender) => toast.success(unknownSender ? 'Inbound e-mail from an unknown sender sent' : 'Producer reply sent', { description: 'It arrives as an email.received webhook.' }),
    onError: (e) => toast.error((e as Error).message),
  });
  const resolveAll = useMutation({
    mutationFn: () => api('/action-items/bulk', { method: 'POST', json: { ids: q.data!.items.filter((i) => OPEN_STATUSES.includes(i.status)).map((i) => i.id), status: 'RESOLVED', comment: `Resolved from ${q.data!.label}` } }),
    onSuccess: (r: { updated: number }) => {
      toast.success(`${r.updated} action items resolved`);
      qc.invalidateQueries({ queryKey: ['action-items'] });
      qc.invalidateQueries({ queryKey: ['producer-reports'] });
    },
  });
  const r = q.data;
  const openCount = r?.items.filter((i) => OPEN_STATUSES.includes(i.status)).length ?? 0;

  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-3">
            {r && <BrandLogo name={r.partner.name} kind="producer" hint={r.partner.specialty} size="sm" />}
            <span className="font-mono">{r?.label ?? 'Report'}</span>
            {r && <span className="text-muted-foreground truncate text-base font-normal">· {r.partner.name}</span>}
          </DrawerTitle>
          <DrawerDescription>
            {r ? `${r.items.length} action items · ${r.summary.issues} issues · ${fmt.date(r.periodFrom)} – ${fmt.date(r.periodTo)} · sent by ${r.createdBy} ${fmt.ago(r.createdAt)}` : 'Loading…'}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-5">
          {q.isLoading ? (
            <LoadingRows rows={8} />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : r ? (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Conversation</h3>
                <ol className="space-y-3">
                  {r.emails.map((e) => (
                    <li key={e.id} className={cn('rounded-none border', e.direction === 'INBOUND' && (e.senderVerified ? 'border-success/40 bg-success/[0.03]' : 'border-warning/50 bg-warning/[0.05]'))}>
                      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm">
                        {e.direction === 'OUTBOUND' ? <ArrowUpRight className="text-info size-4" /> : <ArrowDownLeft className="text-success size-4" />}
                        <span className="font-medium">{e.direction === 'OUTBOUND' ? 'To' : 'From'}</span>
                        <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">{e.direction === 'OUTBOUND' ? e.to.join(', ') : e.fromAddr}</span>
                        <Badge variant={EMAIL_STATUS[e.status]?.variant ?? 'outline'} className="ml-auto">
                          {EMAIL_STATUS[e.status]?.label ?? e.status}
                        </Badge>
                        {e.direction === 'INBOUND' &&
                          (e.senderVerified ? (
                            <Badge variant="success" title="Sender is the producer's registered EDI contact">
                              <ShieldCheck /> verified sender
                            </Badge>
                          ) : (
                            <Badge variant="warning" title="Not linked to the report: unknown sender">
                              <ShieldAlert /> quarantined
                            </Badge>
                          ))}
                      </div>
                      <div className="px-4 py-3">
                        <div className="mb-2 text-sm font-medium">{e.subject}</div>
                        <pre className="bg-muted/40 max-h-72 overflow-auto rounded-none p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap">{e.text}</pre>
                        {e.direction === 'OUTBOUND' && (
                          <>
                            {e.attachments.map((a) => (
                              <button
                                key={a.filename}
                                className="hover:bg-muted mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-none border px-2 py-1 text-xs"
                                onClick={() => downloadAuthed(`/producer-reports/${r.id}/csv`, a.filename).catch((err) => toast.error(err.message))}
                              >
                                <Download className="size-3.5" /> {a.filename} · {a.rows ?? r.csvRows} rows
                              </button>
                            ))}
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                              {e.bouncedAt ? (
                                <Badge variant="destructive">
                                  {e.status === 'complained' ? 'Spam complaint' : 'Bounced'} {fmt.time(e.bouncedAt)}
                                </Badge>
                              ) : (
                                STEPS.map(([k, label], i) => (
                                  <span key={k} className="flex items-center gap-1.5">
                                    {i > 0 && <span className="text-muted-foreground">→</span>}
                                    <Badge variant={e[k] ? 'success' : 'muted'}>
                                      {label} {e[k] ? fmt.time(e[k]) : ''}
                                    </Badge>
                                  </span>
                                ))
                              )}
                            </div>
                          </>
                        )}
                        {!!e.events.length && (
                          <details className="mt-2 text-xs">
                            <summary className="text-muted-foreground cursor-pointer">{e.events.length} webhook event(s)</summary>
                            <ul className="mt-1 space-y-0.5 font-mono">
                              {e.events.map((ev) => (
                                <li key={ev.id} className="text-muted-foreground">
                                  {fmt.time(ev.receivedAt)} {ev.type} · {ev.verified ? 'signature ok' : 'unverified'} · {ev.outcome}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {r.emails.length === 1 && <p className="text-muted-foreground mt-2 text-xs">No reply yet. Producers answer most reports a few seconds after opening them — or simulate one below.</p>}
              </section>

              <section className="rounded-none border border-dashed p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <MessageSquareReply className="size-4" /> Simulate inbound e-mail
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    className="h-8 text-xs"
                    value={variant}
                    onChange={setVariant}
                    placeholder="Random reply"
                    options={[
                      { value: 'fix', label: 'Producer found the bug' },
                      { value: 'question', label: 'Producer asks a question' },
                      { value: 'ack', label: 'Producer acknowledges' },
                    ]}
                  />
                  <Button size="sm" variant="outline" onClick={() => reply.mutate(false)} disabled={reply.isPending}>
                    <MessageSquareReply /> Reply as {r.partner.contactName ?? 'producer'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reply.mutate(true)} disabled={reply.isPending} title="Shows how mail from unknown senders is quarantined">
                    <UserX /> From an unknown sender
                  </Button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Action items in this report</h3>
                <ul className="divide-y rounded-none border text-sm">
                  {r.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-muted-foreground font-mono text-xs">{aiLabel(i.number)}</span>
                      <Badge variant={PRIORITY[i.priority]?.variant ?? 'outline'}>{PRIORITY[i.priority]?.label}</Badge>
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      <Badge variant={ITEM_STATUS[i.status]?.variant ?? 'outline'}>{ITEM_STATUS[i.status]?.label ?? i.status}</Badge>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => resolveAll.mutate()} disabled={!openCount || resolveAll.isPending}>
            <CheckCheck /> Resolve {openCount} open item{openCount === 1 ? '' : 's'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
