import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { cn } from '@edi/ui/lib/utils';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters } from '@/lib/hooks';
import type { ApiDelivery } from '@/lib/types';
import { EmptyState, ErrorState, LiveDot, LoadingRows, NativeSelect, PageHeader, Pagination, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';

export function DeliveriesPage() {
  const { values: f, page, set } = useUrlFilters({ status: '' });
  const q = useQuery({
    queryKey: ['deliveries', f, page],
    queryFn: () => api<Page<ApiDelivery>>(`/deliveries${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 4000,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="API deliveries"
        description="After ingestion, each transaction set is converted to JSON and POSTed to the order app (POST /api/integration/inventory). Failures retry with exponential backoff (2s, 4s, 8s, 16s) before being marked dead and notified."
        actions={<LiveDot />}
      />
      <Card className="gap-0 py-0">
        <FilterBar onReset={() => set({ status: '' })}>
          <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={['PENDING', 'RETRYING', 'SUCCESS', 'DEAD'].map((s) => ({ value: s, label: s.toLowerCase() }))} />
        </FilterBar>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="No deliveries" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Transaction</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-4">Delivered / next</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4">
                    {d.transaction && (
                      <Link className="text-primary font-mono text-xs hover:underline" to={`/edi/transactions/${d.transaction.id}`}>
                        {d.transaction.type} #{d.transaction.controlNumber}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>{d.transaction?.partner?.name}</TableCell>
                  <TableCell className="tabular-nums">{d.payload?.items?.length ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {d.attemptLog.map((a) => (
                        <span key={a.id} title={`#${a.attemptNo} ${a.success ? 'ok' : a.error ?? 'failed'}`} className={cn('size-2.5 rounded-full', a.success ? 'bg-success' : 'bg-destructive')} />
                      ))}
                      <span className="text-muted-foreground ml-1 text-xs">{d.attempts}/{d.maxAttempts}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.lastStatusCode ?? '—'}</TableCell>
                  <TableCell className="text-destructive max-w-[260px] truncate text-xs" title={d.lastError ?? ''}>{d.lastError}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmt.ago(d.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground pr-4 text-xs">
                    {d.deliveredAt ? fmt.time(d.deliveredAt) : d.status === 'RETRYING' || d.status === 'PENDING' ? `next ${fmt.time(d.nextAttemptAt)}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <Card className="mt-4 py-4">
        <CardContent className="text-muted-foreground px-4 text-sm">
          Tip: stop the order API (<code className="font-mono">docker compose stop order-api</code>) while the simulator runs to watch deliveries go to <b>retrying</b> and then <b>dead</b>, raising an <code className="font-mono">edi.delivery.failed</code> notification. Use "Redeliver" on the transaction page once it is back. Set <code className="font-mono">DELIVERY_FAILURE_RATE</code> to inject random transient failures.
        </CardContent>
      </Card>
    </>
  );
}
