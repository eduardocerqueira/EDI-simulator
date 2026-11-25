import type { FastifyInstance } from 'fastify';
import { describeAckCode, inspectionReport, analyzeInterchange } from '@edi/x12';
import { prisma } from '../db.js';
import { paging, q, rangeFrom } from '../http.js';
import { requeueDelivery } from '../pipeline/delivery.js';
import type { Prisma } from '../generated/prisma/index.js';

const describeIssue = <T extends { x12CodeSource: string; x12Code: string | null }>(i: T) => ({
  ...i,
  x12CodeDescription: describeAckCode(i.x12CodeSource, i.x12Code),
});

export async function ediRoutes(app: FastifyInstance) {
  // ---------------- Interchanges (ISA/IEA envelopes) ----------------
  app.get('/interchanges', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.InterchangeWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(f.type ? { transactions: { some: { type: f.type } } } : {}),
      ...(f.q ? { OR: [{ controlNumber: { contains: f.q } }, { senderId: { contains: f.q, mode: 'insensitive' } }, { fileTransfer: { fileName: { contains: f.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.interchange.findMany({
        where, skip, take, orderBy: { receivedAt: 'desc' },
        include: {
          partner: { select: { id: true, name: true, isaId: true } },
          fileTransfer: { select: { fileName: true, sizeBytes: true } },
          transactions: { select: { type: true, status: true } },
          acknowledgments: { select: { type: true, ackCode: true, status: true } },
        },
      }),
      prisma.interchange.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  /** The full trace of one envelope: file → ISA → GS → ST, issues, timeline, acks, deliveries. */
  app.get('/interchanges/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ic = await prisma.interchange.findUnique({
      where: { id },
      include: {
        partner: true,
        fileTransfer: true,
        groups: { orderBy: { index: 'asc' }, include: { transactions: { orderBy: { index: 'asc' }, select: { id: true, type: true, typeName: true, controlNumber: true, status: true, ackCode: true, ak5Codes: true, segmentCount: true, itemCount: true, errorCount: true } } } },
        issues: { orderBy: [{ createdAt: 'asc' }, { segmentPosition: 'asc' }] },
        events: { orderBy: { createdAt: 'asc' } },
        acknowledgments: { orderBy: { createdAt: 'asc' } },
        transactions: { select: { id: true, deliveries: { include: { attemptLog: { orderBy: { attemptNo: 'asc' } } } } } },
      },
    });
    if (!ic) return reply.code(404).send({ error: 'Interchange not found' });
    const fileEvents = await prisma.processingEvent.findMany({ where: { fileTransferId: ic.fileTransferId, interchangeId: null }, orderBy: { createdAt: 'asc' } });
    const report = ic.fileTransfer.content ? inspectionReport(analyzeInterchange(ic.fileTransfer.content, {})) : null;
    const { transactions, ...rest } = ic;
    return {
      ...rest,
      issues: ic.issues.map(describeIssue),
      timeline: [...fileEvents, ...ic.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      deliveries: transactions.flatMap((t) => t.deliveries),
      ta1Description: describeAckCode('TA1', ic.ta1NoteCode),
      segments: report?.segments ?? [],
    };
  });

  // ---------------- Transaction sets (ST/SE) ----------------
  app.get('/transactions', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.TransactionSetWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(f.q ? { OR: [{ controlNumber: { contains: f.q } }, { interchange: { controlNumber: { contains: f.q } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.transactionSet.findMany({
        where, skip, take, orderBy: { receivedAt: 'desc' },
        select: {
          id: true, type: true, typeName: true, controlNumber: true, status: true, ackCode: true, ak5Codes: true, errorCount: true, itemCount: true,
          segmentCount: true, receivedAt: true, ingestedAt: true, deliveredAt: true,
          partner: { select: { id: true, name: true, isaId: true } },
          interchange: { select: { id: true, controlNumber: true } },
          group: { select: { controlNumber: true, functionalId: true } },
          deliveries: { select: { status: true, attempts: true }, take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.transactionSet.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get('/transactions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = await prisma.transactionSet.findUnique({
      where: { id },
      include: {
        partner: true,
        interchange: { include: { fileTransfer: { select: { id: true, fileName: true, remotePath: true, archivePath: true, transferredAt: true, sizeBytes: true, sha256: true, content: true } } } },
        group: true,
        issues: { orderBy: { segmentPosition: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        deliveries: { include: { attemptLog: { orderBy: { attemptNo: 'asc' } } }, orderBy: { createdAt: 'asc' } },
        movements: { include: { product: { select: { id: true, name: true, upc: true, sku: true, uom: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!t) return reply.code(404).send({ error: 'Transaction not found' });
    // segment-by-segment annotation of this transaction (positions relative to ST)
    const report = analyzeInterchange(t.interchange.fileTransfer.content ?? '', {});
    const segments = report.parsed
      ? inspectionReport(report).segments.filter((s) => {
          const g = report.parsed!.groups[t.group.index];
          const pt = g?.transactions[t.index];
          return pt ? pt.segments.some((x) => x.position === s.position) : false;
        })
      : [];
    return {
      ...t,
      issues: t.issues.map(describeIssue),
      ak5Descriptions: t.ak5Codes.map((c) => ({ code: c, description: describeAckCode('AK5', c) })),
      segments,
    };
  });

  app.post('/transactions/:id/redeliver', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deliveryId = await requeueDelivery(id);
    if (!deliveryId) return reply.code(404).send({ error: 'No delivery for this transaction' });
    return { ok: true, deliveryId };
  });

  // ---------------- FTP file transfers ----------------
  app.get('/files', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.FileTransferWhereInput = {
      ...(f.direction ? { direction: f.direction } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(f.q ? { fileName: { contains: f.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.fileTransfer.findMany({
        where, skip, take, orderBy: { discoveredAt: 'desc' },
        select: {
          id: true, direction: true, protocol: true, fileName: true, remotePath: true, archivePath: true, sizeBytes: true, sha256: true, status: true,
          attempts: true, lastError: true, discoveredAt: true, transferredAt: true, processedAt: true,
          partner: { select: { id: true, name: true, isaId: true } },
          interchanges: { select: { id: true, controlNumber: true, status: true } },
          acknowledgments: { select: { interchangeId: true, type: true } },
        },
      }),
      prisma.fileTransfer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get('/files/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await prisma.fileTransfer.findUnique({
      where: { id },
      include: { partner: true, interchanges: { select: { id: true, controlNumber: true, status: true } }, events: { orderBy: { createdAt: 'asc' } }, acknowledgments: true },
    });
    if (!file) return reply.code(404).send({ error: 'File not found' });
    return file;
  });

  // ---------------- Validation issues ----------------
  app.get('/issues', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.ValidationIssueWhereInput = {
      ...(f.level ? { level: f.level } : {}),
      ...(f.code ? { code: f.code } : {}),
      ...(f.partnerId ? { interchange: { partnerId: f.partnerId } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.validationIssue.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          interchange: { select: { id: true, controlNumber: true, senderId: true, partner: { select: { name: true } } } },
          transaction: { select: { id: true, type: true, controlNumber: true } },
        },
      }),
      prisma.validationIssue.count({ where }),
    ]);
    return { items: items.map(describeIssue), total, page, pageSize };
  });

  app.get('/issues/summary', async (req) => {
    const { from } = rangeFrom(req, 24 * 7);
    const [byCode, byLevel] = await Promise.all([
      prisma.validationIssue.groupBy({ by: ['code', 'level', 'x12Code', 'x12CodeSource'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { code: 'desc' } } }),
      prisma.validationIssue.groupBy({ by: ['level'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    ]);
    return {
      byCode: byCode.map((r) => ({ code: r.code, level: r.level, x12Code: r.x12Code, x12CodeSource: r.x12CodeSource, x12CodeDescription: describeAckCode(r.x12CodeSource, r.x12Code), count: r._count._all })),
      byLevel: byLevel.map((r) => ({ level: r.level, count: r._count._all })),
    };
  });

  // ---------------- REST deliveries to the order app ----------------
  app.get('/deliveries', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.ApiDeliveryWhereInput = f.status ? { status: f.status } : {};
    const [items, total] = await Promise.all([
      prisma.apiDelivery.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          transaction: { select: { id: true, type: true, controlNumber: true, interchangeId: true, partner: { select: { name: true } } } },
          attemptLog: { orderBy: { attemptNo: 'asc' } },
        },
      }),
      prisma.apiDelivery.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  // ---------------- Acknowledgments ----------------
  app.get('/acks', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.AcknowledgmentWhereInput = { ...(f.type ? { type: f.type } : {}), ...(f.status ? { status: f.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.acknowledgment.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { interchange: { select: { id: true, controlNumber: true, partner: { select: { name: true, isaId: true } } } } },
      }),
      prisma.acknowledgment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  // ---------------- Live activity feed ----------------
  app.get('/events', async (req) => {
    const { take } = paging(req);
    return prisma.processingEvent.findMany({
      take, orderBy: { createdAt: 'desc' },
      include: {
        interchange: { select: { id: true, controlNumber: true, partner: { select: { name: true } } } },
        transaction: { select: { id: true, type: true, controlNumber: true } },
        fileTransfer: { select: { id: true, fileName: true } },
      },
    });
  });
}
