import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpen, Boxes, ChevronsLeft, ChevronsRight, FileStack, FileText, Gauge, LayoutDashboard,
  HardDrive, LogOut, Mail, Menu, Moon, Package, Receipt, ScanSearch, Send, ServerCog, ShoppingCart, Sun, Truck, Users, Workflow, type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@edi/ui/components/avatar';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@edi/ui/components/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@edi/ui/components/popover';
import { Sheet, SheetContent, SheetTitle } from '@edi/ui/components/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { statusVariant } from '@/lib/status';
import type { PlatformOverview } from '@/lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/kpis', label: 'KPIs & Observability', icon: Gauge },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    section: 'EDI Gateway',
    items: [
      { to: '/edi/interchanges', label: 'Interchanges', icon: Mail },
      { to: '/edi/transactions', label: 'Transactions', icon: FileStack },
      { to: '/edi/files', label: 'FTP Transfers', icon: Workflow },
      { to: '/edi/validation', label: 'Validation', icon: AlertTriangle },
      { to: '/edi/deliveries', label: 'API Deliveries', icon: Send },
      { to: '/edi/acks', label: 'Acknowledgments', icon: FileText },
    ],
  },
  {
    section: 'Platform',
    items: [
      { to: '/platform', label: 'FTP Cluster', icon: ServerCog, end: true },
      { to: '/platform/storage', label: 'Storage', icon: HardDrive },
    ],
  },
  {
    section: 'Supply',
    items: [
      { to: '/partners', label: 'Producers', icon: Truck },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    section: 'Commerce',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/orders', label: 'Orders', icon: ShoppingCart },
      { to: '/bills', label: 'Billing', icon: Receipt },
    ],
  },
  {
    section: 'Learn X12',
    items: [
      { to: '/x12/inspector', label: 'X12 Inspector', icon: ScanSearch },
      { to: '/x12/reference', label: 'X12 Reference', icon: BookOpen },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1">
      <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm">
        <Package className="size-4.5" />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-sm font-semibold">Harvest Hub</div>
          <div className="text-muted-foreground text-[11px]">EDI Control Center</div>
        </div>
      )}
    </Link>
  );
}

/** Small health summary of the FTP cluster for the sidebar badge. */
interface PlatformHealth {
  ready: number;
  desired: number;
  firing: number;
  reachable: boolean;
}

function PlatformBadge({ health, collapsed }: { health?: PlatformHealth; collapsed?: boolean }) {
  if (!health) return null;
  const degraded = !health.reachable || health.ready < health.desired;
  const bad = degraded || health.firing > 0;
  const label = !health.reachable ? '!' : degraded ? `${health.ready}/${health.desired}` : health.firing ? String(health.firing) : '';
  if (collapsed || !bad) {
    return <span className={cn('size-2 rounded-full', collapsed ? 'absolute top-1 right-1' : 'ml-auto', bad ? 'bg-destructive animate-pulse' : 'bg-success')} />;
  }
  return <span className={cn('ml-auto rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white', degraded ? 'bg-destructive' : 'bg-warning')}>{label}</span>;
}

function NavList({ collapsed, unread, platform, onNavigate }: { collapsed?: boolean; unread: number; platform?: PlatformHealth; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((g) => (
        <div key={g.section}>
          {!collapsed && <div className="text-muted-foreground mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase">{g.section}</div>}
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-2',
                      isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {item.to === '/platform' && <PlatformBadge health={platform} collapsed={collapsed} />}
                  {item.to === '/notifications' && unread > 0 && (
                    <span className={cn('bg-destructive rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white', collapsed ? 'absolute top-0.5 right-0.5' : 'ml-auto')}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

interface NotificationRow {
  id: string;
  type?: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  interchangeId?: string | null;
  transactionId?: string | null;
}

function NotificationBell({ unread, items }: { unread: number; items: NotificationRow[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {unread > 0 && (
            <span className="bg-destructive absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold text-white">{unread > 99 ? '99+' : unread}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">Notifications</div>
          <Badge variant="muted">{unread} unread</Badge>
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {items.length === 0 && <div className="text-muted-foreground p-6 text-center text-sm">You're all caught up 🎉</div>}
          {items.map((n) => (
            <Link
              key={n.id}
              to={n.type?.startsWith('platform.') ? '/platform' : n.transactionId ? `/edi/transactions/${n.transactionId}` : n.interchangeId ? `/edi/interchanges/${n.interchangeId}` : '/notifications'}
              className="hover:bg-muted/60 block border-b px-4 py-3 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className={cn('size-2 shrink-0 rounded-full', { destructive: 'bg-destructive', warning: 'bg-warning', info: 'bg-info' }[statusVariant(n.severity) as string] ?? 'bg-muted-foreground')} />
                <span className="truncate text-sm font-medium">{n.title}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">{fmt.ago(n.createdAt)}</span>
              </div>
              <div className="text-muted-foreground mt-0.5 line-clamp-2 pl-4 text-xs">{n.message}</div>
            </Link>
          ))}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/notifications">Open notification center</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [dark, setDark] = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    try {
      localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const notif = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api<{ items: NotificationRow[]; unread: number }>('/notifications?unread=true&pageSize=8'),
    refetchInterval: 5000,
  });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ status: string; rabbitmq: boolean; db: boolean }>('/health'), refetchInterval: 15000 });
  const platformQ = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api<PlatformOverview>('/platform/overview'), refetchInterval: 5000 });
  const platform: PlatformHealth | undefined = platformQ.data
    ? {
        reachable: platformQ.data.controller.reachable,
        ready: platformQ.data.controller.reachable ? platformQ.data.controller.readyNodes : 0,
        desired: platformQ.data.controller.reachable ? platformQ.data.controller.desiredNodes : 0,
        firing: platformQ.data.prometheus.alerts.filter((a) => a.state === 'firing').length,
      }
    : undefined;
  const unread = notif.data?.unread ?? 0;
  const initials = (user?.name ?? 'A').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-background flex min-h-screen">
      <aside className={cn('bg-sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 lg:flex', collapsed ? 'w-16' : 'w-64')}>
        <div className={cn('flex h-14 items-center border-b px-3', collapsed && 'justify-center')}>
          <Brand collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-4">
          <NavList collapsed={collapsed} unread={unread} platform={platform} />
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ChevronsRight /> : (<><ChevronsLeft /> Collapse</>)}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-sidebar w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-4">
            <Brand />
          </div>
          <div className="overflow-y-auto overscroll-contain px-2 py-4">
            <NavList unread={unread} platform={platform} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="text-muted-foreground hidden items-center gap-2 text-sm md:flex">
            <Activity className="size-4" />
            <span>Distributor · ISA ID</span>
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">ZZ:HARVESTHUB</code>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-muted-foreground mr-2 hidden items-center gap-3 text-xs sm:flex">
                  <span className="flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', health.data?.db ? 'bg-success' : 'bg-destructive')} /> DB
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', health.data?.rabbitmq ? 'bg-success' : 'bg-destructive')} /> RabbitMQ
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Service health (polled every 15s)</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
              {dark ? <Sun /> : <Moon />}
            </Button>
            <NotificationBell unread={unread} items={notif.data?.items ?? []} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary/15 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm">{user?.name}</div>
                  <div className="text-muted-foreground text-xs font-normal">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/kpis">
                    <Gauge /> Observability
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} variant="destructive">
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main key={loc.pathname.split('/').slice(0, 3).join('/')} className="animate-in fade-in-0 mx-auto w-full max-w-[1500px] flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
