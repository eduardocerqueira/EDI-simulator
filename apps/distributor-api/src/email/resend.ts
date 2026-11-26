import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { log } from '../log.js';
import { signedHeaders, type ResendWebhookEvent } from './svix.js';

/**
 * A stand-in for the Resend service, with the same surface as the Node SDK:
 *   resend.emails.send(payload, { idempotencyKey })  → { data: { id }, error }
 *   resend.emails.receiving.get(id)                  → { data: ReceivedEmail, error }
 * and Resend's behaviour on the other side of the wire:
 *   - only the verified sending domain may be used in From (403 otherwise)
 *   - idempotency keys: same key + same payload → original response; different payload → 409
 *   - delivery events posted to our webhook, signed the way Svix signs them
 *   - Resend's test inboxes: delivered@resend.dev, bounced@resend.dev, complained@resend.dev
 *   - inbound mail: `email.received` webhooks carry metadata only; the body is fetched with receiving.get()
 *
 * Nothing leaves the machine. To go live you would swap this object for `new Resend(apiKey)`;
 * the webhook endpoint and the rest of the app stay the same.
 */

export interface SendEmailPayload {
  from: string;
  to: string[];
  cc?: string[];
  reply_to?: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: string; content_type?: string }>; // content = base64
  tags?: Array<{ name: string; value: string }>;
}

export interface ReceivedEmail {
  id: string;
  object: 'email';
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string | null;
  headers: Record<string, string>;
  created_at: string;
}

export interface ResendError {
  name: string;
  message: string;
  statusCode: number;
}
type Result<T> = { data: T; error: null } | { data: null; error: ResendError };

/** The other end of the simulation: how recipients behave (implemented in world.ts). */
export interface RecipientWorld {
  /** Return a reply (or null) for an e-mail the recipient opened. */
  composeReply(sent: { id: string; payload: SendEmailPayload }): Promise<{ from: string; text: string } | null>;
}

const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number) => base * (0.6 + Math.random() * 0.8);

class SimulatedResend {
  private idempotency = new Map<string, { hash: string; id: string; at: number }>();
  private sent = new Map<string, SendEmailPayload>();
  private inbox = new Map<string, ReceivedEmail>();
  private world?: RecipientWorld;

  setWorld(world: RecipientWorld) {
    this.world = world;
  }

  emails = {
    send: async (payload: SendEmailPayload, options?: { idempotencyKey?: string }): Promise<Result<{ id: string }>> => {
      await sleep(80 + Math.random() * 120); // network round trip
      const fail = (statusCode: number, name: string, message: string) => ({ data: null, error: { statusCode, name, message } });
      if (!payload.to?.length) return fail(422, 'validation_error', 'Missing `to` field.');
      if (!payload.subject?.trim()) return fail(422, 'validation_error', 'Missing `subject` field.');
      if (!payload.text && !payload.html) return fail(422, 'validation_error', 'Provide `text` or `html`.');
      const bad = [...payload.to, ...(payload.cc ?? [])].find((a) => !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(addr(a)));
      if (bad) return fail(422, 'validation_error', `Invalid recipient address: ${bad}`);
      const fromDomain = addr(payload.from).split('@')[1];
      if (fromDomain !== config.email.sendingDomain) {
        return fail(403, 'validation_error', `The ${fromDomain} domain is not verified. Please, add and verify your domain on https://resend.com/domains`);
      }
      if (options?.idempotencyKey) {
        const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const prev = this.idempotency.get(options.idempotencyKey);
        if (prev && Date.now() - prev.at < 24 * 3600_000) {
          if (prev.hash !== hash) return fail(409, 'invalid_idempotent_request', 'Same idempotency key used with a different request payload.');
          return { data: { id: prev.id }, error: null };
        }
        const id = randomUUID();
        this.idempotency.set(options.idempotencyKey, { hash, id, at: Date.now() });
        this.accept(id, payload);
        return { data: { id }, error: null };
      }
      const id = randomUUID();
      this.accept(id, payload);
      return { data: { id }, error: null };
    },

    receiving: {
      get: async (id: string): Promise<Result<ReceivedEmail>> => {
        await sleep(40);
        const e = this.inbox.get(id);
        return e ? { data: e, error: null } : { data: null, error: { statusCode: 404, name: 'not_found', message: 'Email not found' } };
      },
    },
  };

