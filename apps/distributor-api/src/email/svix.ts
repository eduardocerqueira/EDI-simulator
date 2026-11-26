import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Resend signs webhooks with Svix. Signature = base64(HMAC-SHA256(key, `${id}.${timestamp}.${rawBody}`)),
 * sent as `svix-signature: v1,<sig>` (several space-separated signatures are allowed during key rotation).
 * The key is the base64 part of the `whsec_…` secret.
 */

const TOLERANCE_SEC = 5 * 60;

const keyOf = (secret: string) => Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');

export function sign(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac('sha256', keyOf(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
}

/** Headers the (simulated) Resend attaches to a webhook delivery. */
export function signedHeaders(secret: string, body: string) {
  const id = `msg_${randomUUID().replace(/-/g, '')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  return { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${sign(secret, id, timestamp, body)}` };
}

export class WebhookVerificationError extends Error {}

/** Verify a webhook exactly as `resend.webhooks.verify()` does. Throws WebhookVerificationError. */
export function verify(secret: string, rawBody: string, headers: Record<string, string | string[] | undefined>) {
  const h = (k: string) => {
    const v = headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const id = h('svix-id');
  const ts = h('svix-timestamp');
  const sigHeader = h('svix-signature');
  if (!id || !ts || !sigHeader) throw new WebhookVerificationError('Missing svix-id / svix-timestamp / svix-signature headers');
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) throw new WebhookVerificationError('Invalid svix-timestamp');
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SEC) throw new WebhookVerificationError('Timestamp outside the 5 minute tolerance (possible replay)');
  const expected = Buffer.from(sign(secret, id, timestamp, rawBody));
  const ok = sigHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookVerificationError('Signature mismatch');
  return { id, timestamp, event: JSON.parse(rawBody) as ResendWebhookEvent };
}

export interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    created_at?: string;
    message_id?: string;
    attachments?: Array<{ id: string; filename: string; content_type: string }>;
    bounce?: { type: string; subType: string; message: string };
  };
}
