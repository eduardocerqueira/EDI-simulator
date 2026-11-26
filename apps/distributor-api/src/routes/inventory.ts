import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { paging, q } from '../http.js';
import type { Prisma } from '../generated/prisma/index.js';

export async function inventoryRoutes(app: FastifyInstance) {
  app.get('/partners', async () => {
    const partners = await prisma.tradingPartner.findMany({ orderBy: { code: 'asc' } });
    const [products, ics, txs, lastSeen] = await Promise.all([
      prisma.product.groupBy({ by: ['partnerId'], _count: { _all: true }, _sum: { quantityOnHand: true } }),
      prisma.interchange.groupBy({ by: ['partnerId', 'status'], _count: { _all: true } }),
      prisma.transactionSet.groupBy({ by: ['partnerId', 'status'], _count: { _all: true } }),
      prisma.interchange.groupBy({ by: ['partnerId'], _max: { receivedAt: true } }),
    ]);
    return partners.map((p) => {
      const ic = ics.filter((x) => x.partnerId === p.id);
      const tx = txs.filter((x) => x.partnerId === p.id);
      const total = tx.reduce((n, x) => n + x._count._all, 0);
      const ok = tx.filter((x) => ['INGESTED', 'DELIVERED', 'DELIVERY_FAILED'].includes(x.status)).reduce((n, x) => n + x._count._all, 0);
      const prod = products.find((x) => x.partnerId === p.id);
      return {
        ...p,
        productCount: prod?._count._all ?? 0,
        unitsOnHand: prod?._sum.quantityOnHand ?? 0,
        interchanges: ic.reduce((n, x) => n + x._count._all, 0),
        interchangesRejected: ic.filter((x) => x.status === 'REJECTED').reduce((n, x) => n + x._count._all, 0),
        transactions: total,
        transactionsAccepted: ok,
        acceptanceRate: total ? ok / total : null,
        lastSeenAt: lastSeen.find((x) => x.partnerId === p.id)?._max.receivedAt ?? null,
      };
    });
  });

  app.get('/partners/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.tradingPartner.findUnique({
      where: { id },
      include: {
        products: { orderBy: { name: 'asc' } },
        interchanges: { take: 20, orderBy: { receivedAt: 'desc' }, include: { transactions: { select: { type: true, status: true } } } },
      },
    });
    if (!p) return reply.code(404).send({ error: 'Partner not found' });
    const issues = await prisma.validationIssue.groupBy({ by: ['code'], where: { interchange: { partnerId: id } }, _count: { _all: true }, orderBy: { _count: { code: 'desc' } }, take: 10 });
    return { ...p, topIssues: issues.map((i) => ({ code: i.code, count: i._count._all })), mailbox: { inbound: `/${p.ftpUser}/to_distributor`, outbound: `/${p.ftpUser}/from_distributor` } };
  });

  app.get('/inventory', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.ProductWhereInput = {
      ...(f.category ? { category: f.category } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(f.stock === 'low' ? { quantityOnHand: { gt: 0, lte: config.lowStockThreshold } } : f.stock === 'out' ? { quantityOnHand: { lte: 0 } } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { upc: { contains: f.q } }, { sku: { contains: f.q, mode: 'insensitive' } }] } : {}),
    };
    const sort = f.sort ?? 'name';
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === 'qty' ? { quantityOnHand: 'asc' } : sort === 'updated' ? { updatedAt: 'desc' } : sort === 'price' ? { sellPrice: 'desc' } : { name: 'asc' };
    const [items, total, categories] = await Promise.all([
      prisma.product.findMany({
        where, skip, take, orderBy,
        include: {
          partner: { select: { id: true, name: true, isaId: true } },
          lastTransaction: { select: { id: true, type: true, controlNumber: true, interchange: { select: { id: true, controlNumber: true } } } },
        },
      }),
      prisma.product.count({ where }),
      prisma.product.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    ]);
    return { items, total, page, pageSize, categories: categories.map((c) => c.category), lowStockThreshold: config.lowStockThreshold };
  });

  /** Product with its full movement history — each movement links back to the X12 transaction/envelope. */
  app.get('/inventory/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.product.findUnique({
      where: { id },
      include: {
        partner: true,
        // lightweight series for the quantity chart; the ledger is paginated below
        movements: { orderBy: { createdAt: 'desc' }, take: 100, select: { createdAt: true, quantityAfter: true } },
        _count: { select: { movements: true } },
      },
    });
    if (!p) return reply.code(404).send({ error: 'Product not found' });
    return p;
  });

  /** Movement ledger for one product: paginated, filterable by movement type and source (EDI or order). */
  app.get('/inventory/:id/movements', async (req) => {
    const { id } = req.params as { id: string };
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.InventoryMovementWhereInput = {
      productId: id,
      ...(f.type ? { type: f.type } : {}),
      ...(f.source === 'edi' ? { transactionId: { not: null } } : f.source === 'order' ? { orderNumber: { not: null } } : {}),
      ...(f.q?.trim()
        ? {
            OR: [
              { orderNumber: { contains: f.q.trim(), mode: 'insensitive' as const } },
              { note: { contains: f.q.trim(), mode: 'insensitive' as const } },
              { transaction: { controlNumber: { contains: f.q.trim() } } },
              { transaction: { interchange: { controlNumber: { contains: f.q.trim() } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { transaction: { select: { id: true, type: true, controlNumber: true, status: true, interchange: { select: { id: true, controlNumber: true, receivedAt: true, fileTransfer: { select: { fileName: true } } } } } } },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });
}
