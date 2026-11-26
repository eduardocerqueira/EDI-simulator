import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, HardDrive, ServerCog, Zap } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { cn } from '@edi/ui/lib/utils';
import { ErrorState, LiveDot, LoadingPage, PageHeader } from '@/components/common';
import { ChaosDrawer } from '@/components/platform/ChaosDrawer';
import { usePlatformOverview } from '@/lib/platform';
import type { PlatformNode, PlatformOverview } from '@/lib/types';

export interface PlatformContext {
  data: PlatformOverview;
  openChaos: (node?: PlatformNode) => void;
}

export const usePlatformContext = () => useOutletContext<PlatformContext>();

export function CountBadge({ n, tone = 'secondary' }: { n: number; tone?: 'secondary' | 'destructive' | 'warning' | 'success' }) {
  if (!n) return null;
  return (
    <Badge variant={tone} className="h-5 min-w-5 rounded-none px-1.5 tabular-nums">
      {n}
    </Badge>
  );
}

function SectionTab({ to, end, icon: Icon, label, status }: { to: string; end?: boolean; icon: typeof ServerCog; label: string; status?: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          '-mb-px inline-flex items-center gap-2 border-b-2 px-4 pt-1 pb-3 text-sm font-medium whitespace-nowrap transition-colors',
          isActive ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground hover:border-border border-transparent',
        )
      }
    >
      <Icon className="size-4" />
      {label}
      {status}
    </NavLink>
  );
}

/** Platform area: one page, with the FTP cluster and the shared storage as top-level tabs (each with its own sub-tabs). */
export function PlatformPage() {
  const q = usePlatformOverview(2000);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [chaosOpen, setChaosOpen] = useState(false);
  const [chaosNode, setChaosNode] = useState<PlatformNode | undefined>();

  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const data = q.data!;
  const c = data.controller.reachable ? data.controller : undefined;
  const firing = data.prometheus.alerts.filter((a) => a.state === 'firing').length;
  const fresh = c?.storage.totals.fresh ?? 0;
  const openChaos = (node?: PlatformNode) => {
    setChaosNode(node);
    setChaosOpen(true);
  };
  const onAlertsTab = location.pathname.replace(/\/$/, '') === '/platform' && params.get('tab') === 'alerts';

  const clusterStatus = c ? (
    <Badge variant={c.readyNodes === c.desiredNodes ? 'success' : c.readyNodes === 0 ? 'destructive' : 'warning'} className="tabular-nums">
      {c.readyNodes}/{c.desiredNodes} ready
    </Badge>
  ) : (
    <Badge variant="destructive">unknown</Badge>
  );
  const storageStatus = c ? (
    <Badge variant={fresh > 25 ? 'warning' : 'secondary'} className="tabular-nums">
      {fresh} fresh
    </Badge>
  ) : null;

  return (
    <>
      <PageHeader
        title="Platform"
        description={
          <>
            The highly available FTP platform behind <code className="font-mono">ftp:21</code>: an HAProxy load balancer in front of three vsftpd nodes that
            share one storage volume. The platform controller replaces any node that stops answering, and Prometheus watches the load balancer and the
            controller.
          </>
        }
        actions={
          <>
            <LiveDot label="Live · 2s" />
            <Button asChild variant="outline" size="sm">
              <a href="http://localhost:8404" target="_blank" rel="noreferrer">
                HAProxy stats <ExternalLink />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="http://localhost:9090/alerts" target="_blank" rel="noreferrer">
                Prometheus <ExternalLink />
              </a>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => openChaos(undefined)} disabled={!c}>
              <Zap /> Simulate failure on a random node
            </Button>
          </>
        }
      />

      <nav aria-label="Platform sections" className="mb-6 flex gap-1 overflow-x-auto border-b">
        <SectionTab to="/platform" end icon={ServerCog} label="FTP Cluster" status={clusterStatus} />
        <SectionTab to="/platform/storage" icon={HardDrive} label="Storage" status={storageStatus} />
      </nav>

      <Outlet context={{ data, openChaos } satisfies PlatformContext} />

      {c && firing > 0 && !onAlertsTab && (
        <button
          onClick={() => navigate('/platform?tab=alerts')}
          className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 fixed right-6 bottom-6 z-40 flex cursor-pointer items-center gap-2 rounded-none border px-4 py-2 text-sm shadow-lg backdrop-blur"
        >
          <AlertTriangle className="size-4" /> {firing} alert(s) firing
        </button>
      )}

      <ChaosDrawer open={chaosOpen} onOpenChange={setChaosOpen} node={chaosNode} />
    </>
  );
}
