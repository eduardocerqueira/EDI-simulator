import { Copy } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { toast } from '@edi/ui/components/sonner';
import { EmptyState } from '@/components/common';

const LAYER: Record<string, string> = { ISA: 'text-chart-4', IEA: 'text-chart-4', TA1: 'text-chart-4', GS: 'text-[oklch(0.6_0.14_70)] dark:text-chart-2', GE: 'text-[oklch(0.6_0.14_70)] dark:text-chart-2', ST: 'text-chart-5', SE: 'text-chart-5' };

/** Raw X12 with segment IDs coloured by envelope layer and delimiters highlighted. */
export function RawX12({ content, elementSep = '*', segmentTerm = '~', maxHeight = 'max-h-[560px]' }: { content?: string | null; elementSep?: string; segmentTerm?: string; maxHeight?: string }) {
  if (!content) return <EmptyState title="No raw content" />;
  const segments = content.split(segmentTerm).map((s) => s.replace(/^[\r\n]+|[\r\n]+$/g, '')).filter((s) => s.trim());
  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-4 z-10"
        onClick={() => {
          void navigator.clipboard?.writeText(content);
          toast.success('X12 copied to clipboard');
        }}
      >
        <Copy /> Copy
      </Button>
      <pre className={`bg-muted/40 overflow-auto rounded-lg border p-4 font-mono text-xs leading-6 ${maxHeight}`}>
        {segments.map((seg, i) => {
          const parts = seg.split(elementSep);
          const id = parts[0]!;
          return (
            <div key={i} className="hover:bg-muted/70 -mx-2 px-2">
              <span className="text-muted-foreground mr-3 inline-block w-6 text-right select-none">{i + 1}</span>
              <span className={`font-bold ${LAYER[id.trim()] ?? ''}`}>{id}</span>
              {parts.slice(1).map((p, j) => (
                <span key={j}>
                  <span className="text-destructive font-bold">{elementSep}</span>
                  <span className="whitespace-pre">{p}</span>
                </span>
              ))}
              <span className="text-chart-3 font-bold">{segmentTerm}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
