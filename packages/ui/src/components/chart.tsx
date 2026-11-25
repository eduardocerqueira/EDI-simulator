import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '../lib/utils';

/**
 * shadcn/ui chart primitives on top of Recharts.
 * `config` maps each data key to a label and colour; colours are exposed as
 * CSS variables `--color-<key>` so series can use `fill="var(--color-key)"`.
 */
export type ChartConfig = {
  [k: string]: { label?: React.ReactNode; icon?: React.ComponentType; color?: string };
};

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within a <ChartContainer />');
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'] }) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const entries = Object.entries(config).filter(([, c]) => c.color);
  if (!entries.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${entries.map(([key, c]) => `  --color-${key}: ${c.color};`).join('\n')}\n}`,
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipItem = { name?: string | number; value?: unknown; dataKey?: string | number; color?: string; payload?: Record<string, unknown> };

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  labelFormatter,
  valueFormatter,
  indicator = 'dot',
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: unknown;
  className?: string;
  hideLabel?: boolean;
  labelFormatter?: (label: unknown) => React.ReactNode;
  valueFormatter?: (value: unknown, key: string) => React.ReactNode;
  indicator?: 'dot' | 'line';
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className={cn('border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl', className)}>
      {!hideLabel && <div className="font-medium">{labelFormatter ? labelFormatter(label) : String(label ?? '')}</div>}
      <div className="grid gap-1.5">
        {payload.map((item, i) => {
          const key = String(item.dataKey ?? item.name ?? i);
          const c = config[key];
          const color = item.color ?? (item.payload?.fill as string | undefined);
          return (
            <div key={key + i} className="flex w-full items-center gap-2">
              <div className={cn('shrink-0 rounded-[2px]', indicator === 'dot' ? 'size-2.5' : 'h-3 w-1')} style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{c?.label ?? item.name}</span>
              <span className="text-foreground ml-auto font-mono font-medium tabular-nums">
                {valueFormatter ? valueFormatter(item.value, key) : typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value ?? '')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({ payload, className }: { payload?: Array<{ value?: string; dataKey?: string | number; color?: string }>; className?: string }) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-4 pt-3', className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value);
        return (
          <div key={key} className="flex items-center gap-1.5">
            <div className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{config[key]?.label ?? item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle };
