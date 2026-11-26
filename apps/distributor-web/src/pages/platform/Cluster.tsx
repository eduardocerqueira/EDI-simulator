import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, BellRing, Database, ExternalLink, HardDrive, Network, RefreshCcw, Server, ServerCrash, Timer, Zap,
} from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import type { ChartConfig } from '@edi/ui/components/chart';
import { cn } from '@edi/ui/lib/utils';
import { EmptyState, ErrorState, LiveDot, LoadingPage, NativeSelect, PageHeader, RangeSelect, StatCard } from '@/components/common';
import { ChaosDrawer } from '@/components/platform/ChaosDrawer';
import { EventTimeline } from '@/components/platform/EventTimeline';
import { NodeCard } from '@/components/platform/NodeCard';
import { TimeChart } from '@/components/platform/TimeChart';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { bytes, nodeColor, rate, toneDot, usePlatformOverview, usePlatformTimeseries } from '@/lib/platform';
import type { PlatformNode, PlatformOverview } from '@/lib/types';

const SEV_VARIANT: Record<string, 'destructive' | 'warning' | 'info'> = { ERROR: 'destructive', WARNING: 'warning', INFO: 'info' };

function ArchitectureStrip() {
  const step = (icon: typeof Server, title: string, sub: string) => {
    const Icon = icon;
    return (
      <div className="bg-background/60 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2">
        <Icon className="text-primary size-4 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="text-muted-foreground truncate text-xs">{sub}</div>
        </div>
      </div>
    );
  };
  const arrow = <ArrowRight className="text-muted-foreground hidden size-4 shrink-0 md:block" />;
  return (
    <div className="bg-muted/40 mb-6 flex flex-col gap-2 rounded-xl border p-3 md:flex-row md:items-center">
      {step(Network, 'HAProxy load balancer', 'service "ftp" · :21 + passive ranges')}
      {arrow}
      {step(Server, '3 FTP nodes (vsftpd)', 'one passive range per node')}
      {arrow}
      {step(HardDrive, 'Shared storage volume', 'every node mounts the mailboxes')}
      {arrow}
      {step(RefreshCcw, 'Platform controller', 'probes · self-heals · RabbitMQ events')}
      {arrow}
      {step(Activity, 'Prometheus', 'scrapes · alert rules')}
    </div>
  );
}

function KpiStrip({ data }: { data: PlatformOverview }) {
  const c = data.controller.reachable ? data.controller : undefined;
  const ready = c?.readyNodes ?? 0;
  const desired = c?.desiredNodes ?? 0;
  const lbUp = data.loadBalancer.servers.filter((s) => s.up).length;
  const firing = data.prometheus.alerts.filter((a) => a.state === 'firing').length;
  const pending = data.prometheus.alerts.filter((a) => a.state === 'pending').length;
  const replacements = c?.nodes.reduce((n, x) => n + x.replacements, 0) ?? 0;
  const lastRecovery = c?.events.find((e) => e.type === 'NODE_RECOVERED');
  const recoverySecs = lastRecovery?.details?.recoverySeconds as number | undefined;
  const vol = c?.storage.volume;
  const totals = c?.storage.totals;
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      <StatCard
        label="Nodes ready"
        value={c ? `${ready} / ${desired}` : '—'}
        icon={Server}
        tone={!c ? 'destructive' : ready === desired ? 'success' : ready === 0 ? 'destructive' : 'warning'}
        hint={!c ? 'controller unreachable' : ready === desired ? 'cluster healthy' : 'self-healing in progress'}
        help="FTP nodes answering the FTP 220 greeting probe (platform controller)."
      />
      <StatCard
        label="LB servers up"
        value={data.loadBalancer.reachable ? `${lbUp} / ${data.loadBalancer.servers.length}` : '—'}
        icon={Network}
        tone={!data.loadBalancer.reachable ? 'destructive' : lbUp === data.loadBalancer.servers.length ? 'success' : 'warning'}
        hint="HAProxy health check (220 greeting)"
        help="Servers in rotation for the FTP control port, as reported by HAProxy through Prometheus."
      />
      <StatCard
        label="Prometheus alerts"
        value={firing}
        icon={BellRing}
        tone={firing ? 'destructive' : pending ? 'warning' : 'success'}
        hint={firing ? `${pending} pending` : pending ? `${pending} pending` : 'all clear'}
      />
      <StatCard label="Replacements" value={fmt.num(replacements)} icon={RefreshCcw} tone="info" hint="nodes replaced by the controller" />
      <StatCard
        label="Last recovery"
        value={recoverySecs !== undefined ? `${recoverySecs}s` : '—'}
        icon={Timer}
        tone="default"
        hint={lastRecovery ? `${lastRecovery.node} · ${fmt.ago(lastRecovery.at)}` : 'no failure yet'}
        help="Seconds from the failure (or first failed probe) to the replacement node answering."
      />
      <StatCard
        label="Volume usage"
        value={vol ? fmt.pct(vol.usedRatio) : '—'}
        icon={HardDrive}
        tone={vol && vol.usedRatio > 0.85 ? 'destructive' : vol && vol.usedRatio > 0.7 ? 'warning' : 'default'}
        hint={vol ? `${bytes(vol.usedBytes)} of ${bytes(vol.sizeBytes)}` : undefined}
        to="/platform/storage"
      />
      <StatCard
        label="Files on volume"
        value={totals ? fmt.num(totals.files) : '—'}
        icon={Database}
        hint={totals ? `${totals.fresh} fresh · ${totals.archived} archived` : undefined}
        to="/platform/storage"
      />
    </div>
  );
}

