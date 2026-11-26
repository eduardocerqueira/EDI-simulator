import { CheckCircle2, Info, RotateCw, XCircle } from '@edi/ui/icons';
import { cn } from '@edi/ui/lib/utils';
import type { ProcessingEvent } from '@/lib/types';
import { fmt } from '@/lib/format';
import { EmptyState } from '@/components/common';

const ICON = {
  SUCCESS: { icon: CheckCircle2, cls: 'text-success bg-success/12' },
  FAILURE: { icon: XCircle, cls: 'text-destructive bg-destructive/12' },
  RETRY: { icon: RotateCw, cls: 'text-[oklch(0.6_0.14_70)] bg-warning/20' },
  INFO: { icon: Info, cls: 'text-info bg-info/12' },
} as const;

export function Timeline({ events }: { events: ProcessingEvent[] }) {
  if (!events?.length) return <EmptyState title="No processing events" />;
  const t0 = new Date(events[0]!.createdAt).getTime();
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const s = ICON[e.status as keyof typeof ICON] ?? ICON.INFO;
        const Icon = s.icon;
        return (
          <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < events.length - 1 && <span className="bg-border absolute top-8 left-4 h-[calc(100%-1.5rem)] w-px" />}
            <div className={cn('z-10 flex size-8 shrink-0 items-center justify-center rounded-none', s.cls)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">{e.stage.replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground font-mono text-xs">{fmt.time(e.createdAt)}</span>
                <span className="text-muted-foreground text-xs">+{fmt.ms(new Date(e.createdAt).getTime() - t0)}</span>
                {e.durationMs != null && <span className="bg-muted rounded-none px-1.5 text-xs">took {fmt.ms(e.durationMs)}</span>}
              </div>
              <p className="text-muted-foreground mt-0.5 text-sm break-words">{e.message}</p>
              {Boolean(e.details) && (
                <details className="mt-1">
                  <summary className="text-muted-foreground cursor-pointer text-xs">details</summary>
                  <pre className="bg-muted/50 mt-1 overflow-auto rounded-none p-2 font-mono text-[11px]">{JSON.stringify(e.details, null, 2)}</pre>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
