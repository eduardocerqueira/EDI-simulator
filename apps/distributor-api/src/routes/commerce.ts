import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { paging, q } from '../http.js';
import type { Prisma } from '../generated/prisma/index.js';

const billState = (b: { status: string; dueDate: Date }) => (b.status === 'OPEN' && b.dueDate < new Date() ? 'OVERDUE' : b.status);

export async function commerceRoutes(app: FastifyInstance) {
  app.get('/customers', async (req) => {
    const f = q(req);
    const customers = await prisma.customer.findMany({
      where: f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { company: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q, mode: 'insensitive' } }] } : {},
      include: { orders: { select: { status: true, total: true, createdAt: true } }, bills: { select: { status: true, amount: true, dueDate: true } } },
      orderBy: { name: 'asc' },
    });
    return customers.map(({ orders, bills, ...c }) => {
      const placed = orders.filter((o) => o.status !== 'CANCELLED');
      return {
        ...c,
        orderCount: orders.length,
        cancelledCount: orders.length - placed.length,
        totalSpent: placed.reduce((n, o) => n + o.total, 0),
        openBalance: bills.filter((b) => b.status === 'OPEN').reduce((n, b) => n + b.amount, 0),
        overdueBalance: bills.filter((b) => billState(b) === 'OVERDUE').reduce((n, b) => n + b.amount, 0),
        lastOrderAt: orders.reduce<Date | null>((d, o) => (!d || o.createdAt > d ? o.createdAt : d), null),
      };
    });
  });

  app.get('/customers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.customer.findUnique({
      where: { id },
      include: { orders: { orderBy: { createdAt: 'desc' } }, bills: { orderBy: { issuedAt: 'desc' } } },
    });
    if (!c) return reply.code(404).send({ error: 'Customer not found' });
    return { ...c, bills: c.bills.map((b) => ({ ...b, effectiveStatus: billState(b) })) };
  });

  app.get('/orders', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.CustomerOrderWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.q ? { orderNumber: { contains: f.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.customerOrder.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, name: true, company: true } } } }),
      prisma.customerOrder.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get('/bills', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.BillWhereInput =
      f.status === 'OVERDUE' ? { status: 'OPEN', dueDate: { lt: new Date() } } : f.status ? { status: f.status } : {};
    const [items, total] = await Promise.all([
      prisma.bill.findMany({ where, skip, take, orderBy: { issuedAt: 'desc' }, include: { customer: { select: { id: true, name: true, company: true } } } }),
      prisma.bill.count({ where }),
    ]);
    return { items: items.map((b) => ({ ...b, effectiveStatus: billState(b) })), total, page, pageSize };
  });
}
