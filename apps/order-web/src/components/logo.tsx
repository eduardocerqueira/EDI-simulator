import { Sprout } from 'lucide-react';
import { cn } from '@edi/ui/lib/utils';

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl shadow-sm">
        <Sprout className="size-5" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-semibold tracking-tight">Harvest Market</div>
          <div className="text-muted-foreground text-[11px] tracking-wide uppercase">Wholesale ordering</div>
        </div>
      )}
    </div>
  );
}
