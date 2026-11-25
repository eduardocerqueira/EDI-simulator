import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@edi/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@edi/ui/components/table';
import type { ApiDelivery } from '@/lib/types';
import { fmt } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/common';

export function DeliveryCard({ d, action }: { d: ApiDelivery; action?: React.ReactNode }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Send className="size-4" /> POST <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{d.endpoint}</code>
          <StatusBadge status={d.status} />
        </CardTitle>
        <CardDescription>
          {d.attempts}/{d.maxAttempts} attempts · created {fmt.dateTime(d.createdAt)}
          {d.deliveredAt && ` · delivered ${fmt.dateTime(d.deliveredAt)}`}
          {d.status === 'RETRYING' && ` · next attempt ${fmt.time(d.nextAttemptAt)}`}
          {d.transaction && (
            <>
              {' · '}
              <Link className="text-primary hover:underline" to={`/edi/transactions/${d.transaction.id}`}>
                {d.transaction.type} #{d.transaction.controlNumber}
              </Link>
            </>
          )}
        </CardDescription>
        {action && <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">{action}</div>}
      </CardHeader>
      <CardContent>
        <AttemptsTable attempts={d.attemptLog} />
        {d.lastError && <p className="text-destructive mt-2 text-xs">Last error: {d.lastError}</p>}
      </CardContent>
    </Card>
  );
}

export function AttemptsTable({ attempts }: { attempts: ApiDelivery['attemptLog'] }) {
  if (!attempts?.length) return <p className="text-muted-foreground text-sm">No attempts yet — queued.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>HTTP</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {attempts.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="font-mono">{a.attemptNo}</TableCell>
            <TableCell className="text-xs">{fmt.dateTime(a.createdAt)}</TableCell>
            <TableCell>
              <StatusBadge status={a.success ? 'SUCCESS' : 'FAILURE'} label={a.success ? 'Success' : 'Failed'} />
            </TableCell>
            <TableCell className="font-mono text-xs">{a.statusCode ?? '—'}</TableCell>
            <TableCell className="text-xs">{fmt.ms(a.durationMs)}</TableCell>
            <TableCell className="text-destructive max-w-[380px] truncate text-xs whitespace-normal">{a.error ?? ''}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DeliveryList({ deliveries }: { deliveries: ApiDelivery[] }) {
  if (!deliveries?.length) return <EmptyState icon={Send} title="No REST deliveries" description="Only transaction sets that pass syntax + business validation are converted to JSON and sent to the order app." />;
  return (
    <div className="space-y-4">
      {deliveries.map((d) => (
        <DeliveryCard key={d.id} d={d} />
      ))}
    </div>
  );
}
