import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, ArrowDownLeft, ArrowUpRight, CircleAlert, ClipboardList, FlaskConical, Inbox, MailCheck, MessageSquareReply, Send, ShieldAlert, ShieldCheck, Webhook } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { toast } from '@edi/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { cn } from '@edi/ui/lib/utils';
import { ActionItemDrawer } from '@/components/actions/ActionItemDrawer';
import { ReportComposer, type ComposerTarget } from '@/components/actions/ReportComposer';
import { ReportDrawer } from '@/components/actions/ReportDrawer';
import { BrandLogo } from '@/components/BrandLogo';
import { EmptyState, ErrorState, LiveDot, LoadingRows, Mono, NativeSelect, PageHeader, Pagination, StatCard } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { aiLabel, EMAIL_STATUS, ITEM_STATUS, LAYER, PRIORITY, rptLabel, type ActionItemRow, type ItemStatus } from '@/lib/actions';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { usePartners, useUrlFilters } from '@/lib/hooks';

const PAGE_SIZE = 20;

interface Summary {
  byStatus: Record<ItemStatus, number>;
  open: number;
  openByPriority: Record<string, number>;
  openByPartner: Record<string, number>;
  oldestOpenAt: string | null;
}

export function useActionSummary() {
  return useQuery({ queryKey: ['action-items', 'summary'], queryFn: () => api<Summary>('/action-items/summary'), refetchInterval: 10000 });
}

