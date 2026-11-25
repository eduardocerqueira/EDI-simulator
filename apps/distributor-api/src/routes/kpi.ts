import type { FastifyInstance } from 'fastify';
import { describeAckCode } from '@edi/x12';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { q, rangeFrom } from '../http.js';
import { bus } from '../bus.js';

const ratio = (a: number, b: number) => (b ? a / b : null);

function fillBuckets<T extends { bucket: Date }>(rows: T[], from: Date, stepMs: number, empty: Omit<T, 'bucket'>): T[] {
  const map = new Map(rows.map((r) => [new Date(r.bucket).getTime(), r]));
  const out: T[] = [];
  const start = Math.floor(from.getTime() / stepMs) * stepMs;
  for (let t = start; t <= Date.now(); t += stepMs) out.push((map.get(t) ?? { ...empty, bucket: new Date(t) }) as T);
  return out;
}

/**
 * KPIs for observability. Every number here can be traced: click through in
 * the UI to the envelopes / transactions / deliveries behind it.
 *
 *  - Acceptance rate          ingested transaction sets / received
 *  - First-pass yield         interchanges fully accepted / received
 *  - Processing latency       avg & p95 of file → interchange processed
 *  - End-to-end latency       file received → JSON delivered to order app
 *  - Ack turnaround           file received → 997/TA1 uploaded
 *  - Delivery success / retry rate, backlog
 *  - Partner scorecard        acceptance rate per producer
 */
