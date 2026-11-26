import type { LucideIcon } from '@edi/ui/icons';
import type { ReactNode } from 'react';
import { cn } from '@edi/ui/lib/utils';

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-none border border-dashed px-6 py-14 text-center', className)}>
      <div className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-none">
        <Icon className="size-6" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {description && <div className="text-muted-foreground mt-1.5 max-w-md text-sm">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
