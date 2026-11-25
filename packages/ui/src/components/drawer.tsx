import * as React from 'react';
import { cn } from '../lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet';

/**
 * Drawer: the app-wide replacement for modal windows.
 * A panel sliding in from the right with a fixed header, a scrollable body
 * and an optional footer pinned to the bottom.
 */
const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
} as const;

function Drawer(props: React.ComponentProps<typeof Sheet>) {
  return <Sheet {...props} />;
}

function DrawerContent({
  size = 'md',
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SheetContent>, 'side'> & { size?: keyof typeof SIZES }) {
  return (
    <SheetContent side="right" className={cn('w-full gap-0 p-0', SIZES[size], className)} {...props}>
      {children}
    </SheetContent>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<typeof SheetHeader>) {
  return <SheetHeader className={cn('border-b p-4 pr-12', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof SheetTitle>) {
  return <SheetTitle className={cn('text-base break-words', className)} {...props} />;
}

const DrawerDescription = SheetDescription;

function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-body" className={cn('flex-1 space-y-4 overflow-y-auto overscroll-contain p-4', className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('bg-background flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end', className)} {...props} />;
}

export { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter };
