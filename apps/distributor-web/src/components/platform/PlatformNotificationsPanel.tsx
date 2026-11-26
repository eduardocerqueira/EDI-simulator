import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Server } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { cn } from '@edi/ui/lib/utils';
import { EmptyState, ErrorState, LoadingRows, NativeSelect, Pagination } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters } from '@/lib/hooks';
import { toneDot } from '@/lib/platform';
import type { PlatformNotification } from '@/lib/types';

const PAGE_SIZE = 20;
const SEV_TONE: Record<string, string> = { ERROR: 'destructive', WARNING: 'warning', INFO: 'info' };
/** Routing keys the platform controller publishes on platform.events. */
const TYPES = [
  ['platform.node.down', 'Node down'],
  ['platform.node.replacing', 'Node replacing'],
  ['platform.node.ready', 'Node ready'],
  ['platform.chaos.injected', 'Chaos injected'],
  ['platform.alert.firing', 'Alert firing'],
  ['platform.alert.resolved', 'Alert resolved'],
] as const;

/** Platform notifications (RabbitMQ platform.events → distributor.platform) with filters and pagination. */
export function PlatformNotificationsPanel({ nodes }: { nodes: string[] }) {
  const qc = useQueryClient();
  const { values: f, page, set } = useUrlFilters({ read: '', type: '', severity: '', node: '', q: '' });
  const params = { category: 'platform', unread: f.read === 'unread' ? 'true' : undefined, type: f.type, severity: f.severity, node: f.node, q: f.q, page, pageSize: PAGE_SIZE };
  const q = useQuery({
    queryKey: ['notifications', params],
    queryFn: () => api<Page<PlatformNotification> & { unread: number }>(`/notifications${qs(params)}`),
    refetchInterval: 3000,
    placeholderData: keepPreviousData,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['platform'] });
    },
  });
  const filtered = !!(f.read || f.type || f.severity || f.node || f.q);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" /> Platform notifications
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to="/notifications?tab=platform">Open in Notifications</Link>
          </Button>
        </CardTitle>
        <CardDescription>Delivered by RabbitMQ (platform.events → distributor.platform): node failures, replacements, chaos tests and Prometheus alerts</CardDescription>
      </CardHeader>
      <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="Search title or message" onReset={filtered ? () => set({ read: '', type: '', severity: '', node: '', q: '' }) : undefined}>
        <NativeSelect value={f.read} onChange={(v) => set({ read: v })} placeholder="Read and unread" options={[{ value: 'unread', label: 'Unread only' }]} />
        <NativeSelect value={f.type} onChange={(v) => set({ type: v })} placeholder="All types" options={TYPES.map(([value, label]) => ({ value, label }))} />
        <NativeSelect value={f.severity} onChange={(v) => set({ severity: v })} placeholder="Any severity" options={['ERROR', 'WARNING', 'INFO'].map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <NativeSelect value={f.node} onChange={(v) => set({ node: v })} placeholder="All nodes" options={nodes.map((n) => ({ value: n, label: n }))} />
      </FilterBar>
      {q.isLoading ? (
        <LoadingRows />
      ) : q.error ? (
        <div className="p-4">
          <ErrorState error={q.error} />
        </div>
      ) : q.data!.items.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title={filtered ? 'No notifications match these filters' : 'No platform notifications'}
          description={filtered ? undefined : 'Node failures, recoveries, chaos tests and Prometheus alerts show up here.'}
        />
      ) : (
        <ul className="divide-y">
          {q.data!.items.map((n) => {
            const node = typeof n.payload?.node === 'string' ? n.payload.node : undefined;
            return (
              <li key={n.id} className={cn('flex gap-3 px-6 py-3', !n.read && 'bg-primary/[0.03]')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-none', toneDot[SEV_TONE[n.severity] ?? 'muted'])} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.read && (
                      <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                        new
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {n.type}
                    </Badge>
                    {node && (
                      <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
                        <Server className="size-3" /> {node}
                      </span>
                    )}
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums" title={fmt.dateTime(n.createdAt)}>
                      {fmt.time(n.createdAt)} · {fmt.ago(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">{n.message}</p>
                  {!n.read && (
                    <button className="text-primary mt-1 cursor-pointer text-xs hover:underline" onClick={() => markRead.mutate(n.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {q.data && q.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </Card>
  );
}
