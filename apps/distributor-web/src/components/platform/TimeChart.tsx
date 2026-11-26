import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@edi/ui/components/chart';
import { cn } from '@edi/ui/lib/utils';
import { EmptyState } from '@/components/common';
import type { SeriesRow } from '@/lib/types';

const timeLabel = (v: unknown) => new Date(Number(v)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const axisLabel = (v: unknown) => new Date(Number(v)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

/**
 * Time-series chart for Prometheus ranges.
 *  - kind "area": stacked areas (traffic, files)
 *  - kind "step": stepped lines (ready nodes, sessions)
 *  - kind "line": smooth lines (latency)
 */
export function TimeChart({
  data,
  config,
  kind = 'area',
  stacked = true,
  yFormatter,
  className,
  allowDecimals = true,
  yDomain,
}: {
  data: SeriesRow[] | undefined;
  config: ChartConfig;
  kind?: 'area' | 'step' | 'line';
  stacked?: boolean;
  yFormatter?: (v: number) => string;
  className?: string;
  allowDecimals?: boolean;
  yDomain?: [number | string, number | string];
}) {
  const keys = Object.keys(config);
  const rows = data ?? [];
  const hasData = rows.some((r) => keys.some((k) => r[k] !== undefined));
  if (!hasData) return <EmptyState title="No samples yet" description="Prometheus scrapes every 5s — data appears within a few seconds." />;
  // Recharts only discovers axes/legend among its DIRECT children, so pass an array (not a fragment).
  const common = [
    <CartesianGrid key="grid" vertical={false} />,
    <XAxis key="x" dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tickFormatter={axisLabel} />,
    <YAxis key="y" tickLine={false} axisLine={false} width={yFormatter ? 78 : 40} tickFormatter={yFormatter} allowDecimals={allowDecimals} domain={yDomain} />,
    <ChartTooltip key="tip" content={<ChartTooltipContent labelFormatter={timeLabel} valueFormatter={yFormatter ? (v) => yFormatter(Number(v)) : undefined} />} />,
    <ChartLegend key="legend" content={<ChartLegendContent />} />,
  ];
  return (
    <ChartContainer config={config} className={cn('aspect-auto h-[230px] w-full', className)}>
      {kind === 'area' ? (
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            {keys.map((k) => (
              <linearGradient key={k} id={`pf-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.45} />
                <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.04} />
              </linearGradient>
            ))}
          </defs>
          {common}
          {keys.map((k) => (
            <Area key={k} dataKey={k} type="monotone" stackId={stacked ? 'a' : undefined} stroke={`var(--color-${k})`} fill={`url(#pf-${k})`} strokeWidth={2} isAnimationActive={false} connectNulls />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          {common}
          {keys.map((k) => (
            <Line key={k} dataKey={k} type={kind === 'step' ? 'stepAfter' : 'monotone'} stroke={`var(--color-${k})`} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  );
}
