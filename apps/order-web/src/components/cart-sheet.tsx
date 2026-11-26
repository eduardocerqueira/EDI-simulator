import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBasket, Trash2, ArrowRight } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { Separator } from '@edi/ui/components/separator';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@edi/ui/components/sheet';
import { useCart } from '@/lib/cart';
import { money } from '@/lib/format';
import { CategoryIcon } from './category-icon';
import { QuantityStepper } from './quantity-stepper';
import { EmptyState } from './empty-state';

export function CartSheet() {
  const cart = useCart();
  const navigate = useNavigate();
  return (
    <Sheet open={cart.open} onOpenChange={cart.setOpen}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2"><ShoppingBasket className="size-5" /> Your cart</SheetTitle>
          <SheetDescription>{cart.count ? `${cart.lines.length} product(s), ${cart.count} unit(s)` : 'Nothing here yet'}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {cart.lines.length === 0 ? (
            <EmptyState
              icon={ShoppingBasket}
              title="Your cart is empty"
              description="Browse fresh produce, dairy, meat and pantry goods from our 10 partner farms."
              action={<Button asChild onClick={() => cart.setOpen(false)}><Link to="/shop">Start shopping</Link></Button>}
            />
          ) : (
            <ul className="space-y-4">
              {cart.lines.map((l) => (
                <li key={l.productId} className="flex gap-3">
                  <CategoryIcon category={l.category} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-muted-foreground truncate text-xs">{l.producerName} · {money(l.price)} / {l.uom}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground size-7" onClick={() => cart.remove(l.productId)} aria-label="Remove">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <QuantityStepper size="sm" value={l.quantity} max={l.available} onChange={(v) => cart.setQuantity(l.productId, v)} />
                      <span className="text-sm font-semibold tabular-nums">{money(l.price * l.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {cart.lines.length > 0 && (
          <SheetFooter className="border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums">{money(cart.total)}</span>
            </div>
            <p className="text-muted-foreground text-xs">Invoiced on Net 30 terms — a bill is created with your order.</p>
            <Separator className="my-1" />
            <Button size="lg" onClick={() => { cart.setOpen(false); navigate('/checkout'); }}>
              Checkout <ArrowRight />
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
