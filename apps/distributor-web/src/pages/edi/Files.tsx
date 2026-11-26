import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Eye } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card } from '@edi/ui/components/card';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters, usePartners } from '@/lib/hooks';
import type { ProcessingEvent } from '@/lib/types';
import { EmptyState, ErrorState, Fields, LiveDot, LoadingRows, Mono, NativeSelect, PageHeader, Pagination, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { RawX12 } from '@/components/x12/RawX12';
import { Timeline } from '@/components/x12/Timeline';

interface Row {
  id: string;
  direction: string;
  protocol: string;
  fileName: string;
  remotePath: string;
  archivePath: string | null;
  sizeBytes: number;
  sha256: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  discoveredAt: string;
  transferredAt: string | null;
  processedAt: string | null;
  partner: { id: string; name: string; isaId: string } | null;
  interchanges: Array<{ id: string; controlNumber: string; status: string }>;
  acknowledgments: Array<{ interchangeId: string; type: string }>;
}

/** File details open in a drawer sliding in from the right, so the list stays visible. */
function FileDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['file', id], queryFn: () => api<Row & { content: string | null; events: ProcessingEvent[] }>(`/files/${id}`), enabled: !!id });
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle className="font-mono break-all">{q.data?.fileName ?? 'Loading…'}</DrawerTitle>
          <DrawerDescription>{q.data && `${q.data.direction === 'INBOUND' ? 'Received from' : 'Sent to'} ${q.data.partner?.name ?? '—'} via ${q.data.protocol}`}</DrawerDescription>
        </DrawerHeader>
        {q.isLoading && <div className="text-muted-foreground p-4 text-sm">Loading file…</div>}
        {q.data && (
          <DrawerBody>
            <Fields
              cols={2}
              items={[
                ['Status', <StatusBadge status={q.data.status} />],
                ['Size', fmt.bytes(q.data.sizeBytes)],
                ['Attempts', q.data.attempts],
                ['Transferred', fmt.dateTime(q.data.transferredAt)],
                ['Remote path', <Mono className="text-xs">{q.data.remotePath}</Mono>],
                ['Archive', <Mono className="text-xs">{q.data.archivePath ?? '—'}</Mono>],
                ['SHA-256', <Mono className="text-xs">{q.data.sha256?.slice(0, 20) ?? '—'}</Mono>],
                ['Interchange', q.data.interchanges[0] ? <Link className="text-primary hover:underline" to={`/edi/interchanges/${q.data.interchanges[0].id}`}>{q.data.interchanges[0].controlNumber}</Link> : '—'],
              ]}
            />
            {q.data.lastError && <p className="text-destructive text-sm">Last error: {q.data.lastError}</p>}
            <RawX12 content={q.data.content} maxHeight="max-h-[50vh]" />
            {q.data.events.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold">Transfer events</div>
                <Timeline events={q.data.events} />
              </div>
            )}
          </DrawerBody>
        )}
      </DrawerContent>
    </Drawer>
  );
}

export function FilesPage() {
  const { values: f, page, set } = useUrlFilters({ direction: 'INBOUND', status: '', partnerId: '', q: '' });
  const partners = usePartners();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['files', f, page],
    queryFn: () => api<Page<Row>>(`/files${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  const statuses = f.direction === 'INBOUND' ? ['DISCOVERED', 'RETRYING', 'DOWNLOADED', 'PROCESSED', 'FAILED'] : ['SENT', 'FAILED'];
  return (
    <>
      <PageHeader
        title="FTP transfers"
        description={
          <>
            Producers upload to <Mono>/&lt;producer&gt;/to_distributor/</Mono>; the distributor polls, downloads, archives to <Mono>/archive/</Mono> and drops TA1/997 acknowledgments in <Mono>/from_distributor/</Mono>. Failed downloads are retried.
          </>
        }
        actions={<LiveDot />}
      />
      <Tabs value={f.direction} onValueChange={(v) => set({ direction: v, status: '' })} className="mb-3">
        <TabsList>
          <TabsTrigger value="INBOUND"><ArrowDownToLine /> Inbound (X12 from producers)</TabsTrigger>
          <TabsTrigger value="OUTBOUND"><ArrowUpFromLine /> Outbound (TA1 / 997)</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="gap-0 py-0">
        <FilterBar search={f.q} onSearch={(v) => set({ q: v })} placeholder="File name" onReset={() => set({ status: '', partnerId: '', q: '' })}>
          <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={statuses.map((s) => ({ value: s, label: s.toLowerCase() }))} />
          <NativeSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} placeholder="All producers" options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </FilterBar>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="No transfers" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">File</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>Remote path</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Interchange</TableHead>
                <TableHead>Transferred</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.items.map((r) => {
                const icId = r.interchanges[0]?.id ?? r.acknowledgments[0]?.interchangeId;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[240px] truncate pl-4 font-mono text-xs">{r.fileName}</TableCell>
                    <TableCell>{r.partner?.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[240px] truncate font-mono text-xs">{r.remotePath}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmt.bytes(r.sizeBytes)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.attempts > 1 ? <Badge variant="warning">{r.attempts}</Badge> : r.attempts}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.lastError && <div className="text-destructive max-w-[200px] truncate text-xs" title={r.lastError}>{r.lastError}</div>}
                    </TableCell>
                    <TableCell>
                      {icId ? (
                        <Link className="text-primary font-mono text-xs hover:underline" to={`/edi/interchanges/${icId}`}>
                          {r.interchanges[0]?.controlNumber ?? `${r.acknowledgments[0]?.type} for ICN`}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmt.ago(r.transferredAt ?? r.discoveredAt)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setOpen(r.id)}>
                        <Eye /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <FileDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
