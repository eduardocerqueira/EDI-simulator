import { Minus, Plus } from '@edi/ui/icons';
import { Button } from '@edi/ui/components/button';
import { cn } from '@edi/ui/lib/utils';

export function QuantityStepper({ value, max, onChange, size = 'default', className }: { value: number; max: number; onChange: (v: number) => void; size?: 'sm' | 'default'; className?: string }) {
  const h = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <div className={cn('inline-flex items-center rounded-none border bg-background', h, className)}>
      <Button type="button" variant="ghost" size="icon" className={cn('rounded-r-none', size === 'sm' ? 'size-8' : 'size-9')} onClick={() => onChange(value - 1)} aria-label="Decrease">
        <Minus />
      </Button>
      <input
        className="w-12 bg-transparent text-center text-sm tabular-nums outline-none"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          if (!Number.isNaN(n)) onChange(Math.min(max, n));
        }}
        aria-label="Quantity"
      />
      <Button type="button" variant="ghost" size="icon" className={cn('rounded-l-none', size === 'sm' ? 'size-8' : 'size-9')} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">
        <Plus />
      </Button>
    </div>
  );
}
