import { ROUTING_KEYS } from '@edi/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { metrics } from '../metrics.js';
import { publishEdiEvent } from '../bus.js';
import { recordEvent } from '../trace.js';

/**
 * Deliver ingested transactions to the order app as JSON over REST.
 * Retries with exponential backoff (2s, 4s, 8s, 16s…) until `maxAttempts`,
 * then the delivery is marked DEAD and a notification is raised.
 */
export async function deliverPending(): Promise<number> {
  const due = await prisma.apiDelivery.findMany({
    where: { status: { in: ['PENDING', 'RETRYING'] }, nextAttemptAt: { lte: new Date() } },
    include: { transaction: { include: { partner: true } } },
    orderBy: { nextAttemptAt: 'asc' },
    take: 20,
  });
  for (const d of due) await deliverOne(d.id);
  return due.length;
}

export async function deliverOne(deliveryId: string): Promise<void> {
  const d = await prisma.apiDelivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { transaction: { include: { partner: true } } } });
  const attemptNo = d.attempts + 1;
  const started = Date.now();
  let statusCode: number | undefined;
  let error: string | undefined;
  let responseBody: unknown;
  try {
    if (Math.random() < config.delivery.failureRate) {
      throw new Error('Simulated transient network failure (DELIVERY_FAILURE_RATE)');
    }
    const res = await fetch(d.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.orderApi.apiKey, 'idempotency-key': d.transactionId },
      body: JSON.stringify({ deliveryId: d.id, ...(d.payload as object) }),
      signal: AbortSignal.timeout(config.orderApi.timeoutMs),
    });
    statusCode = res.status;
    responseBody = await res.json().catch(() => undefined);
    if (!res.ok) error = `HTTP ${res.status}: ${JSON.stringify(responseBody ?? {}).slice(0, 300)}`;
  } catch (e) {
    error = (e as Error).message;
  }
  const durationMs = Date.now() - started;
  await prisma.apiDeliveryAttempt.create({ data: { deliveryId: d.id, attemptNo, statusCode, success: !error, error, durationMs } });
  const ref = { interchangeId: d.transaction.interchangeId, transactionId: d.transactionId };

  if (!error) {
    metrics.deliveryAttempts.inc({ result: 'success' });
    await prisma.apiDelivery.update({ where: { id: d.id }, data: { status: 'SUCCESS', attempts: attemptNo, lastStatusCode: statusCode, lastError: null, deliveredAt: new Date(), responseBody: (responseBody as object) ?? undefined } });
    await prisma.transactionSet.update({ where: { id: d.transactionId }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    await recordEvent(ref, 'DELIVERED', 'SUCCESS', `JSON delivered to order app (HTTP ${statusCode}) on attempt ${attemptNo}`, { durationMs });
    await publishEdiEvent({
      routingKey: ROUTING_KEYS.deliverySucceeded, severity: 'INFO', title: 'Delivered to order app',
      message: `${d.transaction.type} #${d.transaction.controlNumber} delivered on attempt ${attemptNo}`, partner: d.transaction.partner?.isaId,
      interchangeId: d.transaction.interchangeId, transactionId: d.transactionId, transactionType: d.transaction.type,
    });
    return;
  }

  metrics.deliveryAttempts.inc({ result: 'failure' });
  const dead = attemptNo >= d.maxAttempts;
  const backoff = config.delivery.baseBackoffMs * 2 ** (attemptNo - 1);
  await prisma.apiDelivery.update({
    where: { id: d.id },
    data: { status: dead ? 'DEAD' : 'RETRYING', attempts: attemptNo, lastError: error, lastStatusCode: statusCode, nextAttemptAt: new Date(Date.now() + backoff) },
  });
  await recordEvent(ref, 'DELIVERY_ATTEMPT', dead ? 'FAILURE' : 'RETRY',
    dead ? `Delivery failed permanently after ${attemptNo} attempts: ${error}` : `Attempt ${attemptNo} failed (${error}); retrying in ${Math.round(backoff / 1000)}s`, { durationMs });
  if (dead) {
    await prisma.transactionSet.update({ where: { id: d.transactionId }, data: { status: 'DELIVERY_FAILED' } });
    await publishEdiEvent({
      routingKey: ROUTING_KEYS.deliveryFailed, severity: 'ERROR', title: 'Delivery to order app failed',
      message: `${d.transaction.type} #${d.transaction.controlNumber} from ${d.transaction.partner?.name}: ${error}`, partner: d.transaction.partner?.isaId,
      interchangeId: d.transaction.interchangeId, transactionId: d.transactionId, transactionType: d.transaction.type,
    });
  }
}

/** Manually re-queue a delivery (admin action). */
export async function requeueDelivery(transactionId: string) {
  const d = await prisma.apiDelivery.findFirst({ where: { transactionId }, orderBy: { createdAt: 'desc' } });
  if (!d) return null;
  await prisma.apiDelivery.update({ where: { id: d.id }, data: { status: 'RETRYING', nextAttemptAt: new Date(), maxAttempts: d.attempts + config.delivery.maxAttempts } });
  await recordEvent({ transactionId, interchangeId: (await prisma.transactionSet.findUnique({ where: { id: transactionId } }))?.interchangeId }, 'DELIVERY_REQUEUED', 'INFO', 'Delivery manually re-queued by admin');
  return d.id;
}
