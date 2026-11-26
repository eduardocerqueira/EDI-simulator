import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@edi/ui/components/chart';
import { cn } from '@edi/ui/lib/utils';
import { EmptyState } from '@/components/common';

export const bucketLabel = (stepMs: number) => (v: unknown) => {
  const d = new Date(v as string);
  if (stepMs >= 86400_000) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export function StackedAreaChart({
  data,
  xKey,
  config,
  xFormatter,
  className,
  stacked = true,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  config: ChartConfig;
  xFormatter?: (v: unknown) => string;
  className?: string;
  stacked?: boolean;
}) {
  const keys = Object.keys(config);
  return (
    <ChartContainer config={config} className={cn('aspect-auto h-[260px] w-full', className)}>
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <defs>
          {keys.map((k) => (
            <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.5} />
              <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={xFormatter} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={xFormatter} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((k) => (
          <Area key={k} dataKey={k} type="monotone" stackId={stacked ? 'a' : undefined} stroke={`var(--color-${k})`} fill={`url(#fill-${k})`} strokeWidth={2} />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

export function VBarChart({
  data,
  xKey,
  config,
  className,
  stacked,
  xFormatter,
  yFormatter,
  animate = true,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  config: ChartConfig;
  className?: string;
  stacked?: boolean;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: number) => string;
  /** Disable for live-refreshing data (recharts re-animates from zero on every new data array). */
  animate?: boolean;
}) {
  const keys = Object.keys(config);
  if (!data.length) return <EmptyState title="No data in range" />;
  return (
    <ChartContainer config={config} className={cn('aspect-auto h-[260px] w-full', className)}>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tickFormatter={xFormatter} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={yFormatter} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={xFormatter} valueFormatter={yFormatter ? (v) => yFormatter(Number(v)) : undefined} />} />
        {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId={stacked ? 'a' : undefined} fill={`var(--color-${k})`} radius={0} isAnimationActive={animate} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Horizontal bar chart for rankings (top errors, top products…). */
export function HBarChart({
  data,
  labelKey,
  valueKey,
  color = 'var(--chart-1)',
  className,
  valueFormatter,
  labelWidth = 150,
}: {
  data: Array<Record<string, unknown>>;
  labelKey: string;
  valueKey: string;
  color?: string;
  className?: string;
  valueFormatter?: (v: number) => string;
  labelWidth?: number;
}) {
  if (!data.length) return <EmptyState title="No data in range" />;
  const config = { [valueKey]: { label: valueKey, color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className={cn('aspect-auto w-full', className)} style={{ height: Math.max(140, data.length * 34 + 20) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={valueFormatter} />
        <YAxis type="category" dataKey={labelKey} tickLine={false} axisLine={false} width={labelWidth} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent hideLabel={false} valueFormatter={valueFormatter ? (v) => valueFormatter(Number(v)) : undefined} />} />
        <Bar dataKey={valueKey} fill={`var(--color-${valueKey})`} radius={0} />
      </BarChart>
    </ChartContainer>
  );
}

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)'];

export function DonutChart({
  data,
  nameKey,
  valueKey,
  colors,
  className,
  valueFormatter,
  center,
  legend = true,
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  colors?: string[];
  className?: string;
  valueFormatter?: (v: number) => string;
  center?: { value: string; label: string };
  /** hide when the caller renders its own (e.g. clickable) legend */
  legend?: boolean;
}) {
  const total = data.reduce((n, d) => n + Number(d[valueKey] ?? 0), 0);
  if (!total) return <EmptyState title="No data in range" />;
  const config: ChartConfig = Object.fromEntries(data.map((d, i) => [String(d[nameKey]), { label: String(d[nameKey]), color: (colors ?? PIE_COLORS)[i % (colors ?? PIE_COLORS).length] }]));
  return (
    <div className="relative">
      <ChartContainer config={config} className={cn('mx-auto aspect-square h-[220px]', className)}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel valueFormatter={valueFormatter ? (v) => valueFormatter(Number(v)) : undefined} />} />
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={58} outerRadius={90} strokeWidth={2} paddingAngle={2}>
            {data.map((d, i) => (
              <Cell key={i} fill={(colors ?? PIE_COLORS)[i % (colors ?? PIE_COLORS).length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {center && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-semibold tabular-nums">{center.value}</div>
          <div className="text-muted-foreground text-xs">{center.label}</div>
        </div>
      )}
      {legend && (
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {data.map((d, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="size-2 rounded-none" style={{ background: (colors ?? PIE_COLORS)[i % (colors ?? PIE_COLORS).length] }} />
            <span className="text-muted-foreground">{String(d[nameKey])}</span>
            <span className="font-medium tabular-nums">{valueFormatter ? valueFormatter(Number(d[valueKey])) : Number(d[valueKey]).toLocaleString()}</span>
          </span>
        ))}
      </div>
      )}
    </div>
  );
}
