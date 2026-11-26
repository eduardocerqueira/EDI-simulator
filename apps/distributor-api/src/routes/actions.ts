import type { FastifyInstance } from 'fastify';
import { describeAckCode } from '@edi/x12';
import { config } from '../config.js';
import { nextSequence, prisma } from '../db.js';
import { paging, q } from '../http.js';
import { Prisma } from '../generated/prisma/index.js';
import {
  buildCsv, draftEmail, fmtNumber, historyEntry, htmlFromText, ITEM_STATUSES, LAYER_OF_LEVEL, loadItemsForReport, OPEN_STATUSES, summarize, type HistoryEntry,
} from '../actions/backlog.js';
import { resend } from '../email/resend.js';
import { composeProducerReply } from '../email/world.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const REJECTED_TX = ['ENVELOPE_REJECTED', 'SYNTAX_REJECTED', 'BUSINESS_REJECTED'];
const LEVELS_OF_LAYER: Record<string, string[]> = {
  ENVELOPE: ['INTERCHANGE'],
  SYNTAX: ['GROUP', 'TRANSACTION', 'SEGMENT', 'ELEMENT'],
  BUSINESS: ['BUSINESS'],
};
const TX_STATUS_OF_LAYER: Record<string, string> = { ENVELOPE: 'ENVELOPE_REJECTED', SYNTAX: 'SYNTAX_REJECTED', BUSINESS: 'BUSINESS_REJECTED' };

function range(f: Record<string, string | undefined>) {
  const days = Math.min(365, Math.max(1, Number(f.days ?? 7) || 7));
  return { days, from: new Date(Date.now() - days * 86400_000), to: new Date() };
}

/** Shared filters for the EDI error report: period, producer, transaction type, layer, error code. */
function errorFilters(f: Record<string, string | undefined>) {
  const { days, from, to } = range(f);
  const partner = f.partnerId ? { partnerId: f.partnerId } : {};
  const txWhere: Prisma.TransactionSetWhereInput = {
    receivedAt: { gte: from },
    ...partner,
    ...(f.type ? { type: f.type } : {}),
    ...(f.layer && TX_STATUS_OF_LAYER[f.layer] ? { OR: [{ status: { notIn: REJECTED_TX } }, { status: TX_STATUS_OF_LAYER[f.layer] }] } : {}),
    ...(f.code ? { OR: [{ status: { notIn: REJECTED_TX } }, { issues: { some: { code: f.code } } }] } : {}),
  };
  const issueWhere: Prisma.ValidationIssueWhereInput = {
    createdAt: { gte: from },
    ...(f.partnerId ? { interchange: { partnerId: f.partnerId } } : {}),
    ...(f.type ? { transaction: { type: f.type } } : {}),
    ...(f.layer && LEVELS_OF_LAYER[f.layer] ? { level: { in: LEVELS_OF_LAYER[f.layer] } } : {}),
    ...(f.code ? { code: f.code } : {}),
  };
  const icWhere: Prisma.InterchangeWhereInput = {
    receivedAt: { gte: from },
    ...partner,
    ...(f.type ? { transactions: { some: { type: f.type } } } : {}),
    ...(f.code ? { OR: [{ status: 'ACCEPTED' }, { issues: { some: { code: f.code } } }] } : {}),
  };
  return { days, from, to, txWhere, issueWhere, icWhere };
}

const itemInclude = {
  partner: { select: { id: true, name: true, isaId: true, specialty: true, contactEmail: true } },
  interchange: { select: { id: true, controlNumber: true, status: true, ta1AckCode: true, fileTransfer: { select: { fileName: true } } } },
  reports: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, number: true, createdAt: true } },
} satisfies Prisma.ActionItemInclude;

