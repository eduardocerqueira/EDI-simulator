import type { LucideIcon } from '@edi/ui/icons';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@edi/ui/components/card';
import { Skeleton } from '@edi/ui/components/skeleton';
import { cn } from '@edi/ui/lib/utils';

export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', loading }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'info';
  loading?: boolean;
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/20 text-[oklch(0.5_0.12_70)] dark:text-warning',
    destructive: 'bg-destructive/10 text-destructive',
    info: 'bg-info/12 text-info',
  };
  return (
    <Card className="gap-0 py-5 transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums">{value}</p>}
          {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
        </div>
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-none', tones[tone])}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