// ---------------------------------------------------------------------------
// Backlog
// ---------------------------------------------------------------------------
function Backlog({ onOpen, onReport, onOpenReport }: { onOpen: (id: string) => void; onReport: (t: ComposerTarget) => void; onOpenReport: (id: string) => void }) {
  const qc = useQueryClient();
  const partners = usePartners();
  const summary = useActionSummary();
  const { values: f, page, set } = useUrlFilters({ status: 'open', partnerId: '', priority: '', layer: '', q: '', days: '', sort: 'newest' });
  const params = { ...f, page, pageSize: PAGE_SIZE };
  const q = useQuery({ queryKey: ['action-items', 'list', params], queryFn: () => api<Page<ActionItemRow>>(`/action-items${qs(params)}`), refetchInterval: 5000, placeholderData: keepPreviousData });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulk = useMutation({
    mutationFn: (status: ItemStatus) => api<{ updated: number }>('/action-items/bulk', { method: 'POST', json: { ids: [...selected], status } }),
    onSuccess: (r, status) => {
      toast.success(`${r.updated} item(s) → ${ITEM_STATUS[status].label}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['action-items'] });
    },
  });
  const rows = q.data?.items ?? [];
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedPartners = [...new Set(selectedRows.map((r) => r.partner.id))];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const filtered = !!(f.partnerId || f.priority || f.layer || f.q || f.days || f.status !== 'open');
  const s = summary.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Open" value={fmt.num(s?.open)} icon={ClipboardList} tone={s?.open ? 'destructive' : 'success'} hint="needs attention or an answer" />
        <StatCard label="High priority" value={fmt.num(s?.openByPriority.HIGH)} icon={CircleAlert} tone="destructive" hint="envelope rejections & system errors" />
        <StatCard label="Waiting for producer" value={fmt.num(s?.byStatus.REPORTED)} icon={MailCheck} tone="info" hint="reported, no reply yet" />
        <StatCard label="Producer replied" value={fmt.num(s?.byStatus.PRODUCER_REPLIED)} icon={MessageSquareReply} tone="success" hint="review the replies" />
        <StatCard label="Oldest open" value={s?.oldestOpenAt ? fmt.ago(s.oldestOpenAt) : '—'} icon={AlarmClock} tone="warning" hint={s?.oldestOpenAt ? fmt.dateTime(s.oldestOpenAt) : 'nothing open'} />
      </div>

      <Card className="gap-0 py-0">
        <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="AI number, ICN, file or title" onReset={filtered ? () => set({ status: 'open', partnerId: '', priority: '', layer: '', q: '', days: '' }) : undefined}>
          <NativeSelect
            value={f.status}
            onChange={(v) => set({ status: v || 'open' })}
            options={[{ value: 'open', label: 'All open' }, ...Object.entries(ITEM_STATUS).map(([value, st]) => ({ value, label: st.label })), { value: 'any', label: 'Any status' }]}
          />
          <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <NativeSelect value={f.priority} onChange={(v) => set({ priority: v })} placeholder="Any priority" options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} />
          <NativeSelect value={f.layer} onChange={(v) => set({ layer: v })} placeholder="Any layer" options={Object.entries(LAYER).map(([value, l]) => ({ value, label: l.label }))} />
          <NativeSelect
            value={f.days}
            onChange={(v) => set({ days: v })}
            placeholder="Any time"
            options={[
              { value: '1', label: 'Last 24h' },
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
            ]}
          />
          <NativeSelect
            value={f.sort}
            onChange={(v) => set({ sort: v || 'newest' })}
            options={[
              { value: 'newest', label: 'Sort: newest' },
              { value: 'oldest', label: 'Sort: oldest' },
              { value: 'priority', label: 'Sort: priority' },
              { value: 'updated', label: 'Sort: recently updated' },
            ]}
          />
        </FilterBar>

        {selected.size > 0 && (
          <div className="bg-primary/5 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              onClick={() => onReport({ partnerId: selectedPartners[0]!, itemIds: [...selected] })}
              disabled={selectedPartners.length !== 1}
              title={selectedPartners.length !== 1 ? 'Select items from a single producer' : undefined}
            >
              <Send /> Report to producer
            </Button>
            {selectedPartners.length > 1 && <span className="text-muted-foreground text-xs">select items from one producer to report them</span>}
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => bulk.mutate('IN_PROGRESS')}>
                In progress
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate('RESOLVED')}>
                Resolve
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate('DISMISSED')}>
                Dismiss
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </span>
          </div>
        )}

        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4">
            <ErrorState error={q.error} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title={filtered ? 'No action items match these filters' : 'Backlog is empty'} description={filtered ? undefined : 'Failed interchanges become action items automatically.'} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onChange={() => setSelected((sel) => (allOnPage ? new Set([...sel].filter((id) => !rows.some((r) => r.id === id))) : new Set([...sel, ...rows.map((r) => r.id)])))}
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={cn('cursor-pointer', selected.has(r.id) && 'bg-primary/[0.04]')} onClick={() => onOpen(r.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${aiLabel(r.number)}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{aiLabel(r.number)}</div>
                    <Badge variant={PRIORITY[r.priority]?.variant ?? 'outline'} className="mt-1">
                      {PRIORITY[r.priority]?.label ?? r.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <BrandLogo name={r.partner.name} kind="producer" hint={r.partner.specialty} size="xs" />
                      <span className="text-sm whitespace-nowrap">{r.partner.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[420px]">
                    <div className="truncate text-sm">{r.title}</div>
                    <div className="text-muted-foreground truncate font-mono text-[11px]">
                      ICN {r.interchange.controlNumber || '—'} · {r.interchange.fileTransfer.fileName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap" title={LAYER[r.layer]?.help}>
                      <span className="size-2 rounded-none" style={{ background: LAYER[r.layer]?.color }} />
                      {LAYER[r.layer]?.label ?? r.layer}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ITEM_STATUS[r.status]?.variant ?? 'outline'} title={ITEM_STATUS[r.status]?.help}>
                      {ITEM_STATUS[r.status]?.label ?? r.status}
                    </Badge>
                    {r.reports[0] && (
                      <button
                        className="text-primary mt-1 block cursor-pointer font-mono text-[11px] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReport(r.reports[0]!.id);
                        }}
                      >
                        {rptLabel(r.reports[0].number)}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap" title={fmt.dateTime(r.occurredAt)}>
                    {fmt.ago(r.occurredAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(n) => set({ page: n })} />}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Producer reports
// ---------------------------------------------------------------------------
interface ReportRow {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  periodFrom: string;
  periodTo: string;
  partner: { id: string; name: string; isaId: string; specialty: string | null };
  emails: Array<{ id: string; direction: string; status: string; to: string[]; createdAt: string; openedAt: string | null; senderVerified: boolean }>;
  _count: { items: number };
}

function Reports({ onOpenReport }: { onOpenReport: (id: string) => void }) {
  const partners = usePartners();
  const { values: f, page, set } = useUrlFilters({ partnerId: '' });
  const params = { ...f, page, pageSize: PAGE_SIZE };
  const q = useQuery({ queryKey: ['producer-reports', 'list', params], queryFn: () => api<Page<ReportRow>>(`/producer-reports${qs(params)}`), refetchInterval: 3000, placeholderData: keepPreviousData });
  return (
    <Card className="gap-0 py-0">
      <FilterBar onReset={f.partnerId ? () => set({ partnerId: '' }) : undefined}>
        <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      </FilterBar>
      {q.isLoading ? (
        <LoadingRows />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data!.items.length ? (
        <EmptyState icon={Send} title="No reports sent yet" description="Select action items in the backlog (or use Reports → EDI errors) and choose “Report to producer”." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Producer</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Replies</TableHead>
              <TableHead className="text-right">Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data!.items.map((r) => {
              const out = r.emails.find((e) => e.direction === 'OUTBOUND');
              const replies = r.emails.filter((e) => e.direction === 'INBOUND');
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpenReport(r.id)}>
                  <TableCell className="font-mono text-sm">{r.label}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <BrandLogo name={r.partner.name} kind="producer" hint={r.partner.specialty} size="xs" />
                      {r.partner.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.items}</TableCell>
                  <TableCell>
                    {out ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={EMAIL_STATUS[out.status]?.variant ?? 'outline'}>{EMAIL_STATUS[out.status]?.label ?? out.status}</Badge>
                        <span className="text-muted-foreground max-w-[220px] truncate font-mono text-xs">{out.to.join(', ')}</span>
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {replies.length ? (
                      <Badge variant={replies.some((x) => x.senderVerified) ? 'success' : 'warning'}>
                        <MessageSquareReply /> {replies.length}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">waiting</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs" title={fmt.dateTime(r.createdAt)}>
                    {fmt.ago(r.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {q.data && q.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(n) => set({ page: n })} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E-mail log + webhook audit (the Resend integration)
// ---------------------------------------------------------------------------
interface Integration {
  provider: string;
  from: string;
  sendingDomain: string;
  inboundDomain: string;
  webhookUrl: string;
  webhookSecret: string;
  replyRate: number;
  testAddresses: string[];
  webhooks: Record<string, number>;
}
interface EmailRow {
  id: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: string;
  fromAddr: string;
  to: string[];
  subject: string;
  createdAt: string;
  senderVerified: boolean;
  partner: { id: string; name: string; specialty: string | null } | null;
  report: { id: string; label: string } | null;
  _count: { events: number };
}
interface EventRow {
  id: string;
  svixId: string;
  type: string;
  verified: boolean;
  outcome: string;
  error: string | null;
  receivedAt: string;
  email: { id: string; subject: string; direction: string } | null;
}

const OUTCOME: Record<string, 'success' | 'muted' | 'destructive' | 'outline'> = { processed: 'success', duplicate: 'muted', ignored: 'outline', rejected: 'destructive' };

function EmailLog({ onOpenReport }: { onOpenReport: (id: string) => void }) {
  const integ = useQuery({ queryKey: ['email-integration'], queryFn: () => api<Integration>('/email/integration'), refetchInterval: 10000 });
  const { values: f, page, set } = useUrlFilters({ direction: '', status: '', q: '', view: 'emails', outcome: '' });
  const emails = useQuery({
    queryKey: ['emails', f, page],
    queryFn: () => api<Page<EmailRow>>(`/emails${qs({ direction: f.direction, status: f.status, q: f.q, page, pageSize: PAGE_SIZE })}`),
    refetchInterval: 3000,
    placeholderData: keepPreviousData,
    enabled: f.view === 'emails',
  });
  const events = useQuery({
    queryKey: ['email-events', f.outcome, page],
    queryFn: () => api<Page<EventRow>>(`/email-events${qs({ outcome: f.outcome, page, pageSize: PAGE_SIZE })}`),
    refetchInterval: 3000,
    placeholderData: keepPreviousData,
    enabled: f.view === 'webhooks',
  });
  const i = integ.data;
  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" /> Resend integration <Badge variant="info">simulated</Badge>
          </CardTitle>
          <CardDescription>{i?.provider ?? '…'} — the app uses a Resend-compatible API to send, and verifies Svix-signed webhooks for delivery events and inbound replies.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {i && (
            <>
              <Row label="From">{i.from}</Row>
              <Row label="Verified sending domain">
                <Mono>{i.sendingDomain}</Mono>
              </Row>
              <Row label="Inbound (replies)">
                <Mono>edi-replies+RPT-…@{i.inboundDomain}</Mono>
              </Row>
              <Row label="Webhook endpoint">
                <Mono className="break-all">{i.webhookUrl}</Mono>
              </Row>
              <Row label="Signing secret">
                <Mono>{i.webhookSecret}</Mono>
              </Row>
              <Row label="Webhooks">
                {Object.entries(i.webhooks).map(([k, v]) => (
                  <Badge key={k} variant={OUTCOME[k] ?? 'outline'} className="mr-1">
                    {k} {v}
                  </Badge>
                ))}
              </Row>
              <Row label="Test inboxes">
                {i.testAddresses.map((a) => (
                  <Mono key={a} className="mr-2 text-xs">
                    {a}
                  </Mono>
                ))}
              </Row>
              <Row label="Simulated reply rate">{fmt.pct(i.replyRate, 0)} of opened reports</Row>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tabs value={f.view} onValueChange={(v) => set({ view: v })}>
            <TabsList>
              <TabsTrigger value="emails">
                <Inbox /> E-mails
              </TabsTrigger>
              <TabsTrigger value="webhooks">
                <Webhook /> Webhook log
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {f.view === 'emails' ? (
            <>
              <NativeSelect
                value={f.direction}
                onChange={(v) => set({ direction: v })}
                placeholder="In and out"
                options={[
                  { value: 'OUTBOUND', label: 'Outbound' },
                  { value: 'INBOUND', label: 'Inbound' },
                ]}
              />
              <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="Any status" options={Object.entries(EMAIL_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
            </>
          ) : (
            <NativeSelect value={f.outcome} onChange={(v) => set({ outcome: v })} placeholder="Any outcome" options={Object.keys(OUTCOME).map((o) => ({ value: o, label: o }))} />
          )}
        </div>
        {f.view === 'emails' ? (
          emails.isLoading ? (
            <LoadingRows />
          ) : !emails.data?.items.length ? (
            <EmptyState icon={Inbox} title="No e-mails" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Subject</TableHead>
                  <TableHead>Producer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.data.items.map((e) => (
                  <TableRow key={e.id} className={cn(e.report && 'cursor-pointer')} onClick={() => e.report && onOpenReport(e.report.id)}>
                    <TableCell>{e.direction === 'OUTBOUND' ? <ArrowUpRight className="text-info size-4" /> : <ArrowDownLeft className="text-success size-4" />}</TableCell>
                    <TableCell className="max-w-[460px]">
                      <div className="truncate text-sm">{e.subject}</div>
                      <div className="text-muted-foreground truncate font-mono text-[11px]">{e.direction === 'OUTBOUND' ? `to ${e.to.join(', ')}` : `from ${e.fromAddr}`}</div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{e.partner?.name ?? <span className="text-muted-foreground">unknown</span>}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={EMAIL_STATUS[e.status]?.variant ?? 'outline'}>{EMAIL_STATUS[e.status]?.label ?? e.status}</Badge>
                        {e.direction === 'INBOUND' && (e.senderVerified ? <ShieldCheck className="text-success size-4" /> : <ShieldAlert className="size-4 text-[oklch(0.55_0.13_70)]" />)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e._count.events}</TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">{fmt.ago(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : events.isLoading ? (
          <LoadingRows />
        ) : !events.data?.items.length ? (
          <EmptyState icon={Webhook} title="No webhook deliveries yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>svix-id</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.items.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-mono text-xs">{ev.type}</TableCell>
                  <TableCell>
                    {ev.verified ? (
                      <Badge variant="success">
                        <ShieldCheck /> valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive" title={ev.error ?? undefined}>
                        <ShieldAlert /> invalid
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={OUTCOME[ev.outcome] ?? 'outline'}>{ev.outcome}</Badge>
                    {ev.error && <div className="text-muted-foreground mt-0.5 max-w-[260px] truncate text-[11px]">{ev.error}</div>}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs">{ev.email?.subject ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[11px]">{ev.svixId.slice(0, 22)}</TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">{fmt.time(ev.receivedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {f.view === 'emails' && emails.data && emails.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={emails.data.total} onPage={(n) => set({ page: n })} />}
        {f.view === 'webhooks' && events.data && events.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={events.data.total} onPage={(n) => set({ page: n })} />}
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-muted-foreground w-44 shrink-0 text-xs">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const TABS = ['backlog', 'reports', 'email'] as const;

export function ActionItemsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab')! : 'backlog';
  const [itemId, setItemId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(params.get('report'));
  const linkedReport = params.get('report');
  useEffect(() => {
    if (linkedReport) setReportId(linkedReport);
  }, [linkedReport]);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const summary = useActionSummary();
  const setTab = (t: string) => setParams(() => (t === 'backlog' ? new URLSearchParams() : new URLSearchParams({ tab: t })), { replace: true });
  const openItems = summary.data?.open ?? 0;

  return (
    <>
      <PageHeader
        title="Action Items"
        description="The EDI failure backlog. Every rejected or failed inbound interchange becomes an action item; group them into an exception report, e-mail it to the producer, and track the reply."
        actions={<LiveDot />}
      />
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-10">
          <TabsTrigger value="backlog" className="px-3">
            <ClipboardList /> Backlog
            {openItems > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 rounded-none px-1.5 tabular-nums">
                {openItems}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports" className="px-3">
            <Send /> Producer reports
          </TabsTrigger>
          <TabsTrigger value="email" className="px-3">
            <Webhook /> E-mail &amp; webhooks
          </TabsTrigger>
        </TabsList>
        <TabsContent value="backlog">
          <Backlog onOpen={setItemId} onReport={setComposer} onOpenReport={setReportId} />
        </TabsContent>
        <TabsContent value="reports">
          <Reports onOpenReport={setReportId} />
        </TabsContent>
        <TabsContent value="email">
          <EmailLog onOpenReport={setReportId} />
        </TabsContent>
      </Tabs>

      <ActionItemDrawer
        id={itemId}
        onClose={() => setItemId(null)}
        onReport={(partnerId, itemIds) => {
          setItemId(null);
          setComposer({ partnerId, itemIds });
        }}
        onOpenReport={(id) => {
          setItemId(null);
          setReportId(id);
        }}
      />
      <ReportComposer target={composer} onClose={() => setComposer(null)} onSent={(id) => setReportId(id)} />
      <ReportDrawer id={reportId} onClose={() => setReportId(null)} />
    </>
  );
}

