import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent } from '@edi/ui/components/card';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { api, qs, type Page } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useUrlFilters } from '@/lib/hooks';
import { statusVariant } from '@/lib/status';
import type { Acknowledgment } from '@/lib/types';
import { EmptyState, ErrorState, LoadingRows, NativeSelect, PageHeader, Pagination, StatusBadge } from '@/components/common';
import { FilterBar } from '@/components/FilterBar';
import { RawX12 } from '@/components/x12/RawX12';

export function AcksPage() {
  const { values: f, page, set } = useUrlFilters({ type: '', status: '' });
  const [open, setOpen] = useState<Acknowledgment | null>(null);
  const q = useQuery({
    queryKey: ['acks', f, page],
    queryFn: () => api<Page<Acknowledgment>>(`/acks${qs({ ...f, page, pageSize: 25 })}`),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Acknowledgments"
        description="What the distributor tells each producer: a TA1 for the interchange envelope (when rejected or requested by ISA14=1) and a 997 Functional Acknowledgment with AK9/AK5/AK3/AK4 details for each functional group."
      />
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card className="py-4">
          <CardContent className="px-4 text-sm">
            <div className="mb-1 font-semibold">TA1 — Interchange Acknowledgment</div>
            <code className="bg-muted block rounded p-2 font-mono text-xs">TA1*000001234*261125*1430*R*001~</code>
            <p className="text-muted-foreground mt-2 text-xs">TA101 = original ISA13 · TA102/03 = original date/time · TA104 = A/E/R · TA105 = note code (001 = ICN mismatch, 006 = invalid sender, 025 = duplicate…)</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 text-sm">
            <div className="mb-1 font-semibold">997 — Functional Acknowledgment</div>
            <code className="bg-muted block rounded p-2 font-mono text-xs whitespace-pre">{'AK1*IB*1235~  AK2*846*0001~\nAK3*LIN*7*LIN*8~  AK4*2*235*7*XX~\nAK5*R*5~  AK9*R*1*1*0~'}</code>
            <p className="text-muted-foreground mt-2 text-xs">AK1 = group acknowledged · AK2 = transaction set · AK3 = bad segment · AK4 = bad element · AK5 = set verdict · AK9 = group verdict</p>
          </CardContent>
        </Card>
      </div>
      <Card className="gap-0 py-0">
        <FilterBar onReset={() => set({ type: '', status: '' })}>
          <NativeSelect value={f.type} onChange={(v) => set({ type: v })} placeholder="TA1 + 997" options={[{ value: 'TA1', label: 'TA1' }, { value: '997', label: '997' }]} />
          <NativeSelect value={f.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={['PENDING', 'SENT', 'FAILED'].map((s) => ({ value: s, label: s.toLowerCase() }))} />
        </FilterBar>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <div className="p-4"><ErrorState error={q.error} /></div>
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="No acknowledgments yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Type</TableHead>
                <TableHead>Ack code</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>For ICN</TableHead>
                <TableHead>Ack ICN</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data!.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-4 font-mono font-semibold">{a.type}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(a.ackCode.length === 1 ? a.ackCode : a.ackCode.includes('R') ? 'R' : 'A')} className="font-mono">{a.ackCode}</Badge>
                  </TableCell>
                  <TableCell>{a.interchange?.partner?.name}</TableCell>
                  <TableCell>
                    <Link to={`/edi/interchanges/${a.interchangeId}`} className="text-primary font-mono text-xs hover:underline">{a.interchange?.controlNumber || '—'}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.controlNumber}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px] truncate font-mono text-xs">{a.fileName}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{a.sentAt ? fmt.ago(a.sentAt) : `${a.attempts} attempt(s)`}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpen(a)}><Eye /> View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />}
      </Card>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent size="lg">
          <DrawerHeader>
            <DrawerTitle className="font-mono break-all">{open?.fileName}</DrawerTitle>
            <DrawerDescription className="font-mono text-xs break-all">{open?.remotePath}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <RawX12 content={open?.content} maxHeight="max-h-[75vh]" />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
