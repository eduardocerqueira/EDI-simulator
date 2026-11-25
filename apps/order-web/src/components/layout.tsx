import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, LayoutDashboard, LogOut, Menu, Moon, Receipt, ShoppingBasket, Store, Sun, Package } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { Avatar, AvatarFallback } from '@edi/ui/components/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@edi/ui/components/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@edi/ui/components/sheet';
import { cn } from '@edi/ui/lib/utils';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useTheme } from '@/lib/theme';
import { initials } from '@/lib/format';
import { CartSheet } from './cart-sheet';
import { Logo } from './logo';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/shop', label: 'Shop', icon: Store },
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

export function AppLayout() {
  const { user, loading, logout } = useAuth();
  const cart = useCart();
  const theme = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Logo className="animate-pulse" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="bg-muted/30 min-h-svh">
      <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Link to="/" className="shrink-0"><Logo /></Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')
                }
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={theme.toggle} aria-label="Toggle theme">
              {theme.dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="outline" className="relative" onClick={() => cart.setOpen(true)}>
              <ShoppingBasket />
              <span className="hidden sm:inline">Cart</span>
              {cart.count > 0 && (
                <span className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums">
                  {cart.count > 99 ? '99+' : cart.count}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/15 text-primary">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight lg:block">
                    <span className="block text-sm font-medium">{user.name}</span>
                    <span className="text-muted-foreground block text-xs">{user.company ?? user.email}</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-muted-foreground text-xs font-normal">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/orders"><Package /> My orders</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/bills"><Receipt /> My bills</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={logout}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader className="border-b">
            <SheetTitle><Logo /></SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-3">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium', isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent')}
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <footer className="text-muted-foreground mx-auto max-w-7xl px-6 pb-8 text-center text-xs">
        Harvest Market · inventory supplied by Harvest Hub Distribution via ANSI X12 EDI (832 / 846 / 856)
      </footer>
      <CartSheet />
    </div>
  );
}
