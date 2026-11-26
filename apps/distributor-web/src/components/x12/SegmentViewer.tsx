import { useState } from 'react';
import { AlertCircle, ChevronRight } from '@edi/ui/icons';
import { Badge } from '@edi/ui/components/badge';
import { cn } from '@edi/ui/lib/utils';
import type { DescribedSegment } from '@/lib/types';
import { EmptyState } from '@/components/common';

export const LAYER_STYLE: Record<string, { bar: string; text: string; bg: string; label: string }> = {
  interchange: { bar: 'bg-chart-4', text: 'text-chart-4', bg: 'bg-chart-4/8', label: 'Interchange envelope' },
  group: { bar: 'bg-chart-2', text: 'text-[oklch(0.6_0.14_70)] dark:text-chart-2', bg: 'bg-chart-2/10', label: 'Functional group' },
  transaction: { bar: 'bg-chart-5', text: 'text-chart-5', bg: 'bg-chart-5/8', label: 'Transaction set' },
  detail: { bar: 'bg-muted-foreground/30', text: 'text-foreground', bg: '', label: 'Detail segment' },
};

/** Raw segment with the segment ID and separators highlighted. */
export function SegmentText({ raw, layer, separator = '*' }: { raw: string; layer: string; separator?: string }) {
  const term = raw.slice(-1);
  const body = /[~\n']/.test(term) ? raw.slice(0, -1) : raw;
  const parts = body.split(separator);
  const style = LAYER_STYLE[layer] ?? LAYER_STYLE.detail!;
  return (
    <span className="font-mono text-[0.8rem] break-all whitespace-pre-wrap">
      <span className={cn('font-bold', style.text)}>{parts[0]}</span>
      {parts.slice(1).map((p, i) => (
        <span key={i}>
          <span className="text-destructive font-bold">{separator}</span>
          <span>{p}</span>
        </span>
      ))}
      {body !== raw && <span className="text-chart-3 font-bold">{term}</span>}
    </span>
  );
}

function SegmentRow({ seg, defaultOpen, relative }: { seg: DescribedSegment; defaultOpen?: boolean; relative?: number }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const style = LAYER_STYLE[seg.layer] ?? LAYER_STYLE.detail!;
  const errors = seg.issues ?? [];
  return (
    <div className={cn('border-b last:border-0', errors.length && 'bg-destructive/[0.04]')}>
      <button onClick={() => setOpen((o) => !o)} className="hover:bg-muted/50 flex w-full cursor-pointer items-start gap-3 px-3 py-1.5 text-left">
        <span className={cn('mt-1 h-4 w-1 shrink-0 rounded-none', style.bar)} />
        <span className="text-muted-foreground w-8 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums">{relative ?? seg.position}</span>
        <ChevronRight className={cn('text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform', open && 'rotate-90')} />
        <div className="min-w-0 flex-1">
          <SegmentText raw={seg.raw} layer={seg.layer} />
        </div>
        <span className="text-muted-foreground hidden shrink-0 pt-0.5 text-xs md:inline">{seg.name ?? 'Unknown segment'}</span>
        {errors.length > 0 && (
          <Badge variant="destructive" className="shrink-0">
            <AlertCircle /> {errors.length}
          </Badge>
        )}
      </button>
      {open && (
        <div className="bg-muted/30 border-t px-4 py-3 pl-16">
          <div className="mb-2 text-sm">
            <span className="font-semibold">{seg.id}</span> — {seg.name ?? 'Segment not in dictionary'}
            <Badge variant="outline" className="ml-2">{style.label}</Badge>
            {seg.purpose && <p className="text-muted-foreground mt-1 text-xs">{seg.purpose}</p>}
          </div>
          {errors.length > 0 && (
            <div className="mb-3 space-y-1">
              {errors.map((e, i) => (
                <div key={i} className="text-destructive flex items-start gap-2 text-xs">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {e.x12Code && (
                      <Badge variant="destructive" className="mr-1.5 font-mono">
                        {e.x12CodeSource} {e.x12Code}
                      </Badge>
                    )}
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-x-auto rounded-none border">
            <table className="bg-background w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Pos</th>
                  <th className="px-2 py-1.5 text-left font-medium">Ref</th>
                  <th className="px-2 py-1.5 text-left font-medium">Element</th>
                  <th className="px-2 py-1.5 text-left font-medium">Value</th>
                  <th className="px-2 py-1.5 text-left font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {seg.elements.map((e) => {
                  const bad = errors.some((x) => x.elementPosition && `${seg.id}${String(x.elementPosition).padStart(2, '0')}` === e.position);
                  return (
                    <tr key={e.position} className={cn('border-t', bad && 'bg-destructive/10')}>
                      <td className="px-2 py-1 font-mono font-medium">{e.position}</td>
                      <td className="text-muted-foreground px-2 py-1 font-mono">{e.ref ?? '—'}</td>
                      <td className="px-2 py-1">{e.name ?? <span className="text-muted-foreground">Not defined</span>}</td>
                      <td className="px-2 py-1 font-mono">
                        {e.value === '' ? <span className="text-muted-foreground italic">(empty)</span> : <span className="bg-muted rounded-none px-1 whitespace-pre">{e.value}</span>}
                      </td>
                      <td className="text-muted-foreground px-2 py-1">{e.codeDescription ?? ''}</td>
                    </tr>
                  );
                })}
                {seg.elements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground px-2 py-2">No elements</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function SegmentLegend() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {Object.entries(LAYER_STYLE).map(([k, v]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn('h-3 w-1 rounded-none', v.bar)} /> {v.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="text-destructive font-mono font-bold">*</span> element separator
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-chart-3 font-mono font-bold">~</span> segment terminator
      </span>
    </div>
  );
}

export function SegmentViewer({ segments, relativeTo, expandErrors = true }: { segments: DescribedSegment[]; relativeTo?: number; expandErrors?: boolean }) {
  if (!segments?.length) return <EmptyState title="No segments" description="The file could not be parsed into segments." />;
  return (
    <div className="space-y-3">
      <SegmentLegend />
      <div className="overflow-hidden rounded-none border">
        {segments.map((s) => (
          <SegmentRow key={s.position} seg={s} defaultOpen={expandErrors && s.issues?.length > 0} relative={relativeTo ? s.position - relativeTo + 1 : undefined} />
        ))}
      </div>
    </div>
  );
}
