import amqp, { type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { EXCHANGES, QUEUES } from './contracts.js';

/**
 * Small RabbitMQ helper with automatic reconnection.
 *
 * Topology (declared idempotently by every service on connect):
 *
 *   edi.events   (topic) ──"edi.*.rejected | edi.*.failed"──▶ distributor.notifications
 *   order.events (topic) ──"#"──────────────────────────────▶ distributor.order-events
 *   both                 ──"#"──────────────────────────────▶ audit.all  (TTL 1h, max 5000)
 *   dlx          (fanout) ─────────────────────────────────▶ dead-letter
 */
export interface Consumer {
  queue: string;
  handler: (body: unknown, msg: ConsumeMessage) => Promise<void>;
}

type Logger = { info: (m: string) => void; warn: (m: string, e?: unknown) => void; error: (m: string, e?: unknown) => void };

export class MessageBus {
  private conn?: ChannelModel;
  private pub?: ConfirmChannel;
  private consumers: Consumer[] = [];
  private connecting = false;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly name: string,
    private readonly log: Logger = console,
    private readonly onPublish?: (routingKey: string) => void,
    private readonly onConsume?: (queue: string) => void,
  ) {}

  get connected(): boolean {
    return !!this.pub;
  }

  async start(): Promise<void> {
    await this.connect();
  }

  consume(queue: string, handler: Consumer['handler']): void {
    this.consumers.push({ queue, handler });
  }

  private async connect(): Promise<void> {
    if (this.connecting || this.closed) return;
    this.connecting = true;
    try {
      const conn = await amqp.connect(this.url, { clientProperties: { connection_name: this.name } });
      conn.on('error', (e) => this.log.warn(`[mq] connection error: ${e.message}`));
      conn.on('close', () => {
        this.pub = undefined;
        this.conn = undefined;
        if (!this.closed) {
          this.log.warn('[mq] connection closed, reconnecting in 5s');
          setTimeout(() => void this.connect(), 5000);
        }
      });
      this.conn = conn;
      const setup = await conn.createChannel();
      await declareTopology(setup);
      await setup.close();
      this.pub = await conn.createConfirmChannel();
      for (const c of this.consumers) await this.startConsumer(conn, c);
      this.log.info(`[mq] connected as ${this.name}`);
    } catch (e) {
      this.log.warn(`[mq] connect failed (${(e as Error).message}), retrying in 5s`);
      setTimeout(() => void this.connect(), 5000);
    } finally {
      this.connecting = false;
    }
  }

  private async startConsumer(conn: ChannelModel, c: Consumer) {
    const ch = await conn.createChannel();
    await ch.prefetch(10);
    await ch.consume(c.queue, async (msg) => {
      if (!msg) return;
      try {
        const body = JSON.parse(msg.content.toString('utf8'));
        await c.handler(body, msg);
        this.onConsume?.(c.queue);
        ch.ack(msg);
      } catch (e) {
        this.log.error(`[mq] handler for ${c.queue} failed`, e);
        // Redeliver once, then dead-letter.
        ch.nack(msg, false, !msg.fields.redelivered);
      }
    });
  }

  /** Publish a persistent JSON message. Returns false if the broker is unavailable. */
  async publish(exchange: string, routingKey: string, body: unknown): Promise<boolean> {
    const ch = this.pub;
    if (!ch) return false;
    try {
      ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(body)), {
        persistent: true,
        contentType: 'application/json',
        timestamp: Math.floor(Date.now() / 1000),
        appId: this.name,
      });
      await ch.waitForConfirms();
      this.onPublish?.(routingKey);
      return true;
    } catch (e) {
      this.log.warn(`[mq] publish ${routingKey} failed: ${(e as Error).message}`);
      return false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.conn?.close().catch(() => undefined);
  }
}

export async function declareTopology(ch: Channel): Promise<void> {
  await ch.assertExchange(EXCHANGES.edi, 'topic', { durable: true });
  await ch.assertExchange(EXCHANGES.orders, 'topic', { durable: true });
  await ch.assertExchange(EXCHANGES.deadLetter, 'fanout', { durable: true });
  await ch.assertQueue(QUEUES.deadLetter, { durable: true });
  await ch.bindQueue(QUEUES.deadLetter, EXCHANGES.deadLetter, '');

  const dl = { durable: true, arguments: { 'x-dead-letter-exchange': EXCHANGES.deadLetter } };
  await ch.assertQueue(QUEUES.distributorNotifications, dl);
  await ch.bindQueue(QUEUES.distributorNotifications, EXCHANGES.edi, 'edi.*.rejected');
  await ch.bindQueue(QUEUES.distributorNotifications, EXCHANGES.edi, 'edi.*.failed');

  await ch.assertQueue(QUEUES.distributorOrderEvents, dl);
  await ch.bindQueue(QUEUES.distributorOrderEvents, EXCHANGES.orders, '#');

  await ch.assertQueue(QUEUES.audit, { durable: true, arguments: { 'x-message-ttl': 3_600_000, 'x-max-length': 5000 } });
  await ch.bindQueue(QUEUES.audit, EXCHANGES.edi, '#');
  await ch.bindQueue(QUEUES.audit, EXCHANGES.orders, '#');
}
