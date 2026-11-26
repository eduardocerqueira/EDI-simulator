import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CheckCircle2, FileText, Loader2, ShoppingBasket, Trash2 } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Label } from '@edi/ui/components/label';
import { Separator } from '@edi/ui/components/separator';
import { Textarea } from '@edi/ui/components/textarea';
import { toast } from '@edi/ui/components/sonner';
import { api, ApiError, type Order } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { date, money } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { CategoryIcon } from '@/components/category-icon';
import { QuantityStepper } from '@/components/quantity-stepper';
import { EmptyState } from '@/components/empty-state';

export function CheckoutPage() {
  const cart = useCart();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [placed, setPlaced] = useState<Order | null>(null);
  const dueEstimate = new Date(Date.now() + 30 * 86400_000);

  const place = useMutation({
    mutationFn: () => api<Order>('/orders', { method: 'POST', json: { items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), notes: notes || undefined } }),
    onSuccess: (order) => {
      setPlaced(order);
      cart.clear();
      setNotes('');
      for (const k of ['orders', 'bills', 'products', 'facets', 'summary']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error('Stock changed', { description: e.message });
        qc.invalidateQueries({ queryKey: ['products'] });
      } else toast.error((e as Error).message);
    },
  });

  if (!cart.lines.length && !placed) {
    return (
      <div>
        <PageHeader title="Checkout" />
        <EmptyState icon={ShoppingBasket} title="Your cart is empty" description="Add products from the catalog to place an order." action={<Button asChild><Link to="/shop">Go to shop</Link></Button>} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Checkout"
        description="Review your order. A bill is issued automatically with Net 30 payment terms."
        actions={<Button variant="ghost" asChild><Link to="/shop"><ArrowLeft /> Continue shopping</Link></Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Order lines</CardTitle>
            <CardDescription>{cart.lines.length} product(s) · {cart.count} unit(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {cart.lines.map((l) => (
                <li key={l.productId} className="flex flex-wrap items-center gap-4 py-4 first:pt-0">
                  <CategoryIcon category={l.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-muted-foreground text-xs">{l.producerName} · {money(l.price)} / {l.uom} · {l.available} available</p>
                  </div>
                  <QuantityStepper value={l.quantity} max={l.available} onChange={(v) => cart.setQuantity(l.productId, v)} />
                  <p className="w-24 text-right font-semibold tabular-nums">{money(l.price * l.quantity)}</p>
                  <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => cart.remove(l.productId)} aria-label="Remove"><Trash2 /></Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{money(cart.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>Included</span></div>
              <Separator />
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(cart.total)}</span></div>
            </div>
            <div className="bg-muted/50 flex gap-3 rounded-none border p-3 text-sm">
              <CalendarClock className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Net 30 terms</p>
                <p className="text-muted-foreground text-xs">Your bill will be due around {date(dueEstimate)}.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Delivery notes</Label>
              <Textarea id="notes" placeholder="e.g. Deliver to back entrance before 7am" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button size="lg" className="w-full" onClick={() => place.mutate()} disabled={place.isPending || !cart.lines.length}>
              {place.isPending && <Loader2 className="animate-spin" />} Place order · {money(cart.total)}
            </Button>
            <p className="text-muted-foreground text-center text-xs">Stock is reserved immediately and the distributor is notified.</p>
          </CardFooter>
        </Card>
      </div>

      <Drawer open={!!placed} onOpenChange={(o) => { if (!o) { setPlaced(null); navigate('/orders'); } }}>
        <DrawerContent size="sm">
          <DrawerHeader className="items-center pt-8 text-center">
            <div className="bg-success/15 text-success mb-2 flex size-14 items-center justify-center rounded-none"><CheckCircle2 className="size-8" /></div>
            <DrawerTitle className="text-xl">Order placed!</DrawerTitle>
            <DrawerDescription>Thank you — your order has been sent to Harvest Hub Distribution.</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
          {placed && (
            <div className="grid gap-3 rounded-none border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Order number</span><span className="font-mono font-medium">{placed.orderNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold tabular-nums">{money(placed.total)}</span></div>
              {placed.bill && (
                <>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1.5"><FileText className="size-4" /> Bill</span><span className="font-mono">{placed.bill.billNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Due date (Net 30)</span><span className="font-medium">{date(placed.bill.dueDate)}</span></div>
                </>
              )}
            </div>
          )}
          </DrawerBody>
          <DrawerFooter>
            <Button variant="outline" onClick={() => { setPlaced(null); navigate('/shop'); }}>Keep shopping</Button>
            <Button onClick={() => { const id = placed?.id; setPlaced(null); navigate(id ? `/orders/${id}` : '/orders'); }}>View order</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
