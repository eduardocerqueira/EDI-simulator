import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ChartColumn, Database, FileWarning, HardDrive, Inbox, Info, MailCheck, Table2 } from '@edi/ui/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edi/ui/components/card';
import type { ChartConfig } from '@edi/ui/components/chart';
import { Progress } from '@edi/ui/components/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edi/ui/components/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import { cn } from '@edi/ui/lib/utils';
import { VBarChart } from '@/components/charts';
import { EmptyState, ErrorState, LiveDot, Mono, RangeSelect, StatCard } from '@/components/common';
import { TimeChart } from '@/components/platform/TimeChart';
import { fmt } from '@/lib/format';
import { bytes, FOLDER_INFO, usePlatformTimeseries } from '@/lib/platform';
import type { MailboxFolder } from '@/lib/types';
import { CountBadge, usePlatformContext } from './Platform';

const FOLDERS: MailboxFolder[] = ['to_distributor', 'archive', 'from_distributor', 'error'];
/** Folder keys used by the controller's Prometheus metrics (ftp_storage_files{folder}). */
const METRIC_FOLDER: Record<MailboxFolder, string> = {
  to_distributor: 'fresh',
  archive: 'archived',
  from_distributor: 'acks',
  error: 'error',
};

function FolderHead({ folder, className }: { folder: MailboxFolder; className?: string }) {
  const info = FOLDER_INFO[folder];
  return (
    <TableHead className={cn('text-right', className)}>
      <Tooltip>
        <TooltipTrigger className="inline-flex cursor-help items-center gap-1">
          <span className="size-2 rounded-none" style={{ background: info.color }} />
          {info.label}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{info.help}</TooltipContent>
      </Tooltip>
    </TableHead>
  );
}

const TABS = ['mailboxes', 'charts'] as const;
type Tab = (typeof TABS)[number];

