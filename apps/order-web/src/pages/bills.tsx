import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CreditCard, Receipt, Wallet } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent } from '@edi/ui/components/card';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tabs, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { toast } from '@edi/ui/components/sonner';
import { cn } from '@edi/ui/lib/utils';
import { api, type Bill } from '@/lib/api';
import { date, daysUntil, money } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { BillStatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';

export function BillsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [paying, setPaying] = useState<Bill | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['bills'], queryFn: () => api<Bill[]>('/bills'), refetchInterval: 20_000 });

  const pay = useMutation({
    mutationFn: (b: Bill) => api<Bill>(`/bills/${b.id}/pay`, { method: 'POST' }),
    onSuccess: (b) => {
      toast.success(`Bill ${b.billNumber} paid`, { description: `${money(b.amount)} — the distributor has been notified.` });
      setPaying(null);
      for (const k of ['bills', 'orders', 'summary']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bills = data ?? [];
  const sum = (xs: Bill[]) => xs.reduce((n, b) => n + b.amount, 0);
  const open = bills.filter((b) => b.status === 'OPEN');
  const overdue = bills.filter((b) => b.effectiveStatus === 'OVERDUE');
  const paid = bills.filter((b) => b.status === 'PAID');
  const shown = useMemo(() => (filter === 'all' ? bills : bills.filter((b) => b.effectiveStatus === filter)), [bills, filter]);

  return (
    <div>
      <PageHeader title="Bills" description="Every order generates a bill payable within 30 days (Net 30)." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard loading={isLoading} label="Outstanding" value={money(sum(open))} hint={`${open.length} open bill(s)`} icon={Wallet} tone="info" />
        <StatCard loading={isLoading} label="Overdue" value={money(sum(overdue))} hint={overdue.length ? `${overdue.length} past due date` : 'Nothing overdue'} icon={AlertTriangle} tone={overdue.length ? 'destructive' : 'warning'} />
        <StatCard loading={isLoading} label="Paid to date" value={money(sum(paid))} hint={`${paid.length} bill(s) settled`} icon={CheckCircle2} tone="success" />
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All ({bills.length})</TabsTrigger>
          <TabsTrigger value="OPEN">Open</TabsTrigger>
          <TabsTrigger value="OVERDUE">Overdue {overdue.length ? `(${overdue.length})` : ''}</TabsTrigger>
          <TabsTrigger value="PAID">Paid</TabsTrigger>
          <TabsTrigger value="CANCELLED">Voided</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="py-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !shown.length ? (
            <EmptyState icon={Receipt} title="No bills here" description="Bills appear automatically when you place orders." className="m-6" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Bill</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((b) => {
                  const d = daysUntil(b.dueDate);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="pl-4 font-mono font-medium">{b.billNumber}</TableCell>
                      <TableCell>{b.order ? <Link className="text-primary font-mono hover:underline" to={`/orders/${b.order.id}`}>{b.order.orderNumber}</Link> : '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{date(b.issuedAt)}</TableCell>
                      <TableCell>{date(b.dueDate)}</TableCell>
                      <TableCell>
                        {b.status === 'OPEN' ? (
                          <span className={cn('text-xs font-medium', d < 0 ? 'text-destructive' : d <= 7 ? 'text-[oklch(0.55_0.13_70)] dark:text-warning' : 'text-muted-foreground')}>
                            {d < 0 ? `${-d} day(s) overdue` : d === 0 ? 'Due today' : `Due in ${d} day(s)`}
                          </span>
                        ) : b.paidAt ? (
                          <span className="text-muted-foreground text-xs">Paid {date(b.paidAt)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell><BillStatusBadge status={b.effectiveStatus} /></TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(b.amount)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        {b.status === 'OPEN' ? (
                          <Button size="sm" variant={b.effectiveStatus === 'OVERDUE' ? 'destructive' : 'default'} onClick={() => setPaying(b)}><CreditCard /> Pay</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        title={`Pay bill ${paying?.billNumber ?? ''}?`}
        confirmLabel={`Pay ${money(paying?.amount)}`}
        loading={pay.isPending}
        onConfirm={() => paying && pay.mutate(paying)}
        description={paying ? <>This marks {paying.billNumber} for order {paying.order?.orderNumber} as paid. This is a simulation — no real payment is taken.</> : null}
      />
    </div>
  );
}