export async function computeKpis(hours: number) {
  const from = new Date(Date.now() - hours * 3600_000);
  const stepMs = hours <= 6 ? 5 * 60_000 : hours <= 48 ? 3600_000 : 24 * 3600_000;
  const interval = `${stepMs / 1000} seconds`;

  const [icStats] = await prisma.$queryRaw<Array<Record<string, number | null>>>`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted,
      count(*) FILTER (WHERE status = 'PARTIALLY_ACCEPTED')::int AS partial,
      count(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
      count(*) FILTER (WHERE status = 'ERROR')::int AS errors,
      avg("processingMs")::float AS "avgProcessingMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY "processingMs")::float AS "p95ProcessingMs"
    FROM "Interchange" WHERE "receivedAt" >= ${from}`;

  const txByStatus = await prisma.transactionSet.groupBy({ by: ['status'], where: { receivedAt: { gte: from } }, _count: { _all: true } });
  const txByType = await prisma.transactionSet.groupBy({ by: ['type', 'status'], where: { receivedAt: { gte: from } }, _count: { _all: true } });
  const count = (s: string[]) => txByStatus.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count._all, 0);
  const txTotal = txByStatus.reduce((n, x) => n + x._count._all, 0);
  const ingested = count(['INGESTED', 'DELIVERED', 'DELIVERY_FAILED']);

  const [e2e] = await prisma.$queryRaw<Array<{ avgMs: number | null; p95Ms: number | null }>>`
    SELECT avg(extract(epoch from (t."deliveredAt" - i."receivedAt")) * 1000)::float AS "avgMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch from (t."deliveredAt" - i."receivedAt")) * 1000)::float AS "p95Ms"
    FROM "TransactionSet" t JOIN "Interchange" i ON i.id = t."interchangeId"
    WHERE t."deliveredAt" IS NOT NULL AND t."receivedAt" >= ${from}`;
  const [ackTurn] = await prisma.$queryRaw<Array<{ avgMs: number | null; sent: number; pending: number }>>`
    SELECT avg(extract(epoch from (a."sentAt" - i."receivedAt")) * 1000) FILTER (WHERE a."sentAt" IS NOT NULL)::float AS "avgMs",
      count(*) FILTER (WHERE a.status = 'SENT')::int AS sent,
      count(*) FILTER (WHERE a.status <> 'SENT')::int AS pending
    FROM "Acknowledgment" a JOIN "Interchange" i ON i.id = a."interchangeId" WHERE a."createdAt" >= ${from}`;
  const [deliv] = await prisma.$queryRaw<Array<Record<string, number | null>>>`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
      count(*) FILTER (WHERE status IN ('PENDING','RETRYING'))::int AS backlog,
      count(*) FILTER (WHERE status = 'DEAD')::int AS dead,
      coalesce(sum(attempts), 0)::int AS attempts,
      coalesce(sum(GREATEST(attempts - 1, 0)), 0)::int AS retries,
      count(*) FILTER (WHERE attempts > 1)::int AS "retriedDeliveries"
    FROM "ApiDelivery" WHERE "createdAt" >= ${from}`;
  const [files] = await prisma.$queryRaw<Array<Record<string, number | null>>>`
    SELECT count(*) FILTER (WHERE direction = 'INBOUND')::int AS inbound,
      count(*) FILTER (WHERE direction = 'OUTBOUND')::int AS outbound,
      coalesce(sum("sizeBytes") FILTER (WHERE direction = 'INBOUND'), 0)::int AS "inboundBytes",
      count(*) FILTER (WHERE direction = 'INBOUND' AND attempts > 1)::int AS "retriedDownloads",
      count(*) FILTER (WHERE status = 'FAILED')::int AS failed
    FROM "FileTransfer" WHERE "discoveredAt" >= ${from}`;

  const series = await prisma.$queryRaw<Array<{ bucket: Date; received: number; accepted: number; partial: number; rejected: number }>>`
    SELECT date_bin(${interval}::interval, "receivedAt", TIMESTAMP '2000-01-01') AS bucket,
      count(*)::int AS received,
      count(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted,
      count(*) FILTER (WHERE status = 'PARTIALLY_ACCEPTED')::int AS partial,
      count(*) FILTER (WHERE status IN ('REJECTED','ERROR'))::int AS rejected
    FROM "Interchange" WHERE "receivedAt" >= ${from} GROUP BY 1 ORDER BY 1`;
  const txSeries = await prisma.$queryRaw<Array<{ bucket: Date; ingested: number; syntaxRejected: number; businessRejected: number; delivered: number }>>`
    SELECT date_bin(${interval}::interval, "receivedAt", TIMESTAMP '2000-01-01') AS bucket,
      count(*) FILTER (WHERE status IN ('INGESTED','DELIVERED','DELIVERY_FAILED'))::int AS ingested,
      count(*) FILTER (WHERE status IN ('SYNTAX_REJECTED','ENVELOPE_REJECTED'))::int AS "syntaxRejected",
      count(*) FILTER (WHERE status = 'BUSINESS_REJECTED')::int AS "businessRejected",
      count(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered
    FROM "TransactionSet" WHERE "receivedAt" >= ${from} GROUP BY 1 ORDER BY 1`;

  const topErrors = await prisma.validationIssue.groupBy({
    by: ['code', 'level', 'x12Code', 'x12CodeSource'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { code: 'desc' } }, take: 10,
  });
  const byLevel = await prisma.validationIssue.groupBy({ by: ['level'], where: { createdAt: { gte: from } }, _count: { _all: true } });

  const partners = await prisma.tradingPartner.findMany({ orderBy: { code: 'asc' }, select: { id: true, name: true, isaId: true } });
  const pTx = await prisma.transactionSet.groupBy({ by: ['partnerId', 'status'], where: { receivedAt: { gte: from } }, _count: { _all: true } });
  const pIc = await prisma.interchange.groupBy({ by: ['partnerId'], where: { receivedAt: { gte: from } }, _count: { _all: true }, _max: { receivedAt: true } });
  const pErr = await prisma.validationIssue.groupBy({ by: ['interchangeId'], where: { createdAt: { gte: from } }, _count: { _all: true } });
  const icPartner = new Map((await prisma.interchange.findMany({ where: { id: { in: pErr.map((x) => x.interchangeId) } }, select: { id: true, partnerId: true } })).map((x) => [x.id, x.partnerId]));

  const [inv] = await prisma.$queryRaw<Array<Record<string, number | null>>>`
    SELECT count(*)::int AS skus, coalesce(sum("quantityOnHand"), 0)::int AS units,
      coalesce(sum(GREATEST("quantityOnHand", 0) * "unitCost"), 0)::float AS "stockValueCost",
      coalesce(sum(GREATEST("quantityOnHand", 0) * "sellPrice"), 0)::float AS "stockValueRetail",
      count(*) FILTER (WHERE "quantityOnHand" > 0 AND "quantityOnHand" <= ${config.lowStockThreshold})::int AS "lowStock",
      count(*) FILTER (WHERE "quantityOnHand" <= 0)::int AS "outOfStock"
    FROM "Product"`;
  const [ord] = await prisma.$queryRaw<Array<Record<string, number | null>>>`
    SELECT count(*)::int AS orders,
      count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
      coalesce(sum(total) FILTER (WHERE status <> 'CANCELLED'), 0)::float AS revenue,
      coalesce(avg(total) FILTER (WHERE status <> 'CANCELLED'), 0)::float AS "avgOrderValue"
    FROM "CustomerOrder" WHERE "createdAt" >= ${from}`;
  const [ar] = await prisma.$queryRaw<Array<Record<string, number | null>>>`
    SELECT coalesce(sum(amount) FILTER (WHERE status = 'OPEN'), 0)::float AS "openAmount",
      count(*) FILTER (WHERE status = 'OPEN')::int AS "openBills",
      coalesce(sum(amount) FILTER (WHERE status = 'OPEN' AND "dueDate" < now()), 0)::float AS "overdueAmount",
      count(*) FILTER (WHERE status = 'OPEN' AND "dueDate" < now())::int AS "overdueBills",
      coalesce(sum(amount) FILTER (WHERE status = 'PAID'), 0)::float AS "paidAmount"
    FROM "Bill"`;
  const customers = await prisma.customer.count();

  const icTotal = icStats?.total ?? 0;
  return {
    range: { hours, from, to: new Date(), stepMs },
    health: { rabbitmq: bus.connected },
    edi: {
      filesReceived: files?.inbound ?? 0,
      filesSent: files?.outbound ?? 0,
      inboundBytes: files?.inboundBytes ?? 0,
      retriedDownloads: files?.retriedDownloads ?? 0,
      failedTransfers: files?.failed ?? 0,
      interchanges: icTotal,
      interchangesAccepted: icStats?.accepted ?? 0,
      interchangesPartial: icStats?.partial ?? 0,
      interchangesRejected: icStats?.rejected ?? 0,
      interchangesErrored: icStats?.errors ?? 0,
      firstPassYield: ratio(icStats?.accepted ?? 0, icTotal),
      transactions: txTotal,
      transactionsIngested: ingested,
      transactionsSyntaxRejected: count(['SYNTAX_REJECTED', 'ENVELOPE_REJECTED']),
      transactionsBusinessRejected: count(['BUSINESS_REJECTED']),
      acceptanceRate: ratio(ingested, txTotal),
      avgProcessingMs: icStats?.avgProcessingMs ?? null,
      p95ProcessingMs: icStats?.p95ProcessingMs ?? null,
      avgEndToEndMs: e2e?.avgMs ?? null,
      p95EndToEndMs: e2e?.p95Ms ?? null,
      acksSent: ackTurn?.sent ?? 0,
      acksPending: ackTurn?.pending ?? 0,
      avgAckTurnaroundMs: ackTurn?.avgMs ?? null,
    },
    delivery: {
      total: deliv?.total ?? 0,
      success: deliv?.success ?? 0,
      backlog: deliv?.backlog ?? 0,
      dead: deliv?.dead ?? 0,
      attempts: deliv?.attempts ?? 0,
      retries: deliv?.retries ?? 0,
      retriedDeliveries: deliv?.retriedDeliveries ?? 0,
      successRate: ratio(deliv?.success ?? 0, (deliv?.success ?? 0) + (deliv?.dead ?? 0)),
      firstAttemptSuccessRate: ratio((deliv?.success ?? 0) - (deliv?.retriedDeliveries ?? 0), deliv?.total ?? 0),
    },
    validation: {
      topErrors: topErrors.map((e) => ({ code: e.code, level: e.level, x12Code: e.x12Code, x12CodeSource: e.x12CodeSource, description: describeAckCode(e.x12CodeSource, e.x12Code), count: e._count._all })),
      byLevel: byLevel.map((l) => ({ level: l.level, count: l._count._all })),
    },
    byType: ['832', '846', '856'].map((type) => {
      const rows = txByType.filter((r) => r.type === type);
      const c = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count._all, 0);
      const total = rows.reduce((n, r) => n + r._count._all, 0);
      return { type, total, ingested: c(['INGESTED', 'DELIVERED', 'DELIVERY_FAILED']), syntaxRejected: c(['SYNTAX_REJECTED', 'ENVELOPE_REJECTED']), businessRejected: c(['BUSINESS_REJECTED']) };
    }),
    partners: partners.map((p) => {
      const rows = pTx.filter((r) => r.partnerId === p.id);
      const total = rows.reduce((n, r) => n + r._count._all, 0);
      const ok = rows.filter((r) => ['INGESTED', 'DELIVERED', 'DELIVERY_FAILED'].includes(r.status)).reduce((n, r) => n + r._count._all, 0);
      const ic = pIc.find((r) => r.partnerId === p.id);
      const errors = pErr.filter((r) => icPartner.get(r.interchangeId) === p.id).reduce((n, r) => n + r._count._all, 0);
      return { ...p, interchanges: ic?._count._all ?? 0, transactions: total, accepted: ok, acceptanceRate: ratio(ok, total), errors, lastSeenAt: ic?._max.receivedAt ?? null };
    }),
    timeseries: {
      interchanges: fillBuckets(series, from, stepMs, { received: 0, accepted: 0, partial: 0, rejected: 0 }),
      transactions: fillBuckets(txSeries, from, stepMs, { ingested: 0, syntaxRejected: 0, businessRejected: 0, delivered: 0 }),
    },
    inventory: { ...inv, lowStockThreshold: config.lowStockThreshold },
    orders: { ...ord, cancellationRate: ratio(ord?.cancelled ?? 0, ord?.orders ?? 0), customers, ...ar },
  };
}

