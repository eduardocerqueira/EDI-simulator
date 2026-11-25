import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { nextSequence, prisma } from '../db.js';
import { enqueue } from '../outbox.js';
import type { Prisma } from '../generated/prisma/index.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const billState = (b: { status: string; dueDate: Date }) => (b.status === 'OPEN' && b.dueDate < new Date() ? 'OVERDUE' : b.status);
const withBillState = <T extends { status: string; dueDate: Date }>(b: T) => ({ ...b, effectiveStatus: billState(b) });

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
const fail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof HttpError) return reply.code(e.statusCode).send({ error: e.message });
  throw e;
};

export async function orderRoutes(app: FastifyInstance) {
  // ---------------- Orders ----------------
  app.get('/orders', async (req) => {
    const f = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(f.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize ?? 20) || 20));
    const where: Prisma.OrderWhereInput = { customerId: req.user.sub, ...(f.status ? { status: f.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { items: true, bill: true } }),
      prisma.order.count({ where }),
    ]);
    return { items: items.map((o) => ({ ...o, bill: o.bill && withBillState(o.bill) })), total, page, pageSize };
  });

  app.get('/orders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const o = await prisma.order.findFirst({ where: { id, customerId: req.user.sub }, include: { items: { include: { product: { select: { producerName: true, sourceEnvelopeIcn: true, category: true } } } }, bill: true } });
    if (!o) return reply.code(404).send({ error: 'Order not found' });
    return { ...o, bill: o.bill && withBillState(o.bill) };
  });

  /** Place an order: reserve stock, create the order and a bill due in 30 days, enqueue `order.created`. */
  app.post('/orders', async (req, reply) => {
    const body = (req.body ?? {}) as { items?: Array<{ productId: string; quantity: number }>; notes?: string };
    const lines = (body.items ?? []).filter((i) => i && i.productId && Number(i.quantity) > 0);
    if (!lines.length) return reply.code(400).send({ error: 'At least one item with quantity > 0 is required' });
    try {
      const order = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: req.user.sub } });
        const items: Array<{ productId: string; upc: string; sku: string; name: string; uom: string; quantity: number; unitPrice: number; lineTotal: number }> = [];
        for (const line of lines) {
          const qty = Math.floor(Number(line.quantity));
          // Conditional decrement = optimistic stock reservation (no overselling under concurrency).
          const res = await tx.product.updateMany({ where: { id: line.productId, active: true, available: { gte: qty } }, data: { available: { decrement: qty } } });
          const p = await tx.product.findUnique({ where: { id: line.productId } });
          if (!p) throw new HttpError(404, `Product ${line.productId} not found`);
          if (res.count === 0) throw new HttpError(409, `Not enough stock for ${p.name}: ${p.available} ${p.uom} available, ${qty} requested`);
          items.push({ productId: p.id, upc: p.upc, sku: p.sku, name: p.name, uom: p.uom, quantity: qty, unitPrice: p.price, lineTotal: round2(p.price * qty) });
        }
        const subtotal = round2(items.reduce((n, i) => n + i.lineTotal, 0));
        const seq = await nextSequence(tx, 'order');
        const created = await tx.order.create({
          data: { orderNumber: `HM-${String(seq).padStart(6, '0')}`, customerId: customer.id, status: 'PLACED', subtotal, total: subtotal, notes: body.notes, items: { create: items } },
          include: { items: true },
        });
        const issuedAt = new Date();
        const bill = await tx.bill.create({
          data: {
            billNumber: `INV-${String(seq).padStart(6, '0')}`, orderId: created.id, customerId: customer.id, amount: subtotal, status: 'OPEN', issuedAt,
            dueDate: new Date(issuedAt.getTime() + config.paymentTermsDays * 86400_000),
          },
        });
        await enqueue(tx, 'order.created', { customer, order: created, bill });
        return { ...created, bill: withBillState(bill) };
      });
      return reply.code(201).send(order);
    } catch (e) {
      return fail(reply, e);
    }
  });

  /** Cancel: release stock back, void the bill, enqueue `order.cancelled`. */
  app.post('/orders/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const order = await prisma.$transaction(async (tx) => {
        const o = await tx.order.findFirst({ where: { id, customerId: req.user.sub }, include: { items: true, bill: true, customer: true } });
        if (!o) throw new HttpError(404, 'Order not found');
        if (o.status !== 'PLACED') throw new HttpError(409, `Order is already ${o.status.toLowerCase()}`);
        if (o.bill?.status === 'PAID') throw new HttpError(409, 'Paid orders cannot be cancelled');
        for (const i of o.items) await tx.product.update({ where: { id: i.productId }, data: { available: { increment: i.quantity } } });
        const updated = await tx.order.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: { items: true } });
        const bill = o.bill ? await tx.bill.update({ where: { id: o.bill.id }, data: { status: 'CANCELLED' } }) : null;
        await enqueue(tx, 'order.cancelled', { customer: o.customer, order: updated, bill });
        return { ...updated, bill: bill && withBillState(bill) };
      });
      return order;
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---------------- Bills ----------------
  app.get('/bills', async (req) => {
    const f = req.query as Record<string, string | undefined>;
    const where: Prisma.BillWhereInput = {
      customerId: req.user.sub,
      ...(f.status === 'OVERDUE' ? { status: 'OPEN', dueDate: { lt: new Date() } } : f.status ? { status: f.status } : {}),
    };
    const bills = await prisma.bill.findMany({ where, orderBy: { issuedAt: 'desc' }, include: { order: { select: { id: true, orderNumber: true, status: true } } } });
    return bills.map(withBillState);
  });

  app.post('/bills/:id/pay', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await prisma.$transaction(async (tx) => {
        const b = await tx.bill.findFirst({ where: { id, customerId: req.user.sub }, include: { customer: true } });
        if (!b) throw new HttpError(404, 'Bill not found');
        if (b.status !== 'OPEN') throw new HttpError(409, `Bill is ${b.status.toLowerCase()}`);
        const bill = await tx.bill.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
        await enqueue(tx, 'bill.paid', { customer: b.customer, bill });
        return withBillState(bill);
      });
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---------------- Customer dashboard & reports ----------------
  app.get('/summary', async (req) => {
    const customerId = req.user.sub;
    const [orders, bills, recent] = await Promise.all([
      prisma.order.findMany({ where: { customerId }, include: { items: { include: { product: { select: { category: true, producerName: true } } } } } }),
      prisma.bill.findMany({ where: { customerId } }),
      prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 5, include: { bill: true, items: true } }),
    ]);
    const placed = orders.filter((o) => o.status === 'PLACED');
    const monthly = new Map<string, { month: string; orders: number; spend: number; cancelled: number }>();
    for (const o of orders) {
      const m = o.createdAt.toISOString().slice(0, 7);
      const cur = monthly.get(m) ?? { month: m, orders: 0, spend: 0, cancelled: 0 };
      cur.orders++;
      if (o.status === 'CANCELLED') cur.cancelled++;
      else cur.spend = round2(cur.spend + o.total);
      monthly.set(m, cur);
    }
    const daily = new Map<string, { day: string; orders: number; spend: number }>();
    for (const o of placed) {
      const d = o.createdAt.toISOString().slice(0, 10);
      const cur = daily.get(d) ?? { day: d, orders: 0, spend: 0 };
      cur.orders++;
      cur.spend = round2(cur.spend + o.total);
      daily.set(d, cur);
    }
    const byCategory = new Map<string, number>();
    const byProducer = new Map<string, number>();
    const topProducts = new Map<string, { name: string; quantity: number; spend: number; uom: string }>();
    for (const o of placed) {
      for (const i of o.items) {
        byCategory.set(i.product.category, round2((byCategory.get(i.product.category) ?? 0) + i.lineTotal));
        byProducer.set(i.product.producerName, round2((byProducer.get(i.product.producerName) ?? 0) + i.lineTotal));
        const t = topProducts.get(i.upc) ?? { name: i.name, quantity: 0, spend: 0, uom: i.uom };
        t.quantity += i.quantity;
        t.spend = round2(t.spend + i.lineTotal);
        topProducts.set(i.upc, t);
      }
    }
    const billsWithState = bills.map(withBillState);
    const sum = (xs: typeof billsWithState) => round2(xs.reduce((n, b) => n + b.amount, 0));
    return {
      totals: {
        orders: orders.length,
        placed: placed.length,
        cancelled: orders.length - placed.length,
        spend: round2(placed.reduce((n, o) => n + o.total, 0)),
        avgOrderValue: placed.length ? round2(placed.reduce((n, o) => n + o.total, 0) / placed.length) : 0,
        openBills: billsWithState.filter((b) => b.status === 'OPEN').length,
        openAmount: sum(billsWithState.filter((b) => b.status === 'OPEN')),
        overdueBills: billsWithState.filter((b) => b.effectiveStatus === 'OVERDUE').length,
        overdueAmount: sum(billsWithState.filter((b) => b.effectiveStatus === 'OVERDUE')),
        paidAmount: sum(billsWithState.filter((b) => b.status === 'PAID')),
        nextDue: billsWithState.filter((b) => b.status === 'OPEN').sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null,
      },
      monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
      byCategory: [...byCategory.entries()].map(([category, spend]) => ({ category, spend })).sort((a, b) => b.spend - a.spend),
      byProducer: [...byProducer.entries()].map(([producer, spend]) => ({ producer, spend })).sort((a, b) => b.spend - a.spend),
      topProducts: [...topProducts.values()].sort((a, b) => b.spend - a.spend).slice(0, 8),
      billStatus: ['OPEN', 'OVERDUE', 'PAID', 'CANCELLED'].map((s) => ({ status: s, count: billsWithState.filter((b) => b.effectiveStatus === s).length, amount: sum(billsWithState.filter((b) => b.effectiveStatus === s)) })),
      recentOrders: recent.map((o) => ({ ...o, bill: o.bill && withBillState(o.bill) })),
    };
  });
}
