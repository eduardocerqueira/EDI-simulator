import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BellRing,
  ChartLine,
  Database,
  ExternalLink,
  HardDrive,
  Network,
  Radar,
  RefreshCcw,
  Server,
  ServerCrash,
  Timer,
} from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import type { ChartConfig } from '@edi/ui/components/chart';
import { cn } from '@edi/ui/lib/utils';
import { EmptyState, ErrorState, RangeSelect, StatCard } from '@/components/common';
import { PlatformEventsPanel } from '@/components/platform/PlatformEventsPanel';
import { PlatformNotificationsPanel } from '@/components/platform/PlatformNotificationsPanel';
import { NodeCard } from '@/components/platform/NodeCard';
import { TimeChart } from '@/components/platform/TimeChart';
import { fmt } from '@/lib/format';
import { bytes, nodeColor, rate, usePlatformTimeseries } from '@/lib/platform';
import type { PlatformOverview } from '@/lib/types';
import { CountBadge, usePlatformContext } from './Platform';

function ArchitectureStrip() {
  const step = (icon: typeof Server, title: string, sub: string) => {
    const Icon = icon;
    return (
      <div className="bg-background/60 flex min-w-0 flex-1 items-center gap-2.5 rounded-none border px-3 py-2">
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
    <div className="bg-muted/40 flex flex-col gap-2 rounded-none border p-3 md:flex-row md:items-center">
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

const nodeConfig = (keys: string[]): ChartConfig => Object.fromEntries(keys.map((k) => [k, { label: k, color: nodeColor(Number(k.replace(/\D/g, '')) || 1) }]));

function Charts({ nodeNames, minutes, setMinutes }: { nodeNames: string[]; minutes: number; setMinutes: (m: number) => void }) {
  const ts = usePlatformTimeseries(minutes);
  const cfg = useMemo(() => nodeConfig(nodeNames), [nodeNames]);
  const clusterCfg = {
    ready: { label: 'Ready', color: 'var(--chart-1)' },
    desired: { label: 'Desired', color: 'var(--muted-foreground)' },
  } satisfies ChartConfig;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Cluster metrics <span className="text-muted-foreground text-xs font-normal">· from Prometheus</span>
        </h2>
        <RangeSelect
          value={minutes}
          onChange={setMinutes}
          options={[
            [15, '15m'],
            [60, '1h'],
            [360, '6h'],
          ]}
        />
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

function AlertsCard({ data }: { data: PlatformOverview['prometheus'] }) {
  const alerts = [...data.alerts].sort((a, b) => (a.state === b.state ? 0 : a.state === 'firing' ? -1 : 1));
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" /> Prometheus alerts
          <a
            href={`${data.url}/alerts`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs font-normal"
          >
            open in Prometheus <ExternalLink className="size-3" />
          </a>
        </CardTitle>
        <CardDescription>
          Alert rules evaluated every 5s (infra/prometheus/alerts.yml) · firing and resolved alerts also become platform notifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data.reachable ? (
          <ErrorState error={new Error('Prometheus unreachable')} />
        ) : alerts.length === 0 ? (
          <div className="bg-success/10 text-success flex items-center gap-2 rounded-none px-3 py-2.5 text-sm font-medium">
            <span className="bg-success size-2 rounded-none" /> All clear — no active alerts
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={cn('rounded-none border p-3', a.state === 'firing' ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-warning/5')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.state === 'firing' ? 'destructive' : 'warning'} className="uppercase">
                    {a.state}
                  </Badge>
                  <span className="font-mono text-sm font-medium">{a.name}</span>
                  {a.severity && <Badge variant="outline">{a.severity}</Badge>}
                  <span className="text-muted-foreground ml-auto text-xs">{fmt.ago(a.since)}</span>
                </div>
                {a.summary && <p className="text-muted-foreground mt-1 text-sm">{a.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TargetsCard({ data }: { data: PlatformOverview['prometheus'] }) {
  const up = data.targets.filter((t) => t.health === 'up').length;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" /> Scrape targets
          {data.targets.length > 0 && (
            <Badge variant={up === data.targets.length ? 'success' : 'warning'} className="ml-auto">
              {up} / {data.targets.length} up
            </Badge>
          )}
        </CardTitle>
        <CardDescription>What Prometheus scrapes every 5s (infra/prometheus/prometheus.yml)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-1.5">
          {data.targets.map((t) => (
            <div
              key={`${t.job}-${t.instance}`}
              className="flex items-center gap-2 rounded-none border px-2.5 py-1.5 text-xs"
              title={t.lastError || `last scrape ${fmt.dateTime(t.lastScrape)}`}
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-none',
                  t.health === 'up' ? 'bg-success' : t.health === 'down' ? 'bg-destructive' : 'bg-muted-foreground',
                )}
              />
              <span className="shrink-0 font-medium whitespace-nowrap">{t.job}</span>
              <span className="text-muted-foreground ml-auto min-w-0 truncate font-mono">{t.instance}</span>
            </div>
          ))}
          {data.targets.length === 0 && <span className="text-muted-foreground text-xs">No targets reported</span>}
        </div>
      </CardContent>
    </Card>
  );
}

const TABS = ['nodes', 'metrics', 'timeline', 'alerts', 'notifications'] as const;
type Tab = (typeof TABS)[number];

export function ClusterSection() {
  const { data, openChaos } = usePlatformContext();
  const [params, setParams] = useSearchParams();
  const [minutes, setMinutes] = useState(15);

  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'nodes';
  const setTab = (t: string) =>
    setParams(
      () => {
        // each tab has its own filters and paging, so start clean when switching
        const next = new URLSearchParams();
        if (t !== 'nodes') next.set('tab', t);
        return next;
      },
      { replace: true },
    );

  const c = data.controller.reachable ? data.controller : undefined;
  const nodes = c?.nodes ?? [];
  const nodeNames = nodes.map((n) => n.name);
  const firing = data.prometheus.alerts.filter((a) => a.state === 'firing').length;
  const pending = data.prometheus.alerts.filter((a) => a.state === 'pending').length;
  const unhealthy = nodes.filter((n) => n.status !== 'READY').length;

  return (
    <>
      {!c && (
        <div className="mb-6">
          <EmptyState
            icon={ServerCrash}
            title="Platform controller unreachable"
            description="The FTP cluster cannot self-heal and node status is unknown. Check `docker compose ps platform-controller`."
          />
        </div>
      )}

      <KpiStrip data={data} />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="h-10">
            <TabsTrigger value="nodes" className="px-3">
              <Server /> Nodes <CountBadge n={unhealthy} tone="warning" />
            </TabsTrigger>
            <TabsTrigger value="metrics" className="px-3">
              <ChartLine /> Metrics
            </TabsTrigger>
            <TabsTrigger value="timeline" className="px-3">
              <RefreshCcw /> Recovery timeline <CountBadge n={c?.events.length ?? 0} />
            </TabsTrigger>
            <TabsTrigger value="alerts" className="px-3">
              <Radar /> Alerts <CountBadge n={firing || pending} tone={firing ? 'destructive' : 'warning'} />
            </TabsTrigger>
            <TabsTrigger value="notifications" className="px-3">
              <BellRing /> Notifications <CountBadge n={data.notifications.unread} tone="destructive" />
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="nodes" className="space-y-4">
          {c ? (
            <>
              <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span>Open a node's menu to simulate a failure on it</span>
                <span>
                  probe every {c.probe.intervalMs / 1000}s · timeout {c.probe.timeoutMs} ms · down after {c.probe.failureThreshold} failures · auto-heal{' '}
                  {c.autoHeal ? 'on' : 'off'}
                  {c.project ? ` · project ${c.project}` : ''}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {nodes.map((n) => (
                  <NodeCard key={n.slot} node={n} lb={data.loadBalancer.servers.find((s) => s.slot === n.slot)} onChaos={openChaos} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Server} title="No node status" description="Node status comes from the platform controller." />
          )}
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">How it fits together</div>
            <ArchitectureStrip />
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <Charts nodeNames={nodeNames.length ? nodeNames : ['ftp-node-1', 'ftp-node-2', 'ftp-node-3']} minutes={minutes} setMinutes={setMinutes} />
        </TabsContent>

        <TabsContent value="timeline">
          <PlatformEventsPanel />
        </TabsContent>

        <TabsContent value="alerts">
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <AlertsCard data={data.prometheus} />
            </div>
            <div className="lg:col-span-2">
              <TargetsCard data={data.prometheus} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <PlatformNotificationsPanel nodes={nodeNames.length ? nodeNames : ['ftp-node-1', 'ftp-node-2', 'ftp-node-3']} />
        </TabsContent>
      </Tabs>
    </>
  );
}
