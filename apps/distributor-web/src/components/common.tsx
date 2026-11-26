import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Inbox, type LucideIcon } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { Button } from '@edi/ui/components/button';
import { Card, CardContent } from '@edi/ui/components/card';
import { Skeleton } from '@edi/ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edi/ui/components/tooltip';
import { cn } from '@edi/ui/lib/utils';
import { statusLabel, statusVariant } from '@/lib/status';

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm">
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status, label, className }: { status: string | null | undefined; label?: string; className?: string }) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {label ?? statusLabel(status)}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  help,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  help?: string;
  to?: string;
}) {
  const toneCls = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/20 text-[oklch(0.55_0.13_70)] dark:text-warning',
    destructive: 'bg-destructive/12 text-destructive',
    info: 'bg-info/12 text-info',
  }[tone];
  const body = (
    <Card className={cn('gap-0 py-4 transition-shadow', to && 'hover:shadow-md')}>
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {help ? (
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">{label}</TooltipTrigger>
                <TooltipContent>{help}</TooltipContent>
              </Tooltip>
            ) : (
              label
            )}
          </div>
          {Icon && (
            <div className={cn('flex size-8 items-center justify-center rounded-none', toneCls)}>
              <Icon className="size-4" />
            </div>
          )}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function EmptyState({ title = 'Nothing here yet', description, icon: Icon = Inbox }: { title?: string; description?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-none">
        <Icon className="text-muted-foreground size-6" />
      </div>
      <div className="font-medium">{title}</div>
      {description && <div className="text-muted-foreground max-w-md text-sm">{description}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-none border p-4 text-sm">
      {(error as Error)?.message ?? 'Something went wrong'}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
      <span>
        {total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft /> Prev
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Label/value grid for detail cards. */
export function Fields({ items, cols = 2 }: { items: Array<[ReactNode, ReactNode]>; cols?: 1 | 2 | 3 | 4 }) {
  const grid = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 text-sm', grid)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{k}</dt>
          <dd className="mt-0.5 truncate font-medium">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[0.8rem]', className)}>{children}</span>;
}

export function CodeBlock({ children, className, maxHeight = 'max-h-[560px]' }: { children: ReactNode; className?: string; maxHeight?: string }) {
  return (
    <pre className={cn('bg-muted/50 overflow-auto rounded-none border p-4 font-mono text-xs leading-relaxed', maxHeight, className)}>{children}</pre>
  );
}

/** Pretty JSON with light syntax colouring. */
export function JsonView({ value, maxHeight }: { value: unknown; maxHeight?: string }) {
  if (value === undefined || value === null) return <EmptyState title="No JSON available" description="This document was not mapped (it was rejected before mapping)." />;
  const json = JSON.stringify(value, null, 2);
  const parts = json.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\b-?\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g);
  return (
    <CodeBlock maxHeight={maxHeight}>
      {parts.map((p, i) => {
        if (/^".*":$/.test(p.replace(/\s/g, ''))) return <span key={i} className="text-info">{p}</span>;
        if (/^"/.test(p)) return <span key={i} className="text-success">{p}</span>;
        if (/^-?\d/.test(p)) return <span key={i} className="text-[oklch(0.6_0.15_50)]">{p}</span>;
        if (/^(true|false|null)$/.test(p)) return <span key={i} className="text-chart-5">{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </CodeBlock>
  );
}

export function RangeSelect({ value, onChange, options }: { value: number; onChange: (v: number) => void; options?: Array<[number, string]> }) {
  const opts = options ?? [
    [1, '1h'],
    [6, '6h'],
    [24, '24h'],
    [168, '7d'],
  ];
  return (
    <div className="bg-muted inline-flex rounded-none p-[3px]">
      {opts.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn('cursor-pointer rounded-none px-3 py-1 text-sm font-medium transition-colors', value === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function LiveDot({ label = 'Live' }: { label?: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span className="relative flex size-2">
        <span className="bg-success absolute inline-flex size-full animate-ping rounded-none opacity-60" />
        <span className="bg-success relative inline-flex size-2 rounded-none" />
      </span>
      {label}
    </span>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </div>
  );
}

export function NativeSelect({ value, onChange, options, className, placeholder }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; className?: string; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('border-input dark:bg-input/30 h-9 cursor-pointer rounded-none border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', className)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
