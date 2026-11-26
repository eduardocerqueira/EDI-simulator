import {
  Activity, BellOff, BellRing, CircleAlert, CircleCheck, CirclePlay, HeartPulse, Loader, PackagePlus, Trash2, XOctagon, Zap, type LucideIcon,
} from 'lucide-react';
import { Badge } from '@edi/ui/components/badge';
import { cn } from '@edi/ui/lib/utils';
import { EmptyState } from '@/components/common';
import { fmt } from '@/lib/format';
import { EVENT_META, nodeColor, toneBg, toneText } from '@/lib/platform';
import type { ClusterEvent, ClusterEventType } from '@/lib/types';

const ICONS: Record<ClusterEventType, LucideIcon> = {
  CONTROLLER_STARTED: CirclePlay,
  CHAOS_INJECTED: Zap,
  PROBE_FAILED: HeartPulse,
  NODE_DOWN: CircleAlert,
  NODE_REPLACING: Loader,
  NODE_REMOVED: Trash2,
  NODE_SPAWNED: PackagePlus,
  NODE_RECOVERED: CircleCheck,
  NODE_READY: CircleCheck,
  ALERT_FIRING: BellRing,
  ALERT_RESOLVED: BellOff,
  REPLACE_FAILED: XOctagon,
};

export function EventTimeline({ events, limit = 40 }: { events: ClusterEvent[]; limit?: number }) {
  if (!events.length) return <EmptyState icon={Activity} title="No events yet" description="Node lifecycle events (failures, replacements, recoveries) appear here." />;
  return (
    <ol className="relative">
      {events.slice(0, limit).map((e, i) => {
        const meta = EVENT_META[e.type] ?? { label: e.type, tone: 'muted' as const };
        const Icon = ICONS[e.type] ?? Activity;
        const slot = e.slot ?? (e.node ? Number(e.node.replace(/\D/g, '')) : undefined);
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < Math.min(events.length, limit) - 1 && <span className="bg-border absolute top-8 bottom-0 left-[15px] w-px" />}
            <div className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full', toneBg[meta.tone])}>
              <Icon className={cn('size-4', toneText[meta.tone])} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('text-sm font-medium', toneText[meta.tone])}>{meta.label}</span>
                {e.node && (
                  <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                    {slot ? <span className="size-1.5 rounded-full" style={{ background: nodeColor(slot) }} /> : null}
                    {e.node}
                  </Badge>
                )}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums" title={fmt.dateTime(e.at)}>
                  {fmt.time(e.at)} · {fmt.ago(e.at)}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-sm break-words">{e.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