export async function kpiRoutes(app: FastifyInstance) {
  app.get('/kpis', async (req) => computeKpis(rangeFrom(req).hours));

  app.get('/dashboard', async (req) => {
    const { hours } = rangeFrom(req);
    const [kpis, recentInterchanges, notifications, unread] = await Promise.all([
      computeKpis(hours),
      prisma.interchange.findMany({
        take: 8, orderBy: { receivedAt: 'desc' },
        include: { partner: { select: { name: true } }, transactions: { select: { type: true, status: true } }, fileTransfer: { select: { fileName: true } } },
      }),
      prisma.notification.findMany({ take: 6, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where: { read: false } }),
    ]);
    return { kpis, recentInterchanges, notifications, unreadNotifications: unread };
  });

  /** Business reports: orders, billing (AR aging), customers, products. */
  app.get('/reports', async (req) => {
    const days = Math.min(365, Math.max(1, Number(q(req).days ?? 30) || 30));
    const from = new Date(Date.now() - days * 86400_000);
    const daily = await prisma.$queryRaw<Array<{ day: Date; orders: number; cancelled: number; revenue: number }>>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS orders,
        count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
        coalesce(sum(total) FILTER (WHERE status <> 'CANCELLED'), 0)::float AS revenue
      FROM "CustomerOrder" WHERE "createdAt" >= ${from} GROUP BY 1 ORDER BY 1`;
    const aging = await prisma.$queryRaw<Array<{ bucket: string; amount: number; bills: number }>>`
      SELECT CASE
          WHEN status = 'PAID' THEN 'Paid'
          WHEN "dueDate" >= now() THEN 'Current'
          WHEN now() - "dueDate" <= interval '30 days' THEN '1-30 days overdue'
          WHEN now() - "dueDate" <= interval '60 days' THEN '31-60 days overdue'
          ELSE '60+ days overdue' END AS bucket,
        coalesce(sum(amount), 0)::float AS amount, count(*)::int AS bills
      FROM "Bill" WHERE status <> 'CANCELLED' GROUP BY 1`;
    const orders = await prisma.customerOrder.findMany({ where: { createdAt: { gte: from }, status: { not: 'CANCELLED' } }, select: { items: true, total: true, customerId: true } });
    const productMap = new Map<string, { upc: string; name: string; quantity: number; revenue: number }>();
    for (const o of orders) {
      for (const i of o.items as Array<{ upc: string; name: string; quantity: number; lineTotal: number }>) {
        const cur = productMap.get(i.upc) ?? { upc: i.upc, name: i.name, quantity: 0, revenue: 0 };
        cur.quantity += i.quantity;
        cur.revenue += i.lineTotal;
        productMap.set(i.upc, cur);
      }
    }
    const products = await prisma.product.findMany({ where: { upc: { in: [...productMap.keys()] } }, select: { upc: true, category: true, partner: { select: { name: true } } } });
    const cat = new Map<string, number>();
    const prod = new Map<string, number>();
    for (const p of products) {
      const rev = productMap.get(p.upc)?.revenue ?? 0;
      cat.set(p.category, (cat.get(p.category) ?? 0) + rev);
      prod.set(p.partner.name, (prod.get(p.partner.name) ?? 0) + rev);
    }
    const byCustomer = new Map<string, number>();
    for (const o of orders) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + o.total);
    const customers = await prisma.customer.findMany({ where: { id: { in: [...byCustomer.keys()] } } });
    const billStatus = await prisma.bill.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } });

    return {
      days,
      daily: daily.map((d) => ({ ...d, day: d.day.toISOString().slice(0, 10) })),
      arAging: ['Current', '1-30 days overdue', '31-60 days overdue', '60+ days overdue', 'Paid'].map((b) => aging.find((a) => a.bucket === b) ?? { bucket: b, amount: 0, bills: 0 }),
      billStatus: billStatus.map((b) => ({ status: b.status, count: b._count._all, amount: b._sum.amount ?? 0 })),
      topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      revenueByCategory: [...cat.entries()].map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue),
      revenueByProducer: [...prod.entries()].map(([producer, revenue]) => ({ producer, revenue })).sort((a, b) => b.revenue - a.revenue),
      topCustomers: customers.map((c) => ({ id: c.id, name: c.company ?? c.name, revenue: byCustomer.get(c.id) ?? 0 })).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
  });
}
