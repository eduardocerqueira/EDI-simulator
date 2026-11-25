import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge } from '@edi/ui/components/badge';
import { Card } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters, usePartners } from '@/lib/hooks';
import { INTERCHANGE_STATUSES, statusLabel, statusVariant, TX_TYPES } from '@/lib/status';
import { EmptyState, ErrorState, LiveDot, LoadingRows, NativeSelect, PageHeader, Pagination, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';

interface Row {
  id: string;
  controlNumber: string;
  senderId: string;
  receiverId: string;
  status: string;
  ta1AckCode: string | null;
  ta1NoteCode: string | null;
  groupCount: number;
  transactionCount: number;
  acceptedCount: number;
  errorCount: number;
  processingMs: number | null;
  usageIndicator: string;
  receivedAt: string;
  partner: { id: string; name: string; isaId: string } | null;
  fileTransfer: { fileName: string; sizeBytes: number };
  transactions: Array<{ type: string; status: string }>;
  acknowledgments: Array<{ type: string; ackCode: string; status: string }>;
}

export function InterchangesPage() {
  const nav = useNavigate();
  const { values: f, page, set } = useUrlFilters({ status: '', partnerId: '', type: '', q: '' });
  const partners = usePartners();
  const q = useQuery({
    queryKey: ['interchanges', f, page],
    queryFn: () => api<Page<Row>>(`/interchanges${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Interchanges"
        description="Every file received over FTP is one interchange — an ISA/IEA envelope containing GS/GE functional groups, which contain ST/SE transaction sets. Click a row to trace it end to end."
        actions={<LiveDot />}
      />
      <Card className="gap-0 py-0">
        <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="ICN, sender or file name" onReset={() => set({ status: '', partnerId: '', type: '', q: '' })}>
          <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={INTERCHANGE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <NativeSelect value={f.type} onChange={(v) => set({ type: v })} placeholder="All types" options={TX_TYPES} />
        </FilterBar>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="No interchanges" description="Nothing matches these filters yet. Start the producer simulator to send X12 files." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">ICN (ISA13)</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Transaction sets</TableHead>
                <TableHead>Accepted</TableHead>
                <TableHead>Acks</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Took</TableHead>
                <TableHead className="pr-4 text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.items.map((ic) => (
                <TableRow key={ic.id} className="cursor-pointer" onClick={() => nav(`/edi/interchanges/${ic.id}`)}>
                  <TableCell className="pl-4">
                    <Link to={`/edi/interchanges/${ic.id}`} className="text-primary font-mono text-xs font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {ic.controlNumber || '(unreadable)'}
                    </Link>
                    {ic.usageIndicator === 'T' && <Badge variant="muted" className="ml-1.5">test</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{ic.partner?.name}</div>
                    <div className="text-muted-foreground font-mono text-xs">{ic.senderId || ic.partner?.isaId}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate font-mono text-xs">{ic.fileTransfer.fileName}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ic.transactions.map((t, i) => (
                        <Badge key={i} variant={statusVariant(t.status)} className="font-mono" title={statusLabel(t.status)}>{t.type || '?'}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{ic.acceptedCount}/{ic.transactionCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {ic.acknowledgments.map((a, i) => (
                        <Badge key={i} variant={statusVariant(a.ackCode.length === 1 ? a.ackCode : a.ackCode.includes('R') ? 'R' : 'A')} className="font-mono">
                          {a.type} {a.ackCode}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{ic.errorCount > 0 ? <span className="text-destructive font-medium">{ic.errorCount}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                  <TableCell><StatusBadge status={ic.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmt.ms(ic.processingMs)}</TableCell>
                  <TableCell className="text-muted-foreground pr-4 text-right text-xs" title={fmt.dateTime(ic.receivedAt)}>{fmt.ago(ic.receivedAt)}</TableCell>
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
