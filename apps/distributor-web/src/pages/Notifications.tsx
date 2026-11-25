import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, BellOff, CheckCheck, Info, Rabbit } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card } from '@edi/ui/components/card';
import { Tabs, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { cn } from '@edi/ui/lib/utils';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters } from '@/lib/hooks';
import { EmptyState, ErrorState, LiveDot, LoadingRows, NativeSelect, PageHeader, Pagination } from '@/components/common';

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  payload: any;
  interchangeId: string | null;
  transactionId: string | null;
  orderNumber: string | null;
  read: boolean;
  createdAt: string;
}

const SEV = {
  ERROR: { icon: AlertOctagon, cls: 'text-destructive bg-destructive/10' },
  WARNING: { icon: AlertTriangle, cls: 'text-[oklch(0.55_0.13_70)] dark:text-warning bg-warning/15' },
  INFO: { icon: Info, cls: 'text-info bg-info/10' },
} as const;

export function NotificationsPage() {
  const qc = useQueryClient();
  const { values: f, page, set } = useUrlFilters({ tab: 'all', severity: '' });
  const params = { unread: f.tab === 'unread' ? 'true' : undefined, category: f.tab === 'edi' || f.tab === 'orders' ? f.tab : undefined, severity: f.severity, page, pageSize: 20 };
  const q = useQuery({
    queryKey: ['notifications', params],
    queryFn: () => api<Page<Notification> & { unread: number }>(`/notifications${qs(params)}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          <>
            Event-driven alerts. EDI failures are published to the <code className="font-mono">edi.events</code> exchange and routed by RabbitMQ (<code className="font-mono">edi.*.rejected</code>, <code className="font-mono">edi.*.failed</code>) to the <code className="font-mono">distributor.notifications</code> queue; order events arrive from the order app on <code className="font-mono">order.events</code>.
          </>
        }
        actions={
          <>
            <LiveDot />
            <Button variant="outline" onClick={() => markAll.mutate()} disabled={!q.data?.unread}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={f.tab} onValueChange={(v) => set({ tab: v })}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread {q.data?.unread ? <Badge variant="destructive" className="ml-1">{q.data.unread}</Badge> : null}</TabsTrigger>
            <TabsTrigger value="edi">EDI</TabsTrigger>
            <TabsTrigger value="orders">Orders & billing</TabsTrigger>
          </TabsList>
        </Tabs>
        <NativeSelect value={f.severity} onChange={(v) => set({ severity: v })} placeholder="Any severity" options={['ERROR', 'WARNING', 'INFO'].map((s) => ({ value: s, label: s.toLowerCase() }))} />
      </div>
      <Card className="gap-0 py-0">
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState icon={BellOff} title="No notifications" />
        ) : (
          <ul>
            {q.data!.items.map((n) => {
              const s = SEV[n.severity as keyof typeof SEV] ?? SEV.INFO;
              const Icon = s.icon;
              const link = n.transactionId ? `/edi/transactions/${n.transactionId}` : n.interchangeId ? `/edi/interchanges/${n.interchangeId}` : n.orderNumber ? `/orders?q=${n.orderNumber}` : null;
              const errors: Array<{ code: string; x12Code?: string; message: string }> = n.payload?.errors ?? [];
              return (
                <li key={n.id} className={cn('flex gap-4 border-b px-4 py-4 last:border-0', !n.read && 'bg-primary/[0.03]')}>
                  <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', s.cls)}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.read && <span className="bg-primary size-2 rounded-full" />}
                      <span className="font-medium">{n.title}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{n.type}</Badge>
                      {n.source !== 'rabbitmq' && <Badge variant="warning">{n.source}</Badge>}
                      <span className="text-muted-foreground ml-auto text-xs" title={fmt.dateTime(n.createdAt)}>{fmt.ago(n.createdAt)}</span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">{n.message}</p>
                    {errors.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {errors.slice(0, 4).map((e, i) => (
                          <li key={i} className="text-xs">
                            <span className="font-mono">{e.code}</span>
                            {e.x12Code && <span className="text-muted-foreground"> ({e.x12Code})</span>} — <span className="text-muted-foreground">{e.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {link && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={link} onClick={() => !n.read && markRead.mutate(n.id)}>Trace it</Link>
                        </Button>
                      )}
                      {!n.read && (
                        <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>Mark read</Button>
                      )}
                      {n.payload?.partner && <span className="text-muted-foreground flex items-center gap-1 text-xs"><Rabbit className="size-3" /> {n.payload.partner}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
