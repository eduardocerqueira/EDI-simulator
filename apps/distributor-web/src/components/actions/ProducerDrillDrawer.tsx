import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Mail, Send } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { BrandLogo } from '@/components/BrandLogo';
import { EmptyState, ErrorState, LoadingRows, Mono, StatusBadge } from '@/components/common';
import { HBarChart } from '@/components/charts';
import { AckCodeBadge } from '@/components/x12/IssuesTable';
import { aiLabel, EMAIL_STATUS, ITEM_STATUS, LAYER, OPEN_STATUSES, type ItemStatus } from '@/lib/actions';
import { api, qs } from '@/lib/api';
import { fmt } from '@/lib/format';

interface Drill {
  days: number;
  partner: { id: string; name: string; isaId: string; specialty: string | null; city: string | null; state: string | null; contactName: string | null; contactEmail: string | null; ftpUser: string };
  codes: Array<{ code: string; x12Code: string | null; source: string; meaning: string | null; layer: string; count: number }>;
  recent: Array<{
    id: string;
    controlNumber: string;
    status: string;
    receivedAt: string;
    ta1AckCode: string | null;
    fileTransfer: { fileName: string };
    transactions: Array<{ id: string; type: string; status: string; controlNumber: string }>;
    issues: Array<{ code: string; message: string; segmentId: string | null }>;
    actionItem: { id: string; number: number; status: ItemStatus } | null;
  }>;
  items: Partial<Record<ItemStatus, number>>;
  reports: Array<{ id: string; number: string; createdAt: string; items: number; emails: Array<{ direction: string; status: string }> }>;
}

/** Reports → EDI errors → click a producer: everything about its failures in the selected period. */
export function ProducerDrillDrawer({
  partnerId,
  filters,
  onClose,
  onReport,
}: {
  partnerId: string | null;
  filters: { days: string; type: string; layer: string; code: string };
  onClose: () => void;
  onReport: (partnerId: string) => void;
}) {
  const q = useQuery({
    queryKey: ['edi-errors', 'partner', partnerId, filters],
    queryFn: () => api<Drill>(`/edi/errors/partners/${partnerId}${qs(filters)}`),
    enabled: !!partnerId,
    refetchInterval: 10000,
  });
  const d = q.data;
  const open = d ? OPEN_STATUSES.reduce((n, s) => n + (d.items[s] ?? 0), 0) : 0;
  const reportable = (d?.items.OPEN ?? 0) + (d?.items.IN_PROGRESS ?? 0);

  return (
    <Drawer open={!!partnerId} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-3">
            {d && <BrandLogo name={d.partner.name} kind="producer" hint={d.partner.specialty} size="md" />}
            <span>{d?.partner.name ?? 'Producer'}</span>
          </DrawerTitle>
          <DrawerDescription>
            {d ? (
              <>
                ISA ZZ:{d.partner.isaId} · {d.partner.city}, {d.partner.state} · EDI contact {d.partner.contactName} <Mono>{d.partner.contactEmail}</Mono> · last {d.days} day(s)
              </>
            ) : (
              'Loading…'
            )}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-5">
          {q.isLoading ? (
            <LoadingRows rows={8} />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : d ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['OPEN', 'REPORTED', 'PRODUCER_REPLIED', 'RESOLVED'] as ItemStatus[]).map((s) => (
                  <Link key={s} to={`/edi/action-items?partnerId=${d.partner.id}&status=${s}`} className="hover:bg-muted/60 rounded-none border p-3 text-center">
                    <div className="text-xl font-semibold tabular-nums">{d.items[s] ?? 0}</div>
                    <div className="text-muted-foreground text-xs">{ITEM_STATUS[s].label}</div>
                  </Link>
                ))}
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Errors by code</h3>
                {d.codes.length ? (
                  <>
                    <HBarChart data={d.codes.map((c) => ({ code: c.code, count: c.count }))} labelKey="code" valueKey="count" className="h-[220px]" />
                    <ul className="mt-2 divide-y rounded-none border text-sm">
                      {d.codes.map((c) => (
                        <li key={c.code} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="size-2 shrink-0 rounded-none" style={{ background: LAYER[c.layer]?.color }} title={LAYER[c.layer]?.label} />
                          <span className="font-mono text-xs">{c.code}</span>
                          <AckCodeBadge source={c.source} code={c.x12Code} description={c.meaning} />
                          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{c.meaning}</span>
                          <span className="tabular-nums">{c.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <EmptyState title="No errors in this period" />
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Recent failed interchanges</h3>
                <ul className="divide-y rounded-none border text-sm">
                  {d.recent.map((ic) => (
                    <li key={ic.id} className="space-y-1 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/edi/interchanges/${ic.id}`} className="text-primary inline-flex items-center gap-1 font-mono text-xs hover:underline">
                          <Mail className="size-3" /> ICN {ic.controlNumber || '—'}
                        </Link>
                        <StatusBadge status={ic.status} />
                        {ic.transactions.map((t) => (
                          <Badge key={t.id} variant="outline" className="font-mono text-[10px]">
                            {t.type}
                          </Badge>
                        ))}
                        {ic.actionItem && (
                          <Link to={`/edi/action-items?q=${aiLabel(ic.actionItem.number)}&status=any`} className="ml-auto">
                            <Badge variant={ITEM_STATUS[ic.actionItem.status]?.variant}>
                              {aiLabel(ic.actionItem.number)} · {ITEM_STATUS[ic.actionItem.status]?.label}
                            </Badge>
                          </Link>
                        )}
                        <span className="text-muted-foreground text-xs">{fmt.ago(ic.receivedAt)}</span>
                      </div>
                      {ic.issues.map((i, n) => (
                        <div key={n} className="text-muted-foreground truncate text-xs">
                          <span className="font-mono">{i.code}</span>
                          {i.segmentId ? ` at ${i.segmentId}` : ''} — {i.message}
                        </div>
                      ))}
                    </li>
                  ))}
                  {!d.recent.length && <li className="text-muted-foreground px-3 py-2">Nothing failed in this period.</li>}
                </ul>
              </section>

              {!!d.reports.length && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Reports sent</h3>
                  <ul className="divide-y rounded-none border text-sm">
                    {d.reports.map((r) => (
                      <li key={r.id}>
                        <Link to={`/edi/action-items?tab=reports&report=${r.id}`} className="hover:bg-muted/50 flex items-center gap-2 px-3 py-2">
                          <span className="font-mono">{r.number}</span>
                          <span className="text-muted-foreground text-xs">
                            {r.items} items · {fmt.ago(r.createdAt)}
                          </span>
                          <span className="ml-auto flex gap-1">
                            {r.emails.map((e, i) => (
                              <Badge key={i} variant={EMAIL_STATUS[e.status]?.variant ?? 'outline'}>
                                {e.direction === 'INBOUND' ? 'reply · ' : ''}
                                {EMAIL_STATUS[e.status]?.label ?? e.status}
                              </Badge>
                            ))}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : null}
        </DrawerBody>
        {d && (
          <DrawerFooter>
            <Button asChild variant="outline">
              <Link to={`/edi/action-items?partnerId=${d.partner.id}`}>
                <ClipboardList /> Open backlog ({open})
              </Link>
            </Button>
            <Button onClick={() => onReport(d.partner.id)} disabled={!reportable} title={!reportable ? 'No open or in-progress items to report' : undefined}>
              <Send /> Report {reportable} failure{reportable === 1 ? '' : 's'} to producer
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