const nodeConfig = (keys: string[]): ChartConfig =>
  Object.fromEntries(keys.map((k) => [k, { label: k, color: nodeColor(Number(k.replace(/\D/g, '')) || 1) }]));

function Charts({ nodeNames }: { nodeNames: string[] }) {
  const [minutes, setMinutes] = useState(15);
  const ts = usePlatformTimeseries(minutes);
  const cfg = useMemo(() => nodeConfig(nodeNames), [nodeNames]);
  const clusterCfg = { ready: { label: 'Ready', color: 'var(--chart-1)' }, desired: { label: 'Desired', color: 'var(--muted-foreground)' } } satisfies ChartConfig;
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Cluster metrics <span className="text-muted-foreground text-xs font-normal">· from Prometheus</span></h2>
        <RangeSelect value={minutes} onChange={setMinutes} options={[[15, '15m'], [60, '1h'], [360, '6h']]} />
      </div>
      {ts.error ? (
        <ErrorState error={ts.error} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="gap-2">
            <CardHeader>
              <CardTitle>Nodes ready</CardTitle>
              <CardDescription>ftp_cluster_ready_nodes vs desired — dips show a node failing and being replaced</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart data={ts.data?.cluster} config={clusterCfg} kind="step" allowDecimals={false} yDomain={[0, 'dataMax + 1']} />
            </CardContent>
          </Card>
          <Card className="gap-2">
            <CardHeader>
              <CardTitle>Traffic per node</CardTitle>
              <CardDescription>bytes/s through the load balancer (control + passive data), stacked</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart data={ts.data?.traffic} config={cfg} kind="area" yFormatter={(v) => rate(v)} />
            </CardContent>
          </Card>
          <Card className="gap-2">
            <CardHeader>
              <CardTitle>Active sessions per node</CardTitle>
              <CardDescription>haproxy_server_current_sessions (control + data)</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart data={ts.data?.sessions} config={cfg} kind="step" stacked={false} allowDecimals={false} />
            </CardContent>
          </Card>
          <Card className="gap-2">
            <CardHeader>
              <CardTitle>Probe latency</CardTitle>
              <CardDescription>time to the FTP 220 greeting, per node (ms)</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart data={ts.data?.probeMs} config={cfg} kind="line" stacked={false} yFormatter={(v) => `${Math.round(v)} ms`} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function PrometheusCard({ data }: { data: PlatformOverview['prometheus'] }) {
  const alerts = [...data.alerts].sort((a, b) => (a.state === b.state ? 0 : a.state === 'firing' ? -1 : 1));
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" /> Prometheus
          <a href={`${data.url}/alerts`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs font-normal">
            alerts <ExternalLink className="size-3" />
          </a>
        </CardTitle>
        <CardDescription>Alert rules evaluated every 5s (infra/prometheus/alerts.yml)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.reachable ? (
          <ErrorState error={new Error('Prometheus unreachable')} />
        ) : alerts.length === 0 ? (
          <div className="bg-success/10 text-success flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium">
            <span className="bg-success size-2 rounded-full" /> All clear — no active alerts
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className={cn('rounded-lg border p-3', a.state === 'firing' ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-warning/5')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.state === 'firing' ? 'destructive' : 'warning'} className="uppercase">{a.state}</Badge>
                  <span className="font-mono text-sm font-medium">{a.name}</span>
                  {a.severity && <Badge variant="outline">{a.severity}</Badge>}
                  <span className="text-muted-foreground ml-auto text-xs">{fmt.ago(a.since)}</span>
                </div>
                {a.summary && <p className="text-muted-foreground mt-1 text-sm">{a.summary}</p>}
              </li>
            ))}
          </ul>
        )}
        <div>
          <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Scrape targets</div>
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {data.targets.map((t) => (
              <div key={`${t.job}-${t.instance}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs" title={t.lastError || `last scrape ${fmt.dateTime(t.lastScrape)}`}>
                <span className={cn('size-2 shrink-0 rounded-full', t.health === 'up' ? 'bg-success' : t.health === 'down' ? 'bg-destructive' : 'bg-muted-foreground')} />
                <span className="shrink-0 font-medium whitespace-nowrap">{t.job}</span>
                <span className="text-muted-foreground ml-auto min-w-0 truncate font-mono">{t.instance}</span>
              </div>
            ))}
            {data.targets.length === 0 && <span className="text-muted-foreground text-xs">No targets reported</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsCard({ data }: { data: PlatformOverview['notifications'] }) {
  const qc = useQueryClient();
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" /> Platform notifications
          {data.unread > 0 && <Badge variant="destructive">{data.unread} unread</Badge>}
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to="/notifications?tab=platform">View all</Link>
          </Button>
        </CardTitle>
        <CardDescription>Delivered by RabbitMQ (platform.events → distributor.platform)</CardDescription>
      </CardHeader>
      <CardContent>
        {data.items.length === 0 ? (
          <EmptyState icon={BellRing} title="No platform notifications" description="Node failures, recoveries, chaos tests and Prometheus alerts show up here." />
        ) : (
          <ul className="max-h-[420px] divide-y overflow-y-auto overscroll-contain">
            {data.items.map((n) => (
              <li key={n.id} className={cn('flex gap-3 py-2.5', !n.read && 'bg-primary/[0.03]')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneDot[SEV_VARIANT[n.severity] ?? 'muted'])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">{fmt.ago(n.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs">{n.message}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{n.type}</Badge>
                    {!n.read && (
                      <button className="text-primary cursor-pointer text-xs hover:underline" onClick={() => markRead.mutate(n.id)}>
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ClusterPage() {
  const q = usePlatformOverview(2000);
  const [chaosOpen, setChaosOpen] = useState(false);
  const [chaosNode, setChaosNode] = useState<PlatformNode | undefined>();
  const [eventNode, setEventNode] = useState('');

  if (q.isLoading) return <LoadingPage />;
  if (q.error) return <ErrorState error={q.error} />;
  const data = q.data!;
  const c = data.controller.reachable ? data.controller : undefined;
  const nodes = c?.nodes ?? [];
  const nodeNames = nodes.map((n) => n.name);
  const events = (c?.events ?? []).filter((e) => !eventNode || e.node === eventNode);
  const openChaos = (node?: PlatformNode) => {
    setChaosNode(node);
    setChaosOpen(true);
  };

  return (
    <>
      <PageHeader
        title="FTP Cluster"
        description={
          <>
            Producers connect to <code className="font-mono">ftp:21</code>, an HAProxy load balancer in front of three vsftpd nodes. Each node owns a
            passive port range so data connections return to the right node, and all nodes mount the same storage volume. The platform controller
            probes every node and replaces any that stop answering; Prometheus scrapes the load balancer and the controller and evaluates the alert rules.
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
      <ArchitectureStrip />

      {!c && (
        <div className="mb-6">
          <EmptyState icon={ServerCrash} title="Platform controller unreachable" description="The FTP cluster cannot self-heal and node status is unknown. Check `docker compose ps platform-controller`." />
        </div>
      )}

      <KpiStrip data={data} />

      {c && (
        <>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Nodes</h2>
            <span className="text-muted-foreground text-xs">
              probe every {c.probe.intervalMs / 1000}s · timeout {c.probe.timeoutMs} ms · down after {c.probe.failureThreshold} failures · auto-heal {c.autoHeal ? 'on' : 'off'}
              {c.project ? ` · project ${c.project}` : ''}
            </span>
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            {nodes.map((n) => (
              <NodeCard key={n.slot} node={n} lb={data.loadBalancer.servers.find((s) => s.slot === n.slot)} onChaos={openChaos} />
            ))}
          </div>
        </>
      )}

      <Charts nodeNames={nodeNames.length ? nodeNames : ['ftp-node-1', 'ftp-node-2', 'ftp-node-3']} />

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="gap-3 xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCcw className="size-4" /> Recovery timeline
              <NativeSelect
                className="ml-auto h-8 text-xs"
                value={eventNode}
                onChange={setEventNode}
                placeholder="All nodes"
                options={nodeNames.map((n) => ({ value: n, label: n }))}
              />
            </CardTitle>
            <CardDescription>Platform controller events, newest first</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[640px] overflow-y-auto overscroll-contain">
            <EventTimeline events={events} />
          </CardContent>
        </Card>
        <div className="space-y-4 xl:col-span-2">
          <PrometheusCard data={data.prometheus} />
          <NotificationsCard data={data.notifications} />
        </div>
      </div>

      {c && data.prometheus.alerts.some((a) => a.state === 'firing') && (
        <div className="border-destructive/40 bg-destructive/5 text-destructive fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur">
          <AlertTriangle className="size-4" /> {data.prometheus.alerts.filter((a) => a.state === 'firing').length} alert(s) firing
        </div>
      )}

      <ChaosDrawer open={chaosOpen} onOpenChange={setChaosOpen} node={chaosNode} />
    </>
  );
}