export function StorageSection() {
  const { data } = usePlatformContext();
  const [params, setParams] = useSearchParams();
  const [minutes, setMinutes] = useState(60);
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'mailboxes';
  const ts = usePlatformTimeseries(minutes, 10000, tab === 'charts');
  const setTab = (t: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === 'mailboxes') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true },
    );

  const rows = useMemo(() => {
    const d = data;
    if (!d.controller.reachable) return [];
    const byUser = new Map(d.partnerTraffic.map((p) => [p.ftpUser, p]));
    return d.controller.storage.partners.map((s) => {
      const t = byUser.get(s.partner);
      const newest = FOLDERS.map((f) => s.folders[f]?.newest)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        ...s,
        name: t?.name ?? s.partner,
        isaId: t?.isaId ?? s.partner.toUpperCase(),
        traffic: t,
        newest,
      };
    });
  }, [data]);

  if (!data.controller.reachable) {
    return (
      <>
        <EmptyState
          icon={HardDrive}
          title="Platform controller unreachable"
          description="Storage statistics are collected by the platform controller, which mounts the shared FTP volume read-only."
        />
      </>
    );
  }
  const st = data.controller.storage;
  const vol = st.volume;
  const t = st.totals;
  const chartData = rows.map((r) => ({
    producer: r.name.split(' ')[0],
    fresh: r.folders.to_distributor?.files ?? 0,
    archived: r.folders.archive?.files ?? 0,
    acks: r.folders.from_distributor?.files ?? 0,
    error: r.folders.error?.files ?? 0,
  }));
  const folderCfg = Object.fromEntries(
    FOLDERS.map((f) => [METRIC_FOLDER[f], { label: FOLDER_INFO[f].label, color: FOLDER_INFO[f].color }]),
  ) satisfies ChartConfig;
  const sum = (fn: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + fn(r), 0);

  return (
    <>
      <div className="text-muted-foreground mb-4 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl">
          Every FTP node mounts the same volume at <Mono>{st.path}</Mono>, so a producer's mailbox is identical whichever node the load balancer picks, and a
          replacement node sees all the data immediately. The platform controller scans it every 10s.
        </p>
        <LiveDot label={st.scannedAt ? `Scanned ${fmt.ago(st.scannedAt)}` : 'Live'} />
      </div>

      <Card className="mb-6 gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4" /> Volume <Mono className="text-muted-foreground font-normal">{st.path}</Mono>
          </CardTitle>
          <CardDescription>Filesystem capacity of the shared FTP storage volume (statfs)</CardDescription>
        </CardHeader>
        <CardContent>
          {vol ? (
            <>
              <Progress
                value={vol.usedRatio * 100}
                className="h-3"
                indicatorClassName={vol.usedRatio > 0.85 ? 'bg-destructive' : vol.usedRatio > 0.7 ? 'bg-warning' : 'bg-primary'}
              />
              <div className="text-muted-foreground mt-2 flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  <span className="text-foreground font-medium">{bytes(vol.usedBytes)}</span> used ({fmt.pct(vol.usedRatio)})
                </span>
                <span>{bytes(vol.freeBytes)} free</span>
                <span>{bytes(vol.sizeBytes)} total</span>
              </div>
              <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                <Info className="size-3.5" /> A Docker named volume here; in production this would be NFS / EFS / a CSI volume shared by the nodes.
              </p>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">Not scanned yet</span>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Fresh"
          value={fmt.num(t.fresh)}
          icon={Inbox}
          tone={t.fresh > 25 ? 'warning' : 'info'}
          hint="waiting in to_distributor"
          help={FOLDER_INFO.to_distributor.help}
        />
        <StatCard label="Archived" value={fmt.num(t.archived)} icon={Archive} tone="success" hint="processed inbound X12" help={FOLDER_INFO.archive.help} />
        <StatCard
          label="Acks waiting"
          value={fmt.num(t.acks)}
          icon={MailCheck}
          tone="default"
          hint="TA1 / 997 in from_distributor"
          help={FOLDER_INFO.from_distributor.help}
        />
        <StatCard
          label="Error"
          value={fmt.num(t.error)}
          icon={FileWarning}
          tone={t.error ? 'destructive' : 'default'}
          hint="failed downloads"
          help={FOLDER_INFO.error.help}
        />
        <StatCard label="Data on volume" value={bytes(t.bytes)} icon={Database} hint={`${fmt.num(t.files)} files · ${rows.length} mailboxes`} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="h-10">
            <TabsTrigger value="mailboxes" className="px-3">
              <Table2 /> Mailboxes per producer <CountBadge n={rows.length} />
            </TabsTrigger>
            <TabsTrigger value="charts" className="px-3">
              <ChartColumn /> Charts
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="mailboxes">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Mailboxes per producer</CardTitle>
              <CardDescription>Files on the shared volume now, plus FTP traffic over the last 24h (from the distributor's transfer log)</CardDescription>
            </CardHeader>
            {rows.length === 0 ? (
              <EmptyState icon={Inbox} title="No mailboxes found" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producer</TableHead>
                    {FOLDERS.map((f) => (
                      <FolderHead key={f} folder={f} />
                    ))}
                    <TableHead className="text-right">On volume</TableHead>
                    <TableHead className="text-right">Inbound 24h</TableHead>
                    <TableHead className="text-right">Acks sent 24h</TableHead>
                    <TableHead className="text-right">Newest file</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const fresh = r.folders.to_distributor;
                    return (
                      <TableRow key={r.partner}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-muted-foreground font-mono text-[11px]">
                            {r.isaId} · /{r.partner}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn(fresh?.files ? 'font-semibold' : 'text-muted-foreground')}>{fmt.num(fresh?.files ?? 0)}</span>
                          {fresh?.inFlight ? <span className="text-info ml-1 text-xs">+{fresh.inFlight} uploading</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt.num(r.folders.archive?.files ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt.num(r.folders.from_distributor?.files ?? 0)}</TableCell>
                        <TableCell
                          className={cn('text-right tabular-nums', r.folders.error?.files ? 'text-destructive font-semibold' : 'text-muted-foreground')}
                        >
                          {fmt.num(r.folders.error?.files ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bytes(r.totalBytes)}
                          <div className="text-muted-foreground text-[11px]">{fmt.num(r.totalFiles)} files</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.num(r.traffic?.inboundFiles24h ?? 0)}
                          <div className="text-muted-foreground text-[11px]">{bytes(r.traffic?.inboundBytes24h ?? 0)}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.num(r.traffic?.outboundFiles24h ?? 0)}
                          <div className="text-muted-foreground text-[11px]">{bytes(r.traffic?.outboundBytes24h ?? 0)}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-xs" title={fmt.dateTime(r.newest)}>
                          {r.newest ? fmt.ago(r.newest) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.num(t.fresh)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.num(t.archived)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.num(t.acks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.num(t.error)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bytes(t.bytes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.num(sum((r) => r.traffic?.inboundFiles24h ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.num(sum((r) => r.traffic?.outboundFiles24h ?? 0))}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="charts">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-2">
              <CardHeader>
                <CardTitle>Files per producer</CardTitle>
                <CardDescription>Current mailbox contents by folder</CardDescription>
              </CardHeader>
              <CardContent>
                <VBarChart data={chartData} xKey="producer" config={folderCfg} stacked animate={false} xFormatter={(v) => String(v).slice(0, 8)} />
              </CardContent>
            </Card>
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Files on volume over time
                  <span className="ml-auto">
                    <RangeSelect
                      value={minutes}
                      onChange={setMinutes}
                      options={[
                        [15, '15m'],
                        [60, '1h'],
                        [360, '6h'],
                      ]}
                    />
                  </span>
                </CardTitle>
                <CardDescription>sum by folder of ftp_storage_files (Prometheus)</CardDescription>
              </CardHeader>
              <CardContent>
                {ts.error ? (
                  <ErrorState error={ts.error} />
                ) : (
                  <TimeChart data={ts.data?.storage} config={folderCfg} kind="area" stacked={false} allowDecimals={false} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
