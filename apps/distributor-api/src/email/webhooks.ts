import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { log } from '../log.js';
import { fmtNumber, historyEntry, OPEN_STATUSES, type HistoryEntry } from '../actions/backlog.js';
import type { Prisma } from '../generated/prisma/index.js';
import { resend } from './resend.js';
import { verify, WebhookVerificationError, type ResendWebhookEvent } from './svix.js';

/**
 * Resend → us. Every delivery is verified (Svix signature + timestamp), stored
 * in EmailEvent (the integration audit log) and processed idempotently: Resend
 * may deliver the same event more than once, so svix-id is unique.
 *
 * Inbound mail is untrusted input. We only attach a reply to a report when the
 * sender is the producer's registered EDI contact AND the reply threads to a
 * report we sent (plus-address token or In-Reply-To). Anything else is kept but
 * quarantined. The text is stored and shown, never interpreted as a command.
 */

const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function handleResendWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<{ status: number; body: unknown }> {
  let verified: ReturnType<typeof verify>;
  try {
    verified = verify(config.email.webhookSecret, rawBody, headers);
  } catch (e) {
    const reason = e instanceof WebhookVerificationError ? e.message : 'Unparseable payload';
    let payload: unknown = rawBody.slice(0, 2000);
    try {
      payload = JSON.parse(rawBody);
    } catch {
      /* keep raw */
    }
    const t = (payload as { type?: string })?.type;
    await prisma.emailEvent.create({ data: { svixId: `rejected_${randomUUID()}`, type: typeof t === 'string' ? t : 'unknown', verified: false, outcome: 'rejected', error: reason, payload: json(payload) } });
    log.warn(`[resend] rejected webhook: ${reason}`);
    return { status: 400, body: { error: 'Invalid signature' } };
  }

  const { id: svixId, event } = verified;
  const seen = await prisma.emailEvent.findUnique({ where: { svixId } });
  if (seen) return { status: 200, body: { ok: true, duplicate: true } };

  const record = (outcome: string, emailId?: string | null, error?: string) =>
    prisma.emailEvent.create({ data: { svixId, type: event.type, providerEmailId: event.data.email_id, emailId: emailId ?? null, verified: true, outcome, error, payload: json(event) } });

  try {
    if (event.type === 'email.received') {
      const emailId = await processInbound(event);
      await record('processed', emailId);
      return { status: 200, body: { ok: true } };
    }
    const email = await prisma.emailMessage.findUnique({ where: { providerId: event.data.email_id } });
    if (!email) {
      await record('ignored', null, 'Unknown email id (not sent by this app)');
      return { status: 200, body: { ok: true } };
    }
    await processDeliveryEvent(email, event);
    await record('processed', email.id);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    // 500 makes Resend retry later; the event is not recorded so the retry is processed
    log.warn(`[resend] webhook ${event.type} failed: ${(e as Error).message}`);
    return { status: 500, body: { error: 'processing failed' } };
  }
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, bounced: 9, complained: 9, failed: 9 };

async function processDeliveryEvent(email: { id: string; status: string; reportId: string | null; subject: string; to: string[]; partnerId: string | null }, event: ResendWebhookEvent) {
  const now = new Date(event.created_at);
  const next = event.type.replace('email.', '');
  const data: Prisma.EmailMessageUpdateInput = {};
  if (event.type === 'email.sent') data.sentAt = now;
  if (event.type === 'email.delivered') data.deliveredAt = now;
  if (event.type === 'email.opened') data.openedAt = now;
  if (event.type === 'email.bounced' || event.type === 'email.complained') data.bouncedAt = now;
  // events can arrive out of order: never move the status backwards
  if ((RANK[next] ?? 0) >= (RANK[email.status] ?? 0)) data.status = next;
  await prisma.emailMessage.update({ where: { id: email.id }, data });

  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    const report = email.reportId ? await prisma.producerReport.findUnique({ where: { id: email.reportId }, include: { items: { select: { id: true, history: true } } } }) : null;
    const label = report ? fmtNumber('RPT', report.number) : 'report';
    const why = event.type === 'email.bounced' ? `bounced: ${event.data.bounce?.message ?? 'permanent failure'}` : 'was marked as spam by the recipient';
    if (report) {
      for (const it of report.items) {
        const history = [...((it.history as unknown as HistoryEntry[]) ?? []), historyEntry('resend', 'email-' + next, { note: `${label} to ${email.to.join(', ')} ${why}` })];
        await prisma.actionItem.update({ where: { id: it.id }, data: { history: json(history) } });
      }
    }
    await prisma.notification.create({
      data: {
        type: event.type === 'email.bounced' ? 'edi.report.bounced' : 'edi.report.complained',
        severity: 'WARNING',
        title: `${label} e-mail ${event.type === 'email.bounced' ? 'bounced' : 'complaint'}`,
        message: `The exception report to ${email.to.join(', ')} ${why}. Check the producer's contact address and resend.`,
        source: 'resend',
        payload: json({ emailId: email.id, reportId: email.reportId }),
      },
    });
  }
}

async function processInbound(event: ResendWebhookEvent): Promise<string> {
  // the webhook has metadata only: fetch the body like resend.emails.receiving.get()
  const { data: received, error } = await resend.emails.receiving.get(event.data.email_id);
  if (error || !received) throw new Error(`receiving.get failed: ${error?.message}`);

  const from = addr(received.from);
  const partner = await prisma.tradingPartner.findFirst({ where: { contactEmail: from } });
  const token = received.to.map((t) => addr(t).match(/\+rpt-(\d+)@/i)?.[1]).find(Boolean);
  const inReplyTo = received.headers['in-reply-to']?.match(/<([^@>]+)@/)?.[1];
  const original = inReplyTo ? await prisma.emailMessage.findUnique({ where: { providerId: inReplyTo } }) : null;
  const report = token
    ? await prisma.producerReport.findUnique({ where: { number: Number(token) }, include: { items: { select: { id: true, status: true, history: true } } } })
    : original?.reportId
      ? await prisma.producerReport.findUnique({ where: { id: original.reportId }, include: { items: { select: { id: true, status: true, history: true } } } })
      : null;
  // trust only the registered contact of the producer the report was sent to
  const trusted = !!partner && !!report && report.partnerId === partner.id;

  const email = await prisma.emailMessage.create({
    data: {
      providerId: received.id,
      direction: 'INBOUND',
      status: trusted ? 'received' : 'quarantined',
      fromAddr: received.from,
      to: received.to,
      cc: received.cc,
      subject: received.subject,
      text: received.text,
      html: received.html,
      senderVerified: trusted,
      partnerId: partner?.id ?? null,
      reportId: trusted ? report!.id : null,
      inReplyToId: trusted ? (original?.id ?? null) : null,
      receivedAt: new Date(received.created_at),
    },
  });

  if (!trusted) {
    await prisma.notification.create({
      data: {
        type: 'edi.email.quarantined',
        severity: 'WARNING',
        title: 'Inbound e-mail quarantined',
        message: `An e-mail from ${received.from} ("${received.subject.slice(0, 80)}") was not linked to any report: ${!partner ? 'the sender is not a registered producer contact' : !report ? 'it does not reply to a report we sent' : 'the sender belongs to a different producer'}.`,
        source: 'resend',
        payload: json({ emailId: email.id }),
      },
    });
    return email.id;
  }

  const label = fmtNumber('RPT', report!.number);
  const snippet = received.text.replace(/\s+/g, ' ').trim().slice(0, 240);
  for (const it of report!.items) {
    const history = [...((it.history as unknown as HistoryEntry[]) ?? []), historyEntry(from, 'producer-replied', { note: `Reply to ${label}: "${snippet}"` })];
    const moveStatus = OPEN_STATUSES.includes(it.status) && it.status !== 'PRODUCER_REPLIED';
    await prisma.actionItem.update({
      where: { id: it.id },
      data: {
        history: json(moveStatus ? [...history.slice(0, -1), { ...history.at(-1)!, from: it.status, to: 'PRODUCER_REPLIED' }] : history),
        repliedAt: new Date(),
        ...(moveStatus ? { status: 'PRODUCER_REPLIED' } : {}),
      },
    });
  }
  await prisma.notification.create({
    data: {
      type: 'edi.producer.replied',
      severity: 'INFO',
      title: `${partner!.name} replied to ${label}`,
      message: snippet,
      source: 'resend',
      payload: json({ emailId: email.id, reportId: report!.id, partner: partner!.isaId }),
    },
  });
  return email.id;
}
