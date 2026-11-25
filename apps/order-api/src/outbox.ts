import { randomUUID } from 'node:crypto';
import { EXCHANGES, type OrderEvent } from '@edi/shared';
import { MessageBus } from '@edi/shared/mq';
import { config } from './config.js';
import { prisma } from './db.js';
import type { Prisma } from './generated/prisma/index.js';

export const bus = new MessageBus(config.amqpUrl, 'order-api');

type Snap = Parameters<typeof toEvent>[1];

/**
 * Transactional outbox: the event is written in the SAME database transaction
 * as the order/bill change, then a background loop publishes it to RabbitMQ.
 * So an order can never be saved without its notification (or vice versa),
 * even if the broker is down.
 */
export async function enqueue(tx: Prisma.TransactionClient, type: OrderEvent['type'], snap: Snap) {
  const event = toEvent(type, snap);
  await tx.outboxEvent.create({ data: { routingKey: type, payload: event as object } });
}

function toEvent(
  type: OrderEvent['type'],
  s: {
    customer: { id: string; name: string; email: string; company: string | null; createdAt: Date };
    order?: { id: string; orderNumber: string; status: string; subtotal: number; total: number; createdAt: Date; cancelledAt: Date | null; items: Array<{ upc: string; sku: string; name: string; quantity: number; unitPrice: number; lineTotal: number }> };
    bill?: { id: string; billNumber: string; orderId: string; amount: number; status: string; issuedAt: Date; dueDate: Date; paidAt: Date | null } | null;
  },
): OrderEvent {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    type,
    customer: { id: s.customer.id, name: s.customer.name, email: s.customer.email, company: s.customer.company, createdAt: s.customer.createdAt.toISOString() },
    order: s.order && {
      id: s.order.id, orderNumber: s.order.orderNumber, status: s.order.status as 'PLACED' | 'CANCELLED', subtotal: s.order.subtotal, total: s.order.total,
      createdAt: s.order.createdAt.toISOString(), cancelledAt: s.order.cancelledAt?.toISOString() ?? null,
      items: s.order.items.map((i) => ({ upc: i.upc, sku: i.sku, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    },
    bill: s.bill ? {
      id: s.bill.id, billNumber: s.bill.billNumber, orderId: s.bill.orderId, amount: s.bill.amount, status: s.bill.status as 'OPEN' | 'PAID' | 'CANCELLED',
      issuedAt: s.bill.issuedAt.toISOString(), dueDate: s.bill.dueDate.toISOString(), paidAt: s.bill.paidAt?.toISOString() ?? null,
    } : undefined,
  };
}

export async function publishOutbox(): Promise<number> {
  if (!bus.connected) return 0;
  const pending = await prisma.outboxEvent.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 });
  let n = 0;
  for (const e of pending) {
    const ok = await bus.publish(EXCHANGES.orders, e.routingKey, e.payload);
    await prisma.outboxEvent.update({
      where: { id: e.id },
      data: ok ? { publishedAt: new Date(), attempts: { increment: 1 } } : { attempts: { increment: 1 }, lastError: 'broker unavailable' },
    });
    if (!ok) break;
    n++;
  }
  return n;
}
