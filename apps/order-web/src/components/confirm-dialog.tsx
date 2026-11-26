import type { ReactNode } from 'react';
import { Button } from '@edi/ui/components/button';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { Loader2 } from '@edi/ui/icons';

/** Confirmation prompt shown in a right-side drawer. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, loading, onConfirm, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="sm">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {description && <DrawerDescription asChild><div>{description}</div></DrawerDescription>}
          {children}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Keep it</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