  /** Test hook (like sending to a Resend test inbox): make a recipient reply now. */
  async simulateInbound(msg: { from: string; to: string[]; subject: string; text: string; inReplyTo?: string }) {
    const id = randomUUID();
    const email: ReceivedEmail = {
      id,
      object: 'email',
      from: msg.from,
      to: msg.to,
      cc: [],
      subject: msg.subject,
      text: msg.text,
      html: null,
      headers: { 'message-id': `<${id}@inbound.resend.app>`, ...(msg.inReplyTo ? { 'in-reply-to': `<${msg.inReplyTo}@resend.dev>` } : {}) },
      created_at: new Date().toISOString(),
    };
    this.inbox.set(id, email);
    await this.deliverWebhook('email.received', {
      email_id: id,
      from: msg.from,
      to: msg.to,
      cc: [],
      bcc: [],
      subject: msg.subject,
      message_id: email.headers['message-id'],
      attachments: [],
    });
    return id;
  }

  /** Accepted for delivery: play out what Resend would report through webhooks. */
  private accept(id: string, payload: SendEmailPayload) {
    this.sent.set(id, payload);
    const base = { email_id: id, from: payload.from, to: payload.to, subject: payload.subject, created_at: new Date().toISOString() };
    const recipient = addr(payload.to[0]!);
    void (async () => {
      try {
        await sleep(jitter(400));
        await this.deliverWebhook('email.sent', base);
        await sleep(jitter(1800));
        if (recipient === 'bounced@resend.dev' || recipient.includes('bounce')) {
          await this.deliverWebhook('email.bounced', { ...base, bounce: { type: 'Permanent', subType: 'General', message: `The recipient's mail server permanently rejected the message (550 5.1.1 ${recipient}: user unknown).` } });
          return;
        }
        await this.deliverWebhook('email.delivered', base);
        if (recipient === 'complained@resend.dev') {
          await sleep(jitter(2500));
          await this.deliverWebhook('email.complained', base);
          return;
        }
        await sleep(jitter(5000));
        if (Math.random() < 0.9) await this.deliverWebhook('email.opened', base);
        else return;
        const reply = await this.world?.composeReply({ id, payload });
        if (!reply) return;
        await sleep(jitter(config.email.simReplyDelayMs));
        await this.simulateInbound({
          from: reply.from,
          to: [payload.reply_to ?? payload.from],
          subject: payload.subject.startsWith('Re:') ? payload.subject : `Re: ${payload.subject}`,
          text: reply.text,
          inReplyTo: id,
        });
      } catch (e) {
        log.warn(`[resend-sim] ${(e as Error).message}`);
      }
    })();
  }

  /** POST a Svix-signed webhook to our endpoint, retrying like Resend does (simplified schedule). */
  private async deliverWebhook(type: string, data: ResendWebhookEvent['data']) {
    const body = JSON.stringify({ type, created_at: new Date().toISOString(), data } satisfies ResendWebhookEvent);
    const headers = signedHeaders(config.email.webhookSecret, body);
    for (const [i, wait] of [0, 2000, 5000, 15000].entries()) {
      if (wait) await sleep(wait);
      try {
        const res = await fetch(config.email.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, signal: AbortSignal.timeout(5000) });
        if (res.ok) return;
        log.warn(`[resend-sim] webhook ${type} → HTTP ${res.status} (attempt ${i + 1})`);
      } catch (e) {
        log.warn(`[resend-sim] webhook ${type} failed: ${(e as Error).message} (attempt ${i + 1})`);
      }
    }
  }
}

export const resend = new SimulatedResend();
