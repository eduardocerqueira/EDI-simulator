import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Package } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent } from '@edi/ui/components/card';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { api, qs, type Order, type Page } from '@/lib/api';
import { date, dateTime, money } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { BillStatusBadge, OrderStatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';

export function OrdersPage() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['orders', { status, page }],
    queryFn: () => api<Page<Order>>(`/orders${qs({ status: status === 'all' ? '' : status, page, pageSize: 15 })}`),
    placeholderData: keepPreviousData,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Your order history. Every order creates a bill and notifies the distributor."
        actions={<Button asChild><Link to="/shop">New order</Link></Button>}
      />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="PLACED">Placed</TabsTrigger>
          <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="py-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !data?.items.length ? (
            <EmptyState icon={Package} title="No orders" description={status === 'all' ? 'You have not placed any orders yet.' : 'No orders with this status.'} className="m-6" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead className="pr-4">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                    <TableCell className="pl-4 font-mono font-medium">{o.orderNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{dateTime(o.createdAt)}</TableCell>
                    <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{o.items.length}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(o.total)}</TableCell>
                    <TableCell>{o.bill ? <span className="flex items-center gap-2"><span className="font-mono text-xs">{o.bill.billNumber}</span><BillStatusBadge status={o.bill.effectiveStatus} /></span> : '—'}</TableCell>
                    <TableCell className="text-muted-foreground pr-4">{o.bill && o.bill.status === 'OPEN' ? date(o.bill.dueDate) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /> Prev</Button>
          <span className="text-sm tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight /></Button>
        </div>
      )}
    </div>
  );
}
