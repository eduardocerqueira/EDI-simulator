import { randomUUID } from 'node:crypto';
import { EXCHANGES, type EdiEvent } from '@edi/shared';
import { MessageBus } from '@edi/shared/mq';
import { config } from './config.js';
import { prisma } from './db.js';
import { log } from './log.js';
import { metrics } from './metrics.js';

export const bus = new MessageBus(
  config.amqpUrl,
  'distributor-api',
  log,
  (rk) => metrics.mqPublished.inc({ routing_key: rk }),
  (q) => metrics.mqConsumed.inc({ queue: q }),
);

/**
 * Publish an EDI event to the `edi.events` exchange. Failures/rejections are
 * routed by RabbitMQ to the `distributor.notifications` queue, whose consumer
 * creates the notification shown in the UI. If the broker is down we write the
 * notification directly so nothing is lost.
 */
export async function publishEdiEvent(e: Omit<EdiEvent, 'eventId' | 'occurredAt'>): Promise<void> {
  const event: EdiEvent = { eventId: randomUUID(), occurredAt: new Date().toISOString(), ...e };
  const ok = await bus.publish(EXCHANGES.edi, e.routingKey, event);
  const notifiable = /\.(rejected|failed)$/.test(e.routingKey);
  if (!ok && notifiable) {
    await prisma.notification.create({
      data: {
        type: e.routingKey, severity: e.severity, title: e.title, message: e.message, source: 'fallback (broker unavailable)',
        payload: event as object, interchangeId: e.interchangeId, transactionId: e.transactionId,
      },
    });
  }
}
