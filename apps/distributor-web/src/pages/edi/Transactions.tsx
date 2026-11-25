import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge } from '@edi/ui/components/badge';
import { Card } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters, usePartners } from '@/lib/hooks';
import { statusLabel, statusVariant, TRANSACTION_STATUSES, TX_TYPES, TYPE_NAMES } from '@/lib/status';
import { EmptyState, ErrorState, LiveDot, LoadingRows, NativeSelect, PageHeader, Pagination, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';

interface Row {
  id: string;
  type: string;
  typeName: string | null;
  controlNumber: string;
  status: string;
  ackCode: string | null;
  ak5Codes: string[];
  errorCount: number;
  itemCount: number;
  segmentCount: number;
  receivedAt: string;
  ingestedAt: string | null;
  deliveredAt: string | null;
  partner: { id: string; name: string; isaId: string } | null;
  interchange: { id: string; controlNumber: string };
  group: { controlNumber: string; functionalId: string };
  deliveries: Array<{ status: string; attempts: number }>;
}

export function TransactionsPage() {
  const nav = useNavigate();
  const { values: f, page, set } = useUrlFilters({ status: '', partnerId: '', type: '', q: '' });
  const partners = usePartners();
  const q = useQuery({
    queryKey: ['transactions', f, page],
    queryFn: () => api<Page<Row>>(`/transactions${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Transaction sets"
        description="Each ST/SE pair is one business document: 832 catalog, 846 inventory advice or 856 ship notice. Follow it from X12 to JSON to the order app."
        actions={<LiveDot />}
      />
      <Card className="gap-0 py-0">
        <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="ST02 or ISA13 control number" onReset={() => set({ status: '', partnerId: '', type: '', q: '' })}>
          <NativeSelect value={f.type} onChange={(v) => set({ type: v })} placeholder="All types" options={TX_TYPES} />
          <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={TRANSACTION_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </FilterBar>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="No transaction sets" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Type</TableHead>
                <TableHead>ST02</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>ICN / GS06</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>997 AK5</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>REST</TableHead>
                <TableHead className="pr-4 text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.items.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => nav(`/edi/transactions/${t.id}`)}>
                  <TableCell className="pl-4">
                    <span className="font-mono font-semibold">{t.type || '?'}</span> <span className="text-muted-foreground text-xs">{TYPE_NAMES[t.type] ?? t.typeName}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.controlNumber}</TableCell>
                  <TableCell>{t.partner?.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link className="text-primary hover:underline" to={`/edi/interchanges/${t.interchange.id}`} onClick={(e) => e.stopPropagation()}>
                      {t.interchange.controlNumber}
                    </Link>{' '}
                    / {t.group.controlNumber}
                  </TableCell>
                  <TableCell className="tabular-nums">{t.itemCount}</TableCell>
                  <TableCell>
                    {t.ackCode ? <Badge variant={statusVariant(t.ackCode)} className="font-mono">{t.ackCode}{t.ak5Codes.length ? ` ${t.ak5Codes.join(',')}` : ''}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{t.errorCount > 0 ? <span className="text-destructive font-medium">{t.errorCount}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell>
                    {t.deliveries[0] ? (
                      <Badge variant={statusVariant(t.deliveries[0].status)}>
                        {statusLabel(t.deliveries[0].status)} · {t.deliveries[0].attempts}×
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground pr-4 text-right text-xs">{fmt.ago(t.receivedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
