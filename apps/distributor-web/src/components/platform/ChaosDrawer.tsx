import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pause, Skull, Zap } from 'lucide-react';
import { Button } from '@edi/ui/components/button';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@edi/ui/components/drawer';
import { toast } from '@edi/ui/components/sonner';
import { cn } from '@edi/ui/lib/utils';
import { api } from '@/lib/api';
import type { PlatformNode } from '@/lib/types';

type Mode = 'pause' | 'kill';

const MODES: Array<{ mode: Mode; title: string; icon: typeof Pause; what: string; how: string; expect: string }> = [
  {
    mode: 'pause',
    title: 'Freeze (unresponsive)',
    icon: Pause,
    what: 'docker pause',
    how: 'The node keeps accepting TCP connections but never sends the FTP "220" greeting — the nasty "hung server" failure a plain port check would miss.',
    expect: 'Expect: probe failures → declared DOWN after the threshold → container replaced → READY in ~10s.',
  },
  {
    mode: 'kill',
    title: 'Crash',
    icon: Skull,
    what: 'docker kill',
    how: 'The vsftpd process dies and the container exits.',
    expect: 'Expect: detected on the next reconcile (container exited) → replaced → READY in a few seconds.',
  },
];

/**
 * Confirmation drawer for chaos testing. `node` undefined = random READY node.
 * Same effect as `npm run chaos:ftp`, but through the platform controller API.
 */
export function ChaosDrawer({ open, onOpenChange, node }: { open: boolean; onOpenChange: (o: boolean) => void; node?: PlatformNode }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('pause');
  useEffect(() => {
    if (open) setMode('pause');
  }, [open]);
  const chaos = useMutation({
    mutationFn: () => api<{ slot: number; node: string; container: string; mode: Mode }>('/platform/chaos', { method: 'POST', json: { slot: node?.slot, mode } }),
    onSuccess: (r) => {
      toast.warning(`${r.mode === 'pause' ? 'Froze' : 'Killed'} ${r.node}`, { description: 'Watch the node card and the recovery timeline — the controller will replace it.' });
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: (e) => toast.error('Could not inject the failure', { description: (e as Error).message }),
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="md">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Zap className="text-warning size-5" /> Simulate failure {node ? `on ${node.name}` : 'on a random node'}
          </DrawerTitle>
          <DrawerDescription>
            Break a node on purpose and watch the platform heal itself: the controller probes every node, declares it down, spawns a
            replacement container on the shared storage volume and the load balancer routes producers to the healthy nodes meanwhile.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="grid gap-3">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                onClick={() => setMode(m.mode)}
                className={cn(
                  'cursor-pointer rounded-xl border p-4 text-left transition-colors',
                  mode === m.mode ? 'border-primary bg-primary/5 ring-primary/30 ring-2' : 'hover:bg-muted/50',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <m.icon className="size-4" /> {m.title}
                  <code className="bg-muted ml-auto rounded px-1.5 py-0.5 font-mono text-xs">{m.what}</code>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">{m.how}</p>
                <p className="mt-2 text-xs">{m.expect}</p>
              </button>
            ))}
          </div>
          <div className="bg-muted/50 text-muted-foreground rounded-lg border p-3 text-xs">
            Same as the CLI: <code className="font-mono">npm run chaos:ftp -- {node ? `--node ${node.slot} ` : ''}--mode {mode}</code>
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={chaos.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => chaos.mutate()} disabled={chaos.isPending}>
            {chaos.isPending ? <Loader2 className="animate-spin" /> : <Zap />} {mode === 'pause' ? 'Freeze' : 'Crash'} {node ? node.name : 'a random node'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