export async function actionRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------------
  // EDI error report (Reports → EDI errors)
  // ------------------------------------------------------------------------
  app.get('/edi/errors', async (req) => {
    const f = q(req);
    const { days, from, txWhere, issueWhere, icWhere } = errorFilters(f);
    const [partners, icByPartner, txByPartner, issuesByCode, issuesByPartner, items] = await Promise.all([
      prisma.tradingPartner.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, isaId: true, specialty: true, contactName: true, contactEmail: true } }),
      prisma.interchange.groupBy({ by: ['partnerId', 'status'], where: icWhere, _count: { _all: true } }),
      prisma.transactionSet.groupBy({ by: ['partnerId', 'status'], where: txWhere, _count: { _all: true } }),
      prisma.validationIssue.groupBy({ by: ['code', 'x12Code', 'x12CodeSource', 'level'], where: issueWhere, _count: { _all: true }, orderBy: { _count: { code: 'desc' } } }),
      prisma.validationIssue.groupBy({ by: ['interchangeId', 'code'], where: issueWhere, _count: { _all: true } }),
      prisma.actionItem.groupBy({ by: ['partnerId', 'status'], where: { status: { in: OPEN_STATUSES }, ...(f.partnerId ? { partnerId: f.partnerId } : {}) }, _count: { _all: true } }),
    ]);
    // interchange → partner for per-producer code counts
    const icPartner = new Map(
      (await prisma.interchange.findMany({ where: { id: { in: [...new Set(issuesByPartner.map((i) => i.interchangeId))] } }, select: { id: true, partnerId: true } })).map((i) => [i.id, i.partnerId]),
    );
    const sum = <T extends { _count: { _all: number } }>(xs: T[], pred: (x: T) => boolean) => xs.filter(pred).reduce((n, x) => n + x._count._all, 0);

    const byPartner = partners
      .filter((p) => !f.partnerId || p.id === f.partnerId)
      .map((p) => {
        const ics = icByPartner.filter((x) => x.partnerId === p.id);
        const txs = txByPartner.filter((x) => x.partnerId === p.id);
        const codes = new Map<string, number>();
        for (const i of issuesByPartner) if (icPartner.get(i.interchangeId) === p.id) codes.set(i.code, (codes.get(i.code) ?? 0) + i._count._all);
        const top = [...codes.entries()].sort((a, b) => b[1] - a[1])[0];
        const transactions = sum(txs, () => true);
        const rejected = sum(txs, (x) => REJECTED_TX.includes(x.status));
        return {
          ...p,
          interchanges: sum(ics, () => true),
          rejectedInterchanges: sum(ics, (x) => x.status === 'REJECTED'),
          partial: sum(ics, (x) => x.status === 'PARTIALLY_ACCEPTED'),
          errored: sum(ics, (x) => x.status === 'ERROR'),
          transactions,
          rejectedTransactions: rejected,
          syntaxRejected: sum(txs, (x) => x.status === 'SYNTAX_REJECTED' || x.status === 'ENVELOPE_REJECTED'),
          businessRejected: sum(txs, (x) => x.status === 'BUSINESS_REJECTED'),
          errorRate: transactions ? rejected / transactions : null,
          issues: [...codes.values()].reduce((a, b) => a + b, 0),
          topCode: top ? { code: top[0], count: top[1] } : null,
          openItems: sum(items.filter((x) => x.partnerId === p.id), () => true),
        };
      })
      .sort((a, b) => (b.errorRate ?? -1) - (a.errorRate ?? -1));

    const partnersByCode = new Map<string, Set<string>>();
    for (const i of issuesByPartner) {
      const pid = icPartner.get(i.interchangeId);
      if (!pid) continue;
      const set = partnersByCode.get(i.code) ?? new Set<string>();
      set.add(pid);
      partnersByCode.set(i.code, set);
    }
    const byCode = issuesByCode.map((c) => ({
      code: c.code,
      x12Code: c.x12Code,
      source: c.x12CodeSource,
      meaning: describeAckCode(c.x12CodeSource, c.x12Code) ?? null,
      layer: LAYER_OF_LEVEL[c.level] ?? c.level,
      count: c._count._all,
      producers: partnersByCode.get(c.code)?.size ?? 0,
    }));

    // daily series: accepted vs rejected transaction sets by layer
    const partnerSql = f.partnerId ? Prisma.sql`AND "partnerId" = ${f.partnerId}` : Prisma.empty;
    const typeSql = f.type ? Prisma.sql`AND type = ${f.type}` : Prisma.empty;
    const daily = await prisma.$queryRaw<Array<{ day: Date; accepted: number; envelope: number; syntax: number; business: number }>>`
      SELECT date_trunc(${days <= 2 ? 'hour' : 'day'}, "receivedAt") AS day,
        count(*) FILTER (WHERE status NOT IN ('ENVELOPE_REJECTED','SYNTAX_REJECTED','BUSINESS_REJECTED'))::int AS accepted,
        count(*) FILTER (WHERE status = 'ENVELOPE_REJECTED')::int AS envelope,
        count(*) FILTER (WHERE status = 'SYNTAX_REJECTED')::int AS syntax,
        count(*) FILTER (WHERE status = 'BUSINESS_REJECTED')::int AS business
      FROM "TransactionSet" WHERE "receivedAt" >= ${from} ${partnerSql} ${typeSql}
      GROUP BY 1 ORDER BY 1`;

    const totals = {
      interchanges: byPartner.reduce((n, p) => n + p.interchanges, 0),
      rejectedInterchanges: byPartner.reduce((n, p) => n + p.rejectedInterchanges, 0),
      partial: byPartner.reduce((n, p) => n + p.partial, 0),
      transactions: byPartner.reduce((n, p) => n + p.transactions, 0),
      rejectedTransactions: byPartner.reduce((n, p) => n + p.rejectedTransactions, 0),
      issues: byCode.reduce((n, c) => n + c.count, 0),
      openItems: byPartner.reduce((n, p) => n + p.openItems, 0),
    };
    return {
      days,
      from,
      granularity: days <= 2 ? 'hour' : 'day',
      totals: { ...totals, errorRate: totals.transactions ? totals.rejectedTransactions / totals.transactions : null },
      byPartner,
      byCode,
      byLayer: ['ENVELOPE', 'SYNTAX', 'BUSINESS'].map((layer) => ({ layer, count: byCode.filter((c) => c.layer === layer).reduce((n, c) => n + c.count, 0) })),
      daily: daily.map((d) => ({ ...d, day: d.day.toISOString() })),
    };
  });

  /** Drill-down for one producer. */
  app.get('/edi/errors/partners/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const f = { ...q(req), partnerId: id };
    const { days, from, issueWhere, icWhere } = errorFilters(f);
    const partner = await prisma.tradingPartner.findUnique({ where: { id } });
    if (!partner) return reply.code(404).send({ error: 'Producer not found' });
    const [codes, recent, openItems, reports] = await Promise.all([
      prisma.validationIssue.groupBy({ by: ['code', 'x12Code', 'x12CodeSource', 'level'], where: issueWhere, _count: { _all: true }, orderBy: { _count: { code: 'desc' } }, take: 15 }),
      prisma.interchange.findMany({
        where: { ...icWhere, OR: [{ status: { in: ['REJECTED', 'PARTIALLY_ACCEPTED', 'ERROR'] } }, { transactions: { some: { status: { in: REJECTED_TX } } } }] },
        orderBy: { receivedAt: 'desc' },
        take: 15,
        select: {
          id: true, controlNumber: true, status: true, receivedAt: true, ta1AckCode: true, errorCount: true,
          fileTransfer: { select: { fileName: true } },
          transactions: { select: { id: true, type: true, status: true, controlNumber: true } },
          issues: { take: 3, select: { code: true, message: true, segmentId: true } },
          actionItem: { select: { id: true, number: true, status: true } },
        },
      }),
      prisma.actionItem.groupBy({ by: ['status'], where: { partnerId: id }, _count: { _all: true } }),
      prisma.producerReport.findMany({ where: { partnerId: id }, orderBy: { createdAt: 'desc' }, take: 5, include: { emails: { select: { direction: true, status: true, createdAt: true } }, _count: { select: { items: true } } } }),
    ]);
    return {
      days,
      from,
      partner,
      codes: codes.map((c) => ({ code: c.code, x12Code: c.x12Code, source: c.x12CodeSource, meaning: describeAckCode(c.x12CodeSource, c.x12Code) ?? null, layer: LAYER_OF_LEVEL[c.level] ?? c.level, count: c._count._all })),
      recent,
      items: Object.fromEntries(openItems.map((i) => [i.status, i._count._all])),
      reports: reports.map((r) => ({ id: r.id, number: fmtNumber('RPT', r.number), createdAt: r.createdAt, items: r._count.items, emails: r.emails })),
    };
  });

  // ------------------------------------------------------------------------
  // Action items (backlog)
  // ------------------------------------------------------------------------
  const itemWhere = (f: Record<string, string | undefined>): Prisma.ActionItemWhereInput => {
    const status = f.status === 'open' ? { in: OPEN_STATUSES } : f.status && ITEM_STATUSES.includes(f.status) ? f.status : undefined;
    const needle = f.q?.trim();
    const num = needle?.match(/^(?:AI-)?0*(\d+)$/i)?.[1];
    return {
      ...(status ? { status } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
      ...(f.layer ? { layer: f.layer } : {}),
      ...(f.code ? { errorCodes: { has: f.code } } : {}),
      ...(f.days ? { occurredAt: { gte: new Date(Date.now() - Math.min(365, Number(f.days) || 7) * 86400_000) } } : {}),
      ...(f.ids ? { id: { in: f.ids.split(',') } } : {}),
      ...(needle
        ? {
            OR: [
              ...(num ? [{ number: Number(num) }] : []),
              { title: { contains: needle, mode: 'insensitive' as const } },
              { interchange: { controlNumber: { contains: needle } } },
              { interchange: { fileTransfer: { fileName: { contains: needle, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };
  };
  const SORT: Record<string, Prisma.ActionItemOrderByWithRelationInput[]> = {
    newest: [{ occurredAt: 'desc' }],
    oldest: [{ occurredAt: 'asc' }],
    updated: [{ updatedAt: 'desc' }],
  };

  app.get('/action-items', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where = itemWhere(f);
    const orderBy = SORT[f.sort ?? 'newest'] ?? SORT.newest!;
    let items;
    if (f.sort === 'priority') {
      // HIGH → MEDIUM → LOW is not alphabetical: order the (filtered) ids in memory, then load one page
      const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const ids = (await prisma.actionItem.findMany({ where, select: { id: true, priority: true, occurredAt: true } }))
        .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || +b.occurredAt - +a.occurredAt)
        .slice(skip, skip + take)
        .map((x) => x.id);
      const rows = await prisma.actionItem.findMany({ where: { id: { in: ids } }, include: itemInclude });
      items = ids.map((id) => rows.find((r) => r.id === id)!);
    } else {
      items = await prisma.actionItem.findMany({ where, skip, take, orderBy, include: itemInclude });
    }
    const total = await prisma.actionItem.count({ where });
    return { items, total, page, pageSize };
  });

  app.get('/action-items/summary', async (req) => {
    const f = q(req);
    const [byStatus, byPriority, byPartner] = await Promise.all([
      prisma.actionItem.groupBy({ by: ['status'], where: f.partnerId ? { partnerId: f.partnerId } : {}, _count: { _all: true } }),
      prisma.actionItem.groupBy({ by: ['priority'], where: { status: { in: OPEN_STATUSES }, ...(f.partnerId ? { partnerId: f.partnerId } : {}) }, _count: { _all: true } }),
      prisma.actionItem.groupBy({ by: ['partnerId'], where: { status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
    ]);
    const oldestOpen = await prisma.actionItem.findFirst({ where: { status: { in: OPEN_STATUSES }, ...(f.partnerId ? { partnerId: f.partnerId } : {}) }, orderBy: { occurredAt: 'asc' }, select: { occurredAt: true } });
    return {
      byStatus: Object.fromEntries(ITEM_STATUSES.map((s) => [s, byStatus.find((x) => x.status === s)?._count._all ?? 0])),
      open: byStatus.filter((x) => OPEN_STATUSES.includes(x.status)).reduce((n, x) => n + x._count._all, 0),
      openByPriority: Object.fromEntries(['HIGH', 'MEDIUM', 'LOW'].map((p) => [p, byPriority.find((x) => x.priority === p)?._count._all ?? 0])),
      openByPartner: Object.fromEntries(byPartner.map((x) => [x.partnerId, x._count._all])),
      oldestOpenAt: oldestOpen?.occurredAt ?? null,
    };
  });

  app.get('/action-items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await prisma.actionItem.findUnique({
      where: { id },
      include: {
        partner: true,
        interchange: {
          select: {
            id: true, controlNumber: true, status: true, receivedAt: true, ta1AckCode: true, ta1NoteCode: true,
            fileTransfer: { select: { id: true, fileName: true } },
            transactions: { select: { id: true, type: true, controlNumber: true, status: true, ackCode: true, ak5Codes: true } },
            issues: { orderBy: { segmentPosition: 'asc' }, select: { id: true, level: true, code: true, x12Code: true, x12CodeSource: true, message: true, segmentId: true, segmentPosition: true, elementRef: true, badValue: true, transactionId: true } },
          },
        },
        reports: { orderBy: { createdAt: 'desc' }, include: { emails: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, status: true, fromAddr: true, subject: true, createdAt: true, senderVerified: true } } } },
      },
    });
    if (!item) return reply.code(404).send({ error: 'Action item not found' });
    return {
      ...item,
      interchange: { ...item.interchange, issues: item.interchange.issues.map((i) => ({ ...i, meaning: describeAckCode(i.x12CodeSource, i.x12Code) ?? null })) },
      reports: item.reports.map((r) => ({ ...r, label: fmtNumber('RPT', r.number), csv: undefined })),
    };
  });

  const applyUpdate = async (id: string, by: string, patch: { status?: string; priority?: string; assignee?: string | null; note?: string | null; comment?: string }) => {
    const cur = await prisma.actionItem.findUnique({ where: { id } });
    if (!cur) return null;
    const history = [...((cur.history as unknown as HistoryEntry[]) ?? [])];
    const data: Prisma.ActionItemUpdateInput = {};
    if (patch.status && patch.status !== cur.status) {
      if (!ITEM_STATUSES.includes(patch.status)) throw Object.assign(new Error(`Invalid status ${patch.status}`), { statusCode: 400 });
      data.status = patch.status;
      if (patch.status === 'RESOLVED') data.resolvedAt = new Date();
      history.push(historyEntry(by, 'status', { from: cur.status, to: patch.status, note: patch.comment }));
    }
    if (patch.priority && patch.priority !== cur.priority) {
      data.priority = patch.priority;
      history.push(historyEntry(by, 'priority', { from: cur.priority, to: patch.priority }));
    }
    if (patch.assignee !== undefined && patch.assignee !== cur.assignee) {
      data.assignee = patch.assignee || null;
      history.push(historyEntry(by, 'assignee', { from: cur.assignee ?? '—', to: patch.assignee || '—' }));
    }
    if (patch.note !== undefined && patch.note !== cur.note) {
      data.note = patch.note || null;
      history.push(historyEntry(by, 'note', { note: patch.note || '(cleared)' }));
    }
    if (patch.comment && !patch.status) history.push(historyEntry(by, 'comment', { note: patch.comment }));
    data.history = json(history);
    return prisma.actionItem.update({ where: { id }, data });
  };

  app.patch('/action-items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await applyUpdate(id, req.user.email, req.body as Parameters<typeof applyUpdate>[2]);
    if (!updated) return reply.code(404).send({ error: 'Action item not found' });
    return updated;
  });

  app.post('/action-items/bulk', async (req) => {
    const { ids, ...patch } = req.body as { ids: string[] } & Parameters<typeof applyUpdate>[2];
    let updated = 0;
    for (const id of (ids ?? []).slice(0, 500)) if (await applyUpdate(id, req.user.email, patch)) updated++;
    return { updated };
  });

  // ------------------------------------------------------------------------
  // Producer reports + e-mail through (simulated) Resend
  // ------------------------------------------------------------------------
  const selectItemsForReport = async (body: { partnerId: string; itemIds?: string[]; days?: number; statuses?: string[] }) => {
    const where: Prisma.ActionItemWhereInput = body.itemIds?.length
      ? { id: { in: body.itemIds }, partnerId: body.partnerId }
      : {
          partnerId: body.partnerId,
          status: { in: body.statuses?.length ? body.statuses : ['OPEN', 'IN_PROGRESS'] },
          ...(body.days ? { occurredAt: { gte: new Date(Date.now() - body.days * 86400_000) } } : {}),
        };
    const ids = (await prisma.actionItem.findMany({ where, select: { id: true }, orderBy: { occurredAt: 'asc' }, take: 500 })).map((x) => x.id);
    return loadItemsForReport(ids);
  };

  app.post('/producer-reports/draft', async (req, reply) => {
    const body = req.body as { partnerId: string; itemIds?: string[]; days?: number; statuses?: string[] };
    const partner = await prisma.tradingPartner.findUnique({ where: { id: body.partnerId } });
    if (!partner) return reply.code(404).send({ error: 'Producer not found' });
    const items = await selectItemsForReport(body);
    if (!items.length) return reply.code(422).send({ error: 'No action items match — nothing to report.' });
    const period = { from: items[0]!.occurredAt, to: items.at(-1)!.occurredAt };
    const draft = draftEmail(partner, items, period);
    const csv = buildCsv(items);
    return {
      partner: { id: partner.id, name: partner.name, isaId: partner.isaId, specialty: partner.specialty, contactName: partner.contactName, contactEmail: partner.contactEmail },
      from: config.email.from,
      to: partner.contactEmail ? [`${partner.contactName} <${partner.contactEmail}>`] : [],
      cc: [],
      subject: draft.subject,
      text: draft.text,
      summary: draft.summary,
      period,
      itemIds: items.map((i) => i.id),
      items: items.map((i) => ({ id: i.id, number: fmtNumber('AI', i.number), title: i.title, layer: i.layer, priority: i.priority, status: i.status, occurredAt: i.occurredAt })),
      attachment: { filename: `edi-exceptions-${partner.isaId.toLowerCase()}.csv`, rows: csv.split('\n').length - 2, size: Buffer.byteLength(csv) },
    };
  });

  app.post('/producer-reports', async (req, reply) => {
    const body = req.body as { partnerId: string; itemIds: string[]; to: string[]; cc?: string[]; subject: string; text: string; filters?: unknown };
    const partner = await prisma.tradingPartner.findUnique({ where: { id: body.partnerId } });
    if (!partner) return reply.code(404).send({ error: 'Producer not found' });
    if (!body.itemIds?.length) return reply.code(422).send({ error: 'Select at least one action item.' });
    if (!body.to?.length) return reply.code(422).send({ error: 'Add at least one recipient.' });
    const items = await selectItemsForReport({ partnerId: partner.id, itemIds: body.itemIds });
    if (!items.length) return reply.code(422).send({ error: 'None of the selected items belong to this producer.' });

    const number = await nextSequence('producer-report', 1);
    const label = fmtNumber('RPT', number);
    const csv = buildCsv(items);
    const summary = summarize(items);
    const period = { from: items[0]!.occurredAt, to: items.at(-1)!.occurredAt };
    const subject = body.subject.includes(label) ? body.subject : `[${label}] ${body.subject}`;
    const replyTo = `edi-replies+${label.toLowerCase()}@${config.email.inboundDomain}`;
    const filename = `edi-exceptions-${partner.isaId.toLowerCase()}-${label.toLowerCase()}.csv`;

    const report = await prisma.producerReport.create({
      data: {
        number,
        partnerId: partner.id,
        filters: json(body.filters ?? {}),
        periodFrom: period.from,
        periodTo: period.to,
        summary: json(summary),
        csv,
        createdBy: req.user.email,
        items: { connect: items.map((i) => ({ id: i.id })) },
      },
    });

    const payload = {
      from: config.email.from,
      to: body.to,
      cc: body.cc ?? [],
      reply_to: replyTo,
      subject,
      text: body.text,
      html: htmlFromText(body.text, label),
      attachments: [{ filename, content: Buffer.from(csv).toString('base64'), content_type: 'text/csv' }],
      tags: [
        { name: 'report', value: label },
        { name: 'producer', value: partner.isaId },
      ],
    };
    // idempotency key per report: a retried request can never send the same report twice
    const { data, error } = await resend.emails.send(payload, { idempotencyKey: `producer-report/${label}` });
    if (error) {
      await prisma.producerReport.delete({ where: { id: report.id } });
      return reply.code(error.statusCode >= 500 ? 502 : error.statusCode).send({ error: `Resend: ${error.message}`, resend: error });
    }

    const email = await prisma.emailMessage.create({
      data: {
        providerId: data.id,
        direction: 'OUTBOUND',
        status: 'queued',
        fromAddr: payload.from,
        to: payload.to,
        cc: payload.cc,
        replyTo,
        subject,
        text: body.text,
        html: payload.html,
        attachments: json([{ filename, contentType: 'text/csv', size: Buffer.byteLength(csv), rows: csv.split('\n').length - 2 }]),
        idempotencyKey: `producer-report/${label}`,
        partnerId: partner.id,
        reportId: report.id,
      },
    });
    for (const it of items) {
      const history = [...((it.history as unknown as HistoryEntry[]) ?? []), historyEntry(req.user.email, 'reported', { from: it.status, to: 'REPORTED', note: `${label} e-mailed to ${body.to.join(', ')}` })];
      await prisma.actionItem.update({
        where: { id: it.id },
        data: { history: json(history), reportedAt: new Date(), ...(['OPEN', 'IN_PROGRESS'].includes(it.status) ? { status: 'REPORTED' } : {}) },
      });
    }
    return { id: report.id, number: label, emailId: email.id, providerId: data.id };
  });

  app.get('/producer-reports', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.ProducerReportWhereInput = { ...(f.partnerId ? { partnerId: f.partnerId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.producerReport.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          partner: { select: { id: true, name: true, isaId: true, specialty: true } },
          emails: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, status: true, to: true, createdAt: true, openedAt: true, senderVerified: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.producerReport.count({ where }),
    ]);
    return { items: rows.map(({ csv: _csv, ...r }) => ({ ...r, label: fmtNumber('RPT', r.number) })), total, page, pageSize };
  });

  app.get('/producer-reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await prisma.producerReport.findUnique({
      where: { id },
      include: {
        partner: true,
        items: { orderBy: { occurredAt: 'asc' }, select: { id: true, number: true, title: true, status: true, priority: true, layer: true, occurredAt: true } },
        emails: { orderBy: { createdAt: 'asc' }, include: { events: { orderBy: { receivedAt: 'asc' }, select: { id: true, type: true, receivedAt: true, outcome: true, verified: true } } } },
      },
    });
    if (!r) return reply.code(404).send({ error: 'Report not found' });
    return { ...r, label: fmtNumber('RPT', r.number), csvRows: r.csv.split('\n').length - 2 };
  });

  app.get('/producer-reports/:id/csv', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await prisma.producerReport.findUnique({ where: { id }, include: { partner: { select: { isaId: true } } } });
    if (!r) return reply.code(404).send({ error: 'Report not found' });
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="edi-exceptions-${r.partner.isaId.toLowerCase()}-${fmtNumber('RPT', r.number).toLowerCase()}.csv"`);
    return r.csv;
  });

  /** Make the producer answer now (instead of waiting for the simulated reply). `unknownSender` shows quarantine. */
  app.post('/producer-reports/:id/simulate-reply', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { text?: string; unknownSender?: boolean; variant?: 'fix' | 'question' | 'ack' };
    const r = await prisma.producerReport.findUnique({ where: { id }, include: { partner: true, emails: { where: { direction: 'OUTBOUND' }, orderBy: { createdAt: 'desc' }, take: 1 } } });
    const sent = r?.emails[0];
    if (!r || !sent) return reply.code(404).send({ error: 'Report e-mail not found' });
    const label = fmtNumber('RPT', r.number);
    const codes = ((r.summary as { codes?: Array<{ code: string }> }).codes ?? []).map((c) => c.code);
    const from = body.unknownSender ? 'Billing Desk <billing-desk@unrelated-vendor.example>' : `${r.partner.contactName} <${r.partner.contactEmail}>`;
    const text = body.text?.trim() || composeProducerReply(r.partner.contactName ?? 'EDI team', r.partner.name, label, codes, body.variant);
    const providerId = await resend.simulateInbound({ from, to: [sent.replyTo ?? config.email.from], subject: `Re: ${sent.subject}`, text, inReplyTo: sent.providerId });
    return { ok: true, providerId };
  });

  // ------------------------------------------------------------------------
  // E-mail log and webhook audit
  // ------------------------------------------------------------------------
  app.get('/emails', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.EmailMessageWhereInput = {
      ...(f.direction ? { direction: f.direction } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.partnerId ? { partnerId: f.partnerId } : {}),
      ...(f.q?.trim() ? { OR: [{ subject: { contains: f.q.trim(), mode: 'insensitive' } }, { fromAddr: { contains: f.q.trim(), mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.emailMessage.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, direction: true, status: true, fromAddr: true, to: true, subject: true, createdAt: true, sentAt: true, deliveredAt: true, openedAt: true, bouncedAt: true,
          receivedAt: true, senderVerified: true, providerId: true,
          partner: { select: { id: true, name: true, isaId: true, specialty: true } },
          report: { select: { id: true, number: true } },
          _count: { select: { events: true } },
        },
      }),
      prisma.emailMessage.count({ where }),
    ]);
    return { items: items.map((e) => ({ ...e, report: e.report ? { id: e.report.id, label: fmtNumber('RPT', e.report.number) } : null })), total, page, pageSize };
  });

  app.get('/emails/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const e = await prisma.emailMessage.findUnique({
      where: { id },
      include: { partner: { select: { id: true, name: true, isaId: true } }, report: { select: { id: true, number: true } }, events: { orderBy: { receivedAt: 'asc' } } },
    });
    if (!e) return reply.code(404).send({ error: 'E-mail not found' });
    return { ...e, report: e.report ? { id: e.report.id, label: fmtNumber('RPT', e.report.number) } : null };
  });

  app.get('/email-events', async (req) => {
    const { skip, take, page, pageSize } = paging(req);
    const f = q(req);
    const where: Prisma.EmailEventWhereInput = { ...(f.type ? { type: f.type } : {}), ...(f.outcome ? { outcome: f.outcome } : {}) };
    const [items, total] = await Promise.all([
      prisma.emailEvent.findMany({ where, skip, take, orderBy: { receivedAt: 'desc' }, include: { email: { select: { id: true, subject: true, direction: true } } } }),
      prisma.emailEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });

  app.get('/email/integration', async () => {
    const [byStatus, events] = await Promise.all([
      prisma.emailMessage.groupBy({ by: ['direction', 'status'], _count: { _all: true } }),
      prisma.emailEvent.groupBy({ by: ['outcome'], _count: { _all: true } }),
    ]);
    return {
      provider: 'Resend (simulated — no e-mail leaves this machine)',
      from: config.email.from,
      sendingDomain: config.email.sendingDomain,
      inboundDomain: config.email.inboundDomain,
      webhookUrl: config.email.webhookUrl,
      webhookSecret: `${config.email.webhookSecret.slice(0, 10)}…`,
      replyRate: config.email.simReplyRate,
      testAddresses: ['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev'],
      messages: byStatus.map((b) => ({ direction: b.direction, status: b.status, count: b._count._all })),
      webhooks: Object.fromEntries(events.map((e) => [e.outcome, e._count._all])),
    };
  });
}
