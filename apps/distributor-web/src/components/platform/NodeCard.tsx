import { ArrowDownToLine, ArrowUpFromLine, Loader2, MoreVertical, Network, Server, Zap } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent } from '@edi/ui/components/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@edi/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import { cn } from '@edi/ui/lib/utils';
import { fmt } from '@/lib/format';
import { bytes, cleanName, isTransitional, isUnhealthy, NODE_STATUS, nodeColor, rate, shortId, toneBg, toneDot, toneText, validDate } from '@/lib/platform';
import type { LbServer, PlatformNode } from '@/lib/types';

function Row({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground shrink-0 text-xs">
        {help ? (
          <Tooltip>
            <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">{label}</TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        ) : (
          label
        )}
      </span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  );
}

export function NodeCard({ node, lb, onChaos }: { node: PlatformNode; lb?: LbServer; onChaos: (node: PlatformNode) => void }) {
  const meta = NODE_STATUS[node.status] ?? NODE_STATUS.MISSING;
  const busy = isTransitional(node.status);
  const bad = isUnhealthy(node.status);
  const ready = node.status === 'READY';
  const since = validDate(node.readySince);
  const started = validDate(node.startedAt);

  return (
    <Card
      className={cn(
        'relative gap-0 overflow-hidden py-0 transition-colors',
        bad && 'border-destructive/60 shadow-[0_0_0_1px_var(--destructive)]/20',
        node.status === 'SUSPECT' && 'border-warning/70',
        busy && 'border-warning/60',
      )}
    >
      <div className="h-1 w-full" style={{ background: nodeColor(node.slot) }} />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-none', toneBg[meta.tone])}>
            {busy ? <Loader2 className={cn('size-5 animate-spin', toneText[meta.tone])} /> : <Server className={cn('size-5', toneText[meta.tone])} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold">{node.name}</span>
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              gen {node.generation}
              {node.replacements > 0 ? ` — replaced ${node.replacements}×` : ' — original container'}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-2" aria-label={`Actions for ${node.name}`}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{node.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!node.containerId || busy} onClick={() => onChaos(node)}>
                <Zap /> Simulate failure…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-3 rounded-none px-4 py-3', toneBg[meta.tone])}>
              <span className="relative flex size-3">
                {ready && <span className="bg-success absolute inline-flex size-full animate-ping rounded-none opacity-60" />}
                <span className={cn('relative inline-flex size-3 rounded-none', toneDot[meta.tone], (bad || busy) && 'animate-pulse')} />
              </span>
              <span className={cn('text-lg font-semibold tracking-wide uppercase', toneText[meta.tone])}>{meta.label}</span>
              {node.consecutiveFailures > 0 && <Badge variant="destructive" className="ml-auto">{node.consecutiveFailures} failed probe{node.consecutiveFailures > 1 ? 's' : ''}</Badge>}
              {ready && since && <span className="text-muted-foreground ml-auto text-xs">since {fmt.ago(since)}</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent>{meta.help}</TooltipContent>
        </Tooltip>

        <div className="divide-y">
          <Row label="Container">
            <span className="font-mono text-xs">{cleanName(node.containerName)}</span>
          </Row>
          <Row label="Container ID">
            <span className="font-mono text-xs">{shortId(node.containerId)}</span>
            {node.dockerState && node.dockerState !== 'running' && <Badge variant="warning" className="ml-2">{node.dockerState}</Badge>}
          </Row>
          <Row label="IP · passive ports" help="Each node owns a passive port range; the load balancer routes FTP data connections in that range back to this node.">
            <span className="font-mono text-xs">{node.ip || '—'} · {node.passivePorts}</span>
          </Row>
          <Row label="Started">{started ? fmt.ago(started) : '—'}</Row>
          <Row label="Last probe" help="FTP greeting probe by the platform controller (TCP connect + wait for 220).">
            {node.lastProbeMs !== undefined ? `${node.lastProbeMs} ms · ${fmt.ago(node.lastProbeAt)}` : '—'}
          </Row>
          <div className="py-1">
            <div className={cn('truncate font-mono text-[11px]', node.lastError ? 'text-destructive' : 'text-muted-foreground')} title={node.lastError ?? node.lastBanner}>
              {node.lastError ?? node.lastBanner ?? '—'}
            </div>
          </div>
          {node.lastRecoverySeconds !== undefined && <Row label="Last recovery">{node.lastRecoverySeconds}s</Row>}
        </div>

        <div className="bg-muted/40 rounded-none border p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium">
            <Network className="size-3.5" /> Load balancer
            {lb ? (
              <Badge variant={lb.up ? 'success' : 'destructive'} className="ml-auto">{lb.up ? 'UP' : 'DOWN'}</Badge>
            ) : (
              <Badge variant="muted" className="ml-auto">no data</Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-sm font-semibold tabular-nums">{lb ? `${lb.controlSessions}/${lb.dataSessions}` : '—'}</div>
              <div className="text-muted-foreground text-[10px]">ctrl/data sessions</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums">
                <ArrowDownToLine className="text-muted-foreground size-3" />
                {bytes(lb?.bytesIn)}
              </div>
              <div className="flex items-center justify-center gap-1 text-[11px] tabular-nums">
                <ArrowUpFromLine className="text-muted-foreground size-3" />
                {bytes(lb?.bytesOut)}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold tabular-nums">{rate(lb?.throughputBps)}</div>
              <div className="text-muted-foreground text-[10px]">throughput (1m)</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
