import { c, table } from './term.js';
import { chance, pick, rand, sample } from './random.js';

export interface CustomerOptions {
  api: string;
  customers: number;
  orders: number;
  cancelRatio: number;
  payRatio: number;
  intervalMs: number;
  password: string;
}

/** Same demo accounts the order-api seeds on startup. */
const SEEDED = [
  'alice@freshbistro.local', 'ben@greengrocer.local', 'carla@cornercafe.local', 'dev@sprouts-kitchen.local',
  'emma@harborinn.local', 'felix@urbanbakery.local', 'grace@schoolmeals.local', 'hugo@farmtable.local',
];

interface Product { id: string; name: string; price: number; available: number; uom: string }

async function call<T>(api: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

/**
 * Simulate customers using the order app: log in, browse the inventory that
 * producers loaded via EDI, place orders (each creates a Net-30 bill), cancel
 * some and pay some. Every action emits an event to RabbitMQ that the
 * distributor consumes.
 */
export async function runCustomers(opts: CustomerOptions) {
  const emails = sample(SEEDED, Math.min(opts.customers, SEEDED.length));
  const sessions: Array<{ email: string; token: string }> = [];
  for (const email of emails) {
    try {
      const { token } = await call<{ token: string }>(opts.api, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: opts.password }) });
      sessions.push({ email, token });
    } catch (e) {
      console.log(c.red(`login failed for ${email}: ${(e as Error).message}`));
    }
  }
  if (!sessions.length) throw new Error(`No customer could log in at ${opts.api}`);

  console.log(c.bold(`\n▶ Simulating ${opts.orders} order action(s) by ${sessions.length} customer(s) against ${opts.api}\n`));
  const rows: string[][] = [];
  const placed: Array<{ token: string; id: string; orderNumber: string; billId?: string; email: string }> = [];

  for (let i = 0; i < opts.orders; i++) {
    const s = pick(sessions);
    try {
      const { items } = await call<{ items: Product[] }>(opts.api, '/api/products?inStock=true&pageSize=100', { token: s.token });
      if (!items.length) {
        rows.push([String(i + 1), s.email, c.yellow('skip'), 'No products in stock yet — run the producer simulation first (832 + 846/856)']);
        continue;
      }
      const lines = sample(items, rand(1, Math.min(5, items.length))).map((p) => ({ productId: p.id, quantity: Math.max(1, Math.min(p.available, rand(1, 12))) }));
      const order = await call<{ id: string; orderNumber: string; total: number; bill?: { id: string; billNumber: string; dueDate: string } }>(opts.api, '/api/orders', {
        method: 'POST', token: s.token, body: JSON.stringify({ items: lines, notes: 'Simulated order' }),
      });
      placed.push({ token: s.token, id: order.id, orderNumber: order.orderNumber, billId: order.bill?.id, email: s.email });
      rows.push([String(i + 1), s.email, c.green('order.created'), `${order.orderNumber} $${order.total.toFixed(2)} · ${order.bill?.billNumber} due ${order.bill?.dueDate.slice(0, 10)}`]);

      if (chance(opts.cancelRatio)) {
        await call(opts.api, `/api/orders/${order.id}/cancel`, { method: 'POST', token: s.token });
        rows.push(['', s.email, c.yellow('order.cancelled'), `${order.orderNumber} cancelled, stock released`]);
      } else if (order.bill && chance(opts.payRatio)) {
        await call(opts.api, `/api/bills/${order.bill.id}/pay`, { method: 'POST', token: s.token });
        rows.push(['', s.email, c.cyan('bill.paid'), `${order.bill.billNumber} paid`]);
      }
    } catch (e) {
      rows.push([String(i + 1), s.email, c.red('error'), (e as Error).message]);
    }
    if (opts.intervalMs) await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  console.log(table(['#', 'Customer', 'Event', 'Details'], rows));
  console.log(c.dim('\nEach event flows order-api → outbox → RabbitMQ (order.events) → distributor (notifications, stock, customer/billing replica).'));
}
