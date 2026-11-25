import type { FastifyInstance } from 'fastify';
import type { InventorySyncPayload } from '@edi/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';

/**
 * Machine-to-machine endpoint called by the distributor after it converted an
 * X12 832/846/856 into JSON. Idempotent on `transactionId`, so the
 * distributor can safely retry.
 */
export async function integrationRoutes(app: FastifyInstance) {
  app.post('/inventory', async (req, reply) => {
    if (req.headers['x-api-key'] !== config.integrationApiKey) return reply.code(401).send({ error: 'Invalid API key' });
    const p = req.body as InventorySyncPayload;
    if (!p?.transactionId || !Array.isArray(p.items) || !p.producer) return reply.code(400).send({ error: 'Invalid payload: transactionId, producer and items are required' });
    const bad = p.items.find((i) => !i.upc || typeof i.price !== 'number' || typeof i.quantityAvailable !== 'number');
    if (bad) return reply.code(422).send({ error: `Invalid item ${JSON.stringify(bad).slice(0, 200)}` });

    const existing = await prisma.inventorySync.findUnique({ where: { distributorTransactionId: p.transactionId } });
    if (existing) return { ok: true, duplicate: true, syncId: existing.id, items: existing.itemCount };

    const sync = await prisma.$transaction(async (tx) => {
      for (const i of p.items) {
        const data = {
          sku: i.sku, name: i.name, category: i.category, uom: i.uom, price: i.price, available: Math.max(0, Math.round(i.quantityAvailable)),
          producerCode: p.producer.code, producerName: p.producer.name, sourceTransactionId: p.transactionId, sourceTransactionType: p.transactionType,
          sourceEnvelopeIcn: p.envelope?.interchangeControlNumber, lastSyncedAt: new Date(), active: true,
        };
        await tx.product.upsert({ where: { upc: i.upc }, create: { upc: i.upc, ...data }, update: data });
      }
      return tx.inventorySync.create({
        data: {
          distributorTransactionId: p.transactionId, deliveryId: p.deliveryId, transactionType: p.transactionType,
          envelopeIcn: p.envelope?.interchangeControlNumber ?? '', producerName: p.producer.name, itemCount: p.items.length, payload: p as object,
        },
      });
    });
    return reply.code(201).send({ ok: true, syncId: sync.id, items: p.items.length });
  });

  app.get('/syncs', async (req, reply) => {
    if (req.headers['x-api-key'] !== config.integrationApiKey) return reply.code(401).send({ error: 'Invalid API key' });
    return prisma.inventorySync.findMany({ take: 50, orderBy: { receivedAt: 'desc' }, select: { id: true, distributorTransactionId: true, transactionType: true, envelopeIcn: true, producerName: true, itemCount: true, receivedAt: true } });
  });
}
