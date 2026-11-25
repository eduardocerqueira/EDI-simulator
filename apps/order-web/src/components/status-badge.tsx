import { Badge } from '@edi/ui/components/badge';
import type { EffectiveBillStatus } from '@/lib/api';

export function OrderStatusBadge({ status }: { status: string }) {
  return status === 'CANCELLED' ? <Badge variant="muted">Cancelled</Badge> : <Badge variant="success">Placed</Badge>;
}

export function BillStatusBadge({ status }: { status: EffectiveBillStatus | string }) {
  switch (status) {
    case 'PAID':
      return <Badge variant="success">Paid</Badge>;
    case 'OVERDUE':
      return <Badge variant="destructive">Overdue</Badge>;
    case 'CANCELLED':
      return <Badge variant="muted">Voided</Badge>;
    default:
      return <Badge variant="info">Open</Badge>;
  }
}

export function StockBadge({ available }: { available: number }) {
  if (available <= 0) return <Badge variant="muted">Out of stock</Badge>;
  if (available <= 25) return <Badge variant="warning">Low · {available}</Badge>;
  return <Badge variant="success">In stock · {available.toLocaleString()}</Badge>;
}
