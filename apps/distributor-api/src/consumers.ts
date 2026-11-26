import { QUEUES, type EdiEvent, type OrderEvent, type PlatformEvent } from '@edi/shared';
import { bus } from './bus.js';
import { prisma } from './db.js';
import { log } from './log.js';

const money = (n: number) => `$${n.toFixed(2)}`;

/** Wire RabbitMQ consumers. Call before `bus.start()`. */
export function registerConsumers() {
  // 1) Notification center: EDI failures / rejections routed by edi.*.rejected and edi.*.failed
  bus.consume(QUEUES.distributorNotifications, async (body) => {
    const e = body as EdiEvent;
    const exists = e.interchangeId ? await prisma.interchange.findUnique({ where: { id: e.interchangeId }, select: { id: true } }) : null;
    await prisma.notification.create({
      data: {
        type: e.routingKey, severity: e.severity, title: e.title, message: e.message, payload: e as object,
        interchangeId: exists?.id, transactionId: e.transactionId,
      },
    });
  });

  // 2) Platform (FTP cluster) events from the platform controller: node down / replaced / ready, alerts, chaos
  bus.consume(QUEUES.distributorPlatform, async (body) => {
    const e = body as PlatformEvent;
    await prisma.notification.create({
      data: { type: e.routingKey, severity: e.severity, title: e.title, message: e.message, source: 'platform-controller', payload: e as object },
    });
  });

  // 3) Order app events: maintain a replica of customers / orders / bills and adjust stock.
  bus.consume(QUEUES.distributorOrderEvents, async (body) => {
    const e = body as OrderEvent;
    const seen = await prisma.orderEventLog.findUnique({ where: { eventId: e.eventId } });
    if (seen) return; // idempotent consumer
    await prisma.$transaction(async (tx) => {
      await tx.orderEventLog.create({ data: { eventId: e.eventId, routingKey: e.type, payload: e as object } });
      const c = e.customer;
      await tx.customer.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, email: c.email, company: c.company, createdAt: new Date(c.createdAt) },
        update: { name: c.name, email: c.email, company: c.company, syncedAt: new Date() },
      });
      if (e.order) {
        const o = e.order;
        const data = {
          orderNumber: o.orderNumber, customerId: c.id, status: o.status, subtotal: o.subtotal, total: o.total,
          itemCount: o.items.reduce((n, i) => n + i.quantity, 0), items: o.items as object, createdAt: new Date(o.createdAt),
          cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null, syncedAt: new Date(),
        };
        await tx.customerOrder.upsert({ where: { id: o.id }, create: { id: o.id, ...data }, update: data });
        // Stock follows orders: placed → decrement, cancelled → put back.
        if (e.type === 'order.created' || e.type === 'order.cancelled') {
          const sign = e.type === 'order.created' ? -1 : 1;
          for (const item of o.items) {
            const p = await tx.product.findUnique({ where: { upc: item.upc } });
            if (!p) continue;
            const updated = await tx.product.update({ where: { id: p.id }, data: { quantityOnHand: { increment: sign * item.quantity } } });
            await tx.inventoryMovement.create({
              data: {
                productId: p.id, orderNumber: o.orderNumber, type: sign < 0 ? 'ORDER_PLACED' : 'ORDER_CANCELLED',
                quantityDelta: sign * item.quantity, quantityAfter: updated.quantityOnHand, note: `${o.orderNumber} for ${c.company ?? c.name}`,
              },
            });
          }
        }
      }
      if (e.bill) {
        const b = e.bill;
        const data = {
          billNumber: b.billNumber, orderId: b.orderId, customerId: c.id, amount: b.amount, status: b.status,
          issuedAt: new Date(b.issuedAt), dueDate: new Date(b.dueDate), paidAt: b.paidAt ? new Date(b.paidAt) : null, syncedAt: new Date(),
        };
        await tx.bill.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
      }
      const n = notificationFor(e);
      if (n) await tx.notification.create({ data: { ...n, type: e.type, payload: e as object, orderNumber: e.order?.orderNumber } });
    });
    log.info(`[orders] ${e.type} ${e.order?.orderNumber ?? e.customer.email}`);
  });
}

function notificationFor(e: OrderEvent): { severity: string; title: string; message: string } | null {
  const who = e.customer.company ?? e.customer.name;
  switch (e.type) {
    case 'order.created':
      return { severity: 'INFO', title: `New order ${e.order!.orderNumber}`, message: `${who} ordered ${e.order!.items.length} line(s) for ${money(e.order!.total)} — bill ${e.bill?.billNumber} due ${e.bill?.dueDate.slice(0, 10)}` };
    case 'order.cancelled':
      return { severity: 'WARNING', title: `Order ${e.order!.orderNumber} cancelled`, message: `${who} cancelled ${money(e.order!.total)}; stock released and bill ${e.bill?.billNumber ?? ''} voided` };
    case 'bill.paid':
      return { severity: 'INFO', title: `Bill ${e.bill!.billNumber} paid`, message: `${who} paid ${money(e.bill!.amount)}` };
    case 'customer.registered':
      return { severity: 'INFO', title: 'New customer', message: `${who} (${e.customer.email}) registered` };
    default:
      return null;
  }
}
