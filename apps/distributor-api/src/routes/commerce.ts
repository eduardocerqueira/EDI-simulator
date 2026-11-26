import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { paging, q } from '../http.js';
import type { Prisma } from '../generated/prisma/index.js';

const billState = (b: { status: string; dueDate: Date }) => (b.status === 'OPEN' && b.dueDate < new Date() ? 'OVERDUE' : b.status);

const DAY = 86400_000;

/** Positive finite number from a query param, or undefined (NaN, negatives and blanks are ignored). */
function num(v: string | undefined) {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** `{ gte, lte }` range filter from optional min/max params; undefined when neither is set. */
function range(min: string | undefined, max: string | undefined) {
  const gte = num(min);
  const lte = num(max);
  return gte === undefined && lte === undefined ? undefined : { ...(gte !== undefined ? { gte } : {}), ...(lte !== undefined ? { lte } : {}) };
}

/** Lower bound for a "last N days" filter (max ~10 years), or undefined. */
function since(days: string | undefined) {
  const d = num(days);
  return d ? new Date(Date.now() - Math.min(d, 3650) * DAY) : undefined;
}

const pick = <T>(table: Record<string, T>, key: string | undefined, fallback: string): T => table[key && Object.hasOwn(table, key) ? key : fallback]!;

const customerMatch = (text: string): Prisma.CustomerWhereInput => ({
  OR: [{ name: { contains: text, mode: 'insensitive' } }, { company: { contains: text, mode: 'insensitive' } }],
});

const ORDER_SORT: Record<string, Prisma.CustomerOrderOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  total_desc: { total: 'desc' },
  total_asc: { total: 'asc' },
};

const BILL_SORT: Record<string, Prisma.BillOrderByWithRelationInput> = {
  newest: { issuedAt: 'desc' },
  oldest: { issuedAt: 'asc' },
  due_asc: { dueDate: 'asc' },
  amount_desc: { amount: 'desc' },
  amount_asc: { amount: 'asc' },
};

export async function commerceRoutes(app: FastifyInstance) {
  app.get('/customers', async (req) => {
    const f = q(req);
    // lite=1: just id/name/company, for filter dropdowns
    if (f.lite) return prisma.customer.findMany({ select: { id: true, name: true, company: true }, orderBy: [{ company: 'asc' }, { name: 'asc' }] });
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
    const text = f.q?.trim();
    const from = since(f.days);
    const totalRange = range(f.minTotal, f.maxTotal);
    const where: Prisma.CustomerOrderWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(from ? { createdAt: { gte: from } } : {}),
      ...(totalRange ? { total: totalRange } : {}),
      ...(text
        ? {
            OR: [
              { orderNumber: { contains: text, mode: 'insensitive' } },
              { customer: customerMatch(text) },
              // exact UPC / SKU of any line (JSON containment on the items array)
              { items: { array_contains: [{ upc: text }] } },
              { items: { array_contains: [{ sku: text }] } },
            ],
          }
        : {}),
    };
    const orderBy = [pick(ORDER_SORT, f.sort, 'newest'), { id: 'asc' as const }];
    const [items, total] = await Promise.all([
      prisma.customerOrder.findMany({ where, skip, take, orderBy, include: { customer: { select: { id: true, name: true, company: true } } } }),
      prisma.customerOrder.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get('/bills', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const now = new Date();
    const text = f.q?.trim();
    const from = since(f.days);
    const amountRange = range(f.minAmount, f.maxAmount);
    const and: Prisma.BillWhereInput[] = [];
    // OVERDUE is computed: an OPEN bill past its due date
    if (f.status === 'OVERDUE') and.push({ status: 'OPEN', dueDate: { lt: now } });
    else if (f.status) and.push({ status: f.status });
    // due window: overdue, or still open and due within the next N days
    if (f.due === 'overdue') and.push({ status: 'OPEN', dueDate: { lt: now } });
    else if (f.due === '7d' || f.due === '30d') and.push({ status: 'OPEN', dueDate: { gte: now, lte: new Date(now.getTime() + (f.due === '7d' ? 7 : 30) * DAY) } });
    if (f.customerId) and.push({ customerId: f.customerId });
    if (from) and.push({ issuedAt: { gte: from } });
    if (amountRange) and.push({ amount: amountRange });
    if (text) {
      // bills only carry orderId, so resolve matching order numbers first
      const orders = await prisma.customerOrder.findMany({ where: { orderNumber: { contains: text, mode: 'insensitive' } }, select: { id: true }, take: 500 });
      and.push({
        OR: [
          { billNumber: { contains: text, mode: 'insensitive' } },
          { orderId: { contains: text, mode: 'insensitive' } },
          ...(orders.length ? [{ orderId: { in: orders.map((o) => o.id) } }] : []),
          { customer: customerMatch(text) },
        ],
      });
    }
    const where: Prisma.BillWhereInput = and.length ? { AND: and } : {};
    const orderBy = [pick(BILL_SORT, f.sort, 'newest'), { id: 'asc' as const }];
    const [items, total] = await Promise.all([
      prisma.bill.findMany({ where, skip, take, orderBy, include: { customer: { select: { id: true, name: true, company: true } } } }),
      prisma.bill.count({ where }),
    ]);
    return { items: items.map((b) => ({ ...b, effectiveStatus: billState(b) })), total, page, pageSize };
  });
}
