import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, CircleDot, FileText, Info, Radio, XCircle } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Separator } from '@edi/ui/components/separator';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { toast } from '@edi/ui/components/sonner';
import { api, type Order } from '@/lib/api';
import { date, dateTime, daysUntil, money } from '@/lib/format';
import { BillStatusBadge, OrderStatusBadge } from '@/components/status-badge';
import { CategoryIcon } from '@/components/category-icon';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const { data: o, isLoading, error } = useQuery({ queryKey: ['orders', id], queryFn: () => api<Order>(`/orders/${id}`) });

  const cancel = useMutation({
    mutationFn: () => api<Order>(`/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(`Order ${r.orderNumber} cancelled`, { description: 'Stock released and the distributor has been notified.' });
      setConfirm(false);
      for (const k of ['orders', 'bills', 'products', 'facets', 'summary']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-80 w-full" /></div>;
  if (error || !o) return <EmptyState icon={XCircle} title="Order not found" action={<Button asChild variant="outline"><Link to="/orders">Back to orders</Link></Button>} />;

  const paid = o.bill?.status === 'PAID';
  const canCancel = o.status === 'PLACED' && !paid;
  const bill = o.bill;

  const timeline = [
    { icon: CircleDot, title: 'Order placed', at: o.createdAt, text: `${o.items.length} line(s), stock reserved`, tone: 'text-primary' },
    { icon: FileText, title: `Bill ${bill?.billNumber ?? ''} issued`, at: bill?.issuedAt ?? o.createdAt, text: bill ? `Due ${date(bill.dueDate)} (Net 30)` : '', tone: 'text-info' },
    { icon: Radio, title: 'Distributor notified', at: o.createdAt, text: 'order.created event published to RabbitMQ', tone: 'text-muted-foreground' },
    ...(o.status === 'CANCELLED' ? [{ icon: Ban, title: 'Order cancelled', at: o.cancelledAt ?? o.createdAt, text: 'Stock released, bill voided, order.cancelled published', tone: 'text-destructive' }] : []),
    ...(bill?.paidAt ? [{ icon: CheckCircle2, title: 'Bill paid', at: bill.paidAt, text: money(bill.amount), tone: 'text-success' }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-1"><Link to="/orders"><ArrowLeft /> Orders</Link></Button>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{o.orderNumber}</h1>
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Placed {dateTime(o.createdAt)}{o.cancelledAt ? ` · cancelled ${dateTime(o.cancelledAt)}` : ''}</p>
        </div>
        {o.status === 'PLACED' && (
          <Button variant="outline" className="text-destructive hover:text-destructive" disabled={!canCancel} onClick={() => setConfirm(true)} title={paid ? 'Paid orders cannot be cancelled' : undefined}>
            <Ban /> Cancel order
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>Products are sourced from partner farms through the distributor's EDI feed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <CategoryIcon category={i.product?.category ?? ''} size="sm" />
                        <div>
                          <p className="font-medium">{i.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {i.product?.producerName} · SKU {i.sku}{i.product?.sourceEnvelopeIcn ? ` · EDI ICN ${i.product.sourceEnvelopeIcn}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.quantity} {i.uom}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(i.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(i.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">Total</TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            {o.notes && (
              <div className="bg-muted/50 mt-4 rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Notes</p>
                {o.notes}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="size-5" /> Bill</CardTitle>
            </CardHeader>
            <CardContent>
              {bill ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between"><span className="font-mono">{bill.billNumber}</span><BillStatusBadge status={bill.effectiveStatus} /></div>
                  <p className="text-2xl font-semibold tabular-nums">{money(bill.amount)}</p>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Issued</span><span>{date(bill.issuedAt)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{date(bill.dueDate)}</span></div>
                  {bill.status === 'OPEN' && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Terms</span><span>{daysUntil(bill.dueDate) >= 0 ? `${daysUntil(bill.dueDate)} day(s) left` : `${-daysUntil(bill.dueDate)} day(s) overdue`}</span></div>
                  )}
                  {bill.paidAt && <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{date(bill.paidAt)}</span></div>}
                  {bill.status === 'OPEN' && <Button variant="outline" className="mt-2 w-full" asChild><Link to="/bills">Pay this bill</Link></Button>}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No bill.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l pl-5">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className="bg-background absolute top-0.5 -left-[29px] flex size-4 items-center justify-center rounded-full">
                      <t.icon className={`size-4 ${t.tone}`} />
                    </span>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-muted-foreground text-xs">{dateTime(t.at)}{t.text ? ` · ${t.text}` : ''}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel order ${o.orderNumber}?`}
        destructive
        confirmLabel="Cancel order"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        description={
          <div className="space-y-2">
            <p>This will cancel the order for {money(o.total)}.</p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              <li>Reserved stock is released back to the inventory</li>
              <li>Bill {bill?.billNumber} is voided</li>
              <li>The distributor is notified via an <code className="font-mono">order.cancelled</code> event</li>
            </ul>
          </div>
        }
      >
        <div className="bg-muted/50 flex gap-2 rounded-md border p-3 text-xs"><Info className="size-4 shrink-0" /> This cannot be undone.</div>
      </ConfirmDialog>
    </div>
  );
}
