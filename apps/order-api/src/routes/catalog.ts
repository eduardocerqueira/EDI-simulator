import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/index.js';

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/products', async (req) => {
    const f = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(f.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(f.pageSize ?? 24) || 24));
    const where: Prisma.ProductWhereInput = {
      active: true,
      ...(f.category ? { category: f.category } : {}),
      ...(f.producer ? { producerCode: f.producer } : {}),
      ...(f.inStock === 'true' ? { available: { gt: 0 } } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { producerName: { contains: f.q, mode: 'insensitive' } }, { sku: { contains: f.q, mode: 'insensitive' } }] } : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      f.sort === 'price_asc' ? { price: 'asc' } : f.sort === 'price_desc' ? { price: 'desc' } : f.sort === 'stock' ? { available: 'desc' } : f.sort === 'new' ? { lastSyncedAt: 'desc' } : { name: 'asc' };
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get('/products/facets', async () => {
    const [categories, producers, stats] = await Promise.all([
      prisma.product.groupBy({ by: ['category'], where: { active: true }, _count: { _all: true }, orderBy: { category: 'asc' } }),
      prisma.product.groupBy({ by: ['producerCode', 'producerName'], where: { active: true }, _count: { _all: true }, orderBy: { producerName: 'asc' } }),
      prisma.product.aggregate({ where: { active: true }, _count: { _all: true }, _sum: { available: true } }),
    ]);
    const inStock = await prisma.product.count({ where: { active: true, available: { gt: 0 } } });
    return {
      categories: categories.map((c) => ({ category: c.category, count: c._count._all })),
      producers: producers.map((p) => ({ code: p.producerCode, name: p.producerName, count: p._count._all })),
      totalProducts: stats._count._all,
      inStock,
      totalUnits: stats._sum.available ?? 0,
    };
  });

  app.get('/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: 'Product not found' });
    return p;
  });
}
