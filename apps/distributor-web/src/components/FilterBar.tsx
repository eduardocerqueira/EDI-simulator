import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { Input } from '@edi/ui/components/input';

export function FilterBar({ children, search, onSearch, onReset, placeholder = 'Search…' }: { children?: ReactNode; search?: string; onSearch?: (v: string) => void; onReset?: () => void; placeholder?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      {onSearch && (
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input className="pl-8" placeholder={placeholder} value={search ?? ''} onChange={(e) => onSearch(e.target.value)} />
        </div>
      )}
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="ml-auto">
          <X /> Reset
        </Button>
      )}
    </div>
  );
}
