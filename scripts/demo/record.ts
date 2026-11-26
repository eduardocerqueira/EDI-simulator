/**
 * Records the demo videos in docs/demo with Playwright against the running stack.
 *
 *   cd scripts/demo && npm install && npm run install-browser
 *   npx tsx record.ts infra|distributor|customer
 *
 * Every scene drives the real apps; terminal scenes run the real commands and
 * stream their real output. Produces .out/raw/<scene>.webm (convert with make-media.sh).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RAW = resolve(HERE, '.out/raw');
const VIEW = { width: 1440, height: 900 };
const DIST = 'http://localhost:3000';
const SHOP = 'http://localhost:3001';
const RABBIT = 'http://localhost:15672';

// ---------------------------------------------------------------------------
// Overlay injected in every page: visible cursor, click ripple, captions.
// ---------------------------------------------------------------------------
const OVERLAY = `
(() => {
  try { if (location.port === '3000' || location.port === '3001') localStorage.setItem('theme', 'dark'); } catch {}
  const boot = () => {
    if (document.getElementById('__demo_cursor')) return;
    const style = document.createElement('style');
    style.textContent = \`
      #__demo_cursor { position: fixed; z-index: 2147483647; pointer-events: none; width: 22px; height: 22px; left: -40px; top: -40px;
        transition: transform 80ms ease; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
      .__demo_ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 36px; height: 36px; margin: -18px 0 0 -18px;
        border-radius: 9999px; border: 3px solid rgba(250, 204, 21, .95); animation: __demo_r 550ms ease-out forwards; }
      @keyframes __demo_r { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
      #__demo_caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 28px; transform: translate(-50%, 12px); opacity: 0;
        transition: opacity 350ms ease, transform 350ms ease; pointer-events: none; max-width: 980px;
        background: rgba(10, 14, 12, .88); color: #fff; border: 1px solid rgba(255,255,255,.14); border-radius: 14px;
        padding: 12px 22px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 500 19px/1.35 Inter, ui-sans-serif, system-ui, sans-serif; text-align: center; }
      #__demo_caption.show { opacity: 1; transform: translate(-50%, 0); }
      #__demo_caption small { display: block; margin-top: 4px; font-size: 14.5px; font-weight: 400; color: rgba(255,255,255,.72); }
      #__demo_caption b { color: #4ade80; font-weight: 600; }
    \`;
    document.documentElement.appendChild(style);
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.4 20.3 L11.3 13.7 L17.5 13.7 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const cap = document.createElement('div');
    cap.id = '__demo_caption';
    document.documentElement.appendChild(cap);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX - 3 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      c.style.transform = 'scale(.85)';
      const r = document.createElement('div'); r.className = '__demo_ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
    window.__demoCaption = (html) => {
      if (!html) { cap.classList.remove('show'); return; }
      cap.innerHTML = html; cap.classList.add('show');
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };

async function caption(page: Page, title: string, sub?: string) {
  const html = title ? `${title}${sub ? `<small>${sub}</small>` : ''}` : '';
  await page.evaluate((h) => (window as unknown as { __demoCaption?: (h: string) => void }).__demoCaption?.(h), html).catch(() => undefined);
}

async function moveTo(page: Page, x: number, y: number, steps = 28) {
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}

async function point(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
  const box = await target.boundingBox();
  if (!box) throw new Error('element not visible');
  await moveTo(page, box.x + Math.min(box.width / 2, 60), box.y + box.height / 2);
}

async function click(page: Page, target: Locator, after = 900) {
  await point(page, target);
  await sleep(180);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(after);
}

async function typeInto(page: Page, target: Locator, text: string) {
  await click(page, target, 200);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text, { delay: 55 });
}

/** Smooth wheel scroll at the current (or given) mouse position. */
async function scroll(page: Page, dy: number, at?: { x: number; y: number }) {
  if (at) await moveTo(page, at.x, at.y, 15);
  const step = 40 * Math.sign(dy);
  for (let done = 0; Math.abs(done) < Math.abs(dy); done += step) {
    await page.mouse.wheel(0, step);
    await sleep(16);
  }
  await sleep(500);
}

async function goto(page: Page, url: string, settle = 1400) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.waitForLoadState('domcontentloaded'));
  await page.mouse.move(mouse.x, mouse.y);
  await sleep(settle);
}

/** Run a step but keep recording if it fails (logs the problem). */
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.warn(`  ! step "${name}" failed: ${(e as Error).message.split('\n')[0]}`);
  }
}

async function record(name: string, scene: (page: Page) => Promise<void>) {
  mkdirSync(RAW, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: RAW, size: VIEW }, colorScheme: 'dark', deviceScaleFactor: 1 });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const started = Date.now();
  await scene(page);
  await sleep(1200);
  const video = page.video()!;
  await ctx.close();
  renameSync(await video.path(), resolve(RAW, `${name}.webm`));
  await browser.close();
  console.log(`✔ ${name}.webm (${Math.round((Date.now() - started) / 1000)}s)`);
}

// ---------------------------------------------------------------------------
// Terminal page (served locally) that streams real command output
// ---------------------------------------------------------------------------
const TERMINAL_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Terminal</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; height: 100%; background: #0b0f0d; }
  .win { position: absolute; inset: 28px 36px 110px; background: #111714; border: 1px solid #263029; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); display: flex; flex-direction: column; overflow: hidden; }
  .bar { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #19201c; border-bottom: 1px solid #263029; font: 500 13px Inter, sans-serif; color: #9fb3a6; }
  .dot { width: 12px; height: 12px; border-radius: 50%; } .bar .t { margin-left: 12px; }
  #out { flex: 1; overflow-y: auto; padding: 16px 20px 24px; font: 15px/1.5 'JetBrains Mono', ui-monospace, Menlo, monospace; color: #d7e3db; white-space: pre-wrap; word-break: break-word; }
  #out::-webkit-scrollbar { width: 0; }
  .p { color: #4ade80; font-weight: 600; } .path { color: #60a5fa; } .cmd { color: #fff; }
  .caret { display: inline-block; width: 9px; height: 18px; background: #4ade80; vertical-align: -3px; animation: b 1s steps(1) infinite; }
  @keyframes b { 50% { opacity: 0 } }
  .b { font-weight: 700; } .d { opacity: .6; } .c31 { color: #f87171; } .c32 { color: #4ade80; } .c33 { color: #facc15; } .c34 { color: #60a5fa; } .c35 { color: #e879f9; } .c36 { color: #22d3ee; }
</style></head><body>
<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="t">~/EDI-simulator — zsh</span></div><div id="out"></div></div>
<script>
  const out = document.getElementById('out');
  let line = null;
  const bottom = () => { out.scrollTop = out.scrollHeight; };
  window.term = {
    prompt() { document.querySelectorAll('.caret').forEach((c) => c.remove()); line = document.createElement('div'); line.innerHTML = '<span class="p">➜</span> <span class="path">EDI-simulator</span> <span class="cmd"></span><span class="caret"></span>'; out.appendChild(line); bottom(); },
    typeChar(ch) { line.querySelector('.cmd').textContent += ch; },
    enter() { document.querySelectorAll('.caret').forEach((c) => c.remove()); },
    write(html) { const s = document.createElement('span'); s.innerHTML = html; out.appendChild(s); bottom(); },
    clear() { out.innerHTML = ''; },
  };
</script></body></html>`;

function ansiToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '');
  let open = 0;
  const html = esc.replace(/\x1b\[([0-9;]*)m/g, (_m, codes: string) => {
    let s = '';
    for (const code of codes.split(';').map(Number)) {
      if (code === 0 || code === 22 || code === 39) { s += '</span>'.repeat(open); open = 0; }
      else { const cls = code === 1 ? 'b' : code === 2 ? 'd' : code >= 30 && code <= 37 ? `c${code}` : code >= 90 && code <= 97 ? `c${code - 60}` : ''; if (cls) { s += `<span class="${cls}">`; open++; } }
    }
    return s;
  });
  return html + '</span>'.repeat(open);
}

let terminalServer: ReturnType<typeof createServer> | undefined;
async function terminalUrl(): Promise<string> {
  if (!terminalServer) {
    terminalServer = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(TERMINAL_HTML); });
    await new Promise<void>((r) => terminalServer!.listen(7799, r));
  }
  return 'http://localhost:7799/';
}

/** Type a command in the fake terminal, then run it for real and stream its output. */
async function run(page: Page, command: string, opts: { pauseAfter?: number } = {}) {
  await page.evaluate(() => (window as unknown as { term: { prompt: () => void } }).term.prompt());
  await sleep(350);
  for (const ch of command) {
    await page.evaluate((c) => (window as unknown as { term: { typeChar: (c: string) => void } }).term.typeChar(c), ch);
    await sleep(ch === ' ' ? 45 : 28);
  }
  await sleep(450);
  await page.evaluate(() => (window as unknown as { term: { enter: () => void } }).term.enter());
  await page.evaluate(() => (window as unknown as { term: { write: (h: string) => void } }).term.write('\n'));
  await new Promise<void>((done) => {
    const child = spawn('bash', ['-lc', command], { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '1', NO_UPDATE_NOTIFIER: '1' } });
    const push = (buf: Buffer) => void page.evaluate((h) => (window as unknown as { term: { write: (h: string) => void } }).term.write(h), ansiToHtml(buf.toString('utf8'))).catch(() => undefined);
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('close', () => done());
  });
  await sleep(opts.pauseAfter ?? 1800);
}

function background(command: string) {
  const child = spawn('bash', ['-lc', command], { cwd: ROOT, env: process.env, stdio: 'ignore', detached: true });
  child.unref();
}

// ---------------------------------------------------------------------------
// Scene 1 — Infrastructure
// ---------------------------------------------------------------------------
async function infra(page: Page) {
  await goto(page, await terminalUrl(), 600);
  await caption(page, '<b>EDI Simulator</b> · Infrastructure', 'Producers ⇄ FTP ⇄ Distributor ⇄ REST ⇄ Order app, with RabbitMQ events — all local with Docker Compose');
  await sleep(3500);

  await caption(page, 'Postgres, RabbitMQ, an HA FTP cluster (load balancer + 3 nodes + self-healing controller), Prometheus and two apps', 'started with <b>docker compose up -d --build</b>');
  await run(page, `docker compose ps --format 'table {{.Service}}\\t{{.Image}}\\t{{.Status}}'`, { pauseAfter: 3500 });

  await caption(page, 'The FTP server is built from <b>infra/ftp/Containerfile</b> (vsftpd)', 'the distributor login sees one mailbox per trading partner');
  await run(page, 'curl -s --user distributor:distributor123 ftp://localhost/', { pauseAfter: 2500 });
  await caption(page, 'Each producer is chrooted to its own mailbox', '<b>to_distributor</b> = inbound X12 · <b>from_distributor</b> = TA1/997 acks · <b>archive</b> · <b>error</b>');
  await run(page, 'curl -s --user zephyrwood:producer123 ftp://localhost/', { pauseAfter: 3000 });

  await page.evaluate(() => (window as unknown as { term: { clear: () => void } }).term.clear());
  await caption(page, '<b>sim:producers</b> — 10 farm producers send 832 / 846 / 856 over FTP', '<b>--bootstrap</b> sends a catalog per producer first; <b>-b 0.4</b> injects bad data into 40% of the rest');
  await run(page, 'npm run -s sim:producers -- --bootstrap -n 8 -b 0.4 -i 120', { pauseAfter: 5500 });

  await page.evaluate(() => (window as unknown as { term: { clear: () => void } }).term.clear());
  await caption(page, 'The distributor polls FTP every 5s, validates every envelope and acknowledges it', 'accepted → ingested and pushed to the order app as JSON · rejected → TA1 / 997 with the X12 error code');
  await run(page, `docker compose logs distributor-api --no-log-prefix 2>&1 | grep pipeline | tail -12 | cut -c26-`, { pauseAfter: 5000 });

  await caption(page, 'Acknowledgments travel back over FTP', '<b>sim:acks</b> downloads the TA1 / 997 the distributor left in each producer mailbox');
  await run(page, 'npm run -s sim:acks -- -p ZEPHYRWOOD,PEBBLEWING', { pauseAfter: 3500 });
  await caption(page, 'A 997 Functional Acknowledgment', 'AK1 group · AK2 transaction set · AK5 accept/reject · AK9 group verdict');
  await run(page, `cat "$(ls -t simulator-output/acks/997_* | head -1)"`, { pauseAfter: 4500 });

  // RabbitMQ
  await caption(page, '');
  background('npm run -s sim:producers -- -n 24 -b 0.3 -i 700 >/dev/null 2>&1; npm run -s sim:customers -- -c 5 -o 8 -i 900 >/dev/null 2>&1');
  await goto(page, RABBIT, 800);
  await caption(page, '<b>RabbitMQ</b> carries notifications and order events', 'management UI on :15672');
  await step('rabbit login', async () => {
    await typeInto(page, page.locator('input[name="username"]'), 'edi');
    await typeInto(page, page.locator('input[name="password"]'), 'edi');
    await click(page, page.locator('input[type="submit"], button[type="submit"]').first(), 2500);
  });
  await caption(page, 'Live message rates while the simulator keeps sending files', 'publish / deliver / ack per second');
  await scroll(page, 300, { x: 720, y: 500 });
  await sleep(4000);
  await step('exchanges', async () => {
    await click(page, page.getByRole('link', { name: 'Exchanges', exact: true }), 1500);
    await caption(page, 'Topic exchanges: <b>edi.events</b> (distributor) and <b>order.events</b> (order app)', 'plus a <b>dlx</b> dead-letter exchange');
    await sleep(2500);
    await click(page, page.getByRole('link', { name: 'edi.events', exact: true }), 1800);
    await click(page, page.getByText('Bindings', { exact: true }).first(), 1200);
    await caption(page, 'Bindings route by routing key', '<b>edi.*.rejected</b> and <b>edi.*.failed</b> → distributor.notifications · <b>#</b> → audit.all');
    await scroll(page, 450, { x: 720, y: 500 });
    await sleep(3500);
  });
  await step('queues', async () => {
    await click(page, page.getByRole('link', { name: /Queues/ }).first(), 1800);
    await caption(page, 'Queues and consumers', 'the distributor consumes notifications and the order events it replicates (customers, orders, bills)');
    await sleep(4500);
    await click(page, page.getByRole('link', { name: 'audit.all', exact: true }), 1800);
    await caption(page, 'Peek at a message on the audit queue');
    await scroll(page, 700, { x: 720, y: 500 });
    const getHeader = page.getByText('Get messages', { exact: true }).first();
    await click(page, getHeader, 800);
    await click(page, page.locator('input[type="submit"][value*="Get Message"]').first(), 1500);
    await scroll(page, 450, { x: 720, y: 500 });
    await caption(page, 'Every event is plain JSON with its routing key', 'order.* / bill.* / customer.* from the order app · edi.* from the distributor');
    await sleep(5000);
  });
  await caption(page, 'Next → the <b>Distributor</b> EDI Control Center and the <b>Order app</b>');
  await sleep(3000);
}

// ---------------------------------------------------------------------------
// Scene 2 — Distributor (EDI Control Center)
// ---------------------------------------------------------------------------
async function distributor(page: Page) {
  await goto(page, `${DIST}/login`, 800);
  await caption(page, '<b>Harvest Hub</b> · EDI Control Center', 'web app 1 — the distributor that receives X12 from 10 producers');
  await sleep(2000);
  await click(page, page.getByRole('button', { name: /sign in/i }), 2500);

  await caption(page, 'Live dashboard', 'acceptance rate, first-pass yield, processing & end-to-end latency, deliveries, revenue and AR');
  await sleep(2500);
  await step('dashboard range', async () => { await click(page, page.getByRole('tab', { name: '24h' }).or(page.getByRole('button', { name: '24h' })).first(), 1500); });
  await scroll(page, 650, { x: 840, y: 520 });
  await caption(page, 'Throughput, top validation errors, recent envelopes and the producer scorecard');
  await scroll(page, 700);
  await sleep(1500);

  await step('interchanges', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Interchanges' }), 1500);
    await caption(page, 'Every ISA/IEA <b>interchange</b> received over FTP', 'status, TA1 verdict, transaction sets and the acknowledgments sent back');
    await sleep(2500);
    await click(page, page.locator('tbody tr', { hasText: 'Accepted' }).first(), 2200);
  });
  await caption(page, 'The trace page: how this file arrived and where its data went', 'FTP pickup & archive path, SHA-256, attempts, processing time');
  await sleep(3500);
  await step('envelope', async () => {
    await caption(page, '');
    await point(page, page.getByText('Envelope structure').first());
    await caption(page, 'The envelope, layer by layer: ISA → GS → ST', 'the same picture as the X12 course slides, built from the real file (hover any field)');
    await sleep(1500);
    await point(page, page.getByText(/ISA13/).first());
    await sleep(1500);
    await point(page, page.getByText(/GS06/).first());
    await sleep(1500);
  });
  await scroll(page, 700, { x: 1000, y: 520 });
  await step('segments', async () => {
    await caption(page, '');
    await click(page, page.getByRole('tab', { name: /Segments/ }), 1000);
    await caption(page, 'Annotated segments: every element with its name and code meaning');
    await click(page, page.getByRole('button', { name: /ISA\*00/ }).first(), 2200);
    await click(page, page.getByRole('button', { name: /LIN\*/ }).first(), 2500);
  });
  await step('timeline', async () => {
    await caption(page, '');
    await click(page, page.getByRole('tab', { name: /Timeline/ }), 1200);
    await caption(page, 'Processing timeline', 'discovered → downloaded → parsed → validated → mapped → ingested → TA1/997 sent → delivered to the order app');
    await scroll(page, 400);
    await sleep(2500);
  });
  await step('acks', async () => {
    await caption(page, '');
    await click(page, page.getByRole('tab', { name: /Acknowledgments/ }), 1200);
    await caption(page, 'The TA1 and 997 generated for this interchange and uploaded back over FTP');
    await sleep(3000);
  });

  await step('rejected', async () => {
    await caption(page, '');
    await goto(page, `${DIST}/edi/interchanges?status=REJECTED`);
    await caption(page, 'Bad data is caught and explained', 'filter: rejected interchanges');
    await sleep(1800);
    await click(page, page.locator('tbody tr').first(), 2200);
    await caption(page, 'Why it was rejected — with the exact TA1 / 997 error code');
    await sleep(3000);
    await scroll(page, 650, { x: 1000, y: 520 });
    await click(page, page.getByRole('tab', { name: /Validation/ }), 1200);
    await sleep(3500);
  });

  await step('transaction', async () => {
    await caption(page, '');
    await goto(page, `${DIST}/edi/transactions?status=DELIVERED`);
    await caption(page, 'Transaction sets (ST/SE)', 'click one to see the X12 ⇄ JSON conversion');
    await sleep(1500);
    await click(page, page.locator('tbody tr').first(), 2200);
    await caption(page, 'X12 on the left, the JSON produced from it on the right');
    await sleep(3500);
    await scroll(page, 500, { x: 1000, y: 520 });
    await click(page, page.getByRole('tab', { name: /Payload/ }), 1500);
    await caption(page, 'The exact JSON sent to the order app over REST', 'idempotent on transactionId · retried with exponential backoff');
    await sleep(3500);
    await click(page, page.getByRole('tab', { name: /Inventory/ }), 1500);
    await caption(page, 'The inventory movements this transaction caused');
    await sleep(2500);
  });

  await step('files drawer', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'FTP Transfers' }), 1500);
    await caption(page, 'FTP transfers: inbound X12 and outbound TA1 / 997', 'retries, sizes, checksums, archive paths');
    await sleep(1500);
    await click(page, page.getByRole('button', { name: 'View' }).first(), 1800);
    await caption(page, 'File details open in a drawer — the raw X12 exactly as received');
    await sleep(3500);
    await page.keyboard.press('Escape');
    await sleep(800);
  });

  await step('validation', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Validation' }), 1800);
    await caption(page, 'Validation explorer: where partners’ data-quality problems are', 'by level (interchange, group, transaction, segment, element, business) and by code');
    await scroll(page, 600, { x: 900, y: 520 });
    await sleep(2000);
  });

  await step('notifications', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: /Notifications/ }), 1800);
    await caption(page, 'Notifications delivered by RabbitMQ', 'EDI failures from <b>edi.events</b> and order events from the order app');
    await sleep(3500);
  });

  await step('inventory', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Inventory' }), 1800);
    await caption(page, 'Inventory loaded by EDI', '100 farm products — cost from the 832, quantity from the 846 / 856, sell price with markup');
    await sleep(2500);
    await click(page, page.locator('tbody tr').first(), 2200);
    await caption(page, 'Traceability: every stock change links back to its X12 transaction and envelope');
    await scroll(page, 500, { x: 900, y: 520 });
    await sleep(3000);
  });

  await step('billing', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Billing' }), 1800);
    await caption(page, 'Customers, orders and Net-30 bills replicated from the order app via RabbitMQ');
    await sleep(3000);
  });

  await step('kpis', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: /KPIs/ }), 2000);
    await caption(page, 'KPIs & observability', 'each KPI with its definition · Prometheus metrics on :4000/metrics');
    await scroll(page, 900, { x: 900, y: 520 });
    await sleep(1500);
    await scroll(page, 900);
    await sleep(1500);
  });

  await step('inspector', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'X12 Inspector' }), 1500);
    await caption(page, 'X12 Inspector — paste any X12 to learn from it');
    await click(page, page.getByRole('button', { name: /broken 846/ }), 1000);
    await click(page, page.getByRole('button', { name: 'Inspect' }), 2200);
    await caption(page, 'Every problem located by segment and element, with its 997 code');
    await scroll(page, 700, { x: 900, y: 520 });
    await sleep(3500);
  });
  await caption(page, '<b>Harvest Hub</b> · EDI Control Center', 'next → the customer storefront');
  await sleep(2500);
}

// ---------------------------------------------------------------------------
// Scene 3 — Customer storefront (Order app)
// ---------------------------------------------------------------------------
/** Make sure the demo customer has a couple of open Net-30 bills to show and pay (done via the API, off camera). */
async function prepareCustomer() {
  const login = await fetch('http://localhost:4100/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nova@copperleaf.example', password: 'password123' }) });
  const { token } = (await login.json()) as { token: string };
  const h = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const bills = (await (await fetch('http://localhost:4100/api/bills?status=OPEN', { headers: h })).json()) as unknown[];
  if (bills.length >= 2) return;
  const { items } = (await (await fetch('http://localhost:4100/api/products?inStock=true&pageSize=30', { headers: h })).json()) as { items: Array<{ id: string; available: number }> };
  for (let i = 0; i < 2; i++) {
    const lines = items.slice(i * 3, i * 3 + 3).map((p) => ({ productId: p.id, quantity: Math.min(4, p.available) }));
    await fetch('http://localhost:4100/api/orders', { method: 'POST', headers: h, body: JSON.stringify({ items: lines, notes: 'Weekly standing order' }) });
  }
}

async function customer(page: Page) {
  await prepareCustomer();
  await goto(page, `${SHOP}/login`, 800);
  await caption(page, '<b>Harvest Market</b> · wholesale ordering', 'web app 2 — restaurants and grocers buy what the producers loaded via EDI');
  await sleep(2500);
  await click(page, page.getByRole('button', { name: /sign in/i }).first(), 2500);

  await caption(page, 'Customer dashboard', 'spend, orders, open and overdue bills, next due date');
  await sleep(2500);
  await scroll(page, 500, { x: 720, y: 520 });
  await sleep(1200);

  await step('shop', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Shop' }).first(), 1800);
    await caption(page, 'The catalog is the distributor’s inventory', 'each product shows the X12 transaction (and ICN) that last synced it');
    await sleep(2500);
    await typeInto(page, page.getByPlaceholder(/Search products/), 'honey');
    await sleep(1600);
    await caption(page, 'Add to cart — quantities are capped by available stock');
    const adds = page.getByRole('button', { name: /^Add$/ });
    await click(page, adds.nth(0), 900);
    await click(page, adds.nth(1), 900);
    await typeInto(page, page.getByPlaceholder(/Search products/), 'apples');
    await sleep(1400);
    await click(page, page.getByRole('button', { name: /^Add$/ }).first(), 900);
  });

  await step('cart', async () => {
    await caption(page, '');
    // toasts sit over the header cart button (and pause while hovered): move away and let them clear
    await moveTo(page, 720, 600, 20);
    await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    await click(page, page.getByRole('button', { name: /^Cart/ }), 1500);
    await caption(page, 'Cart drawer');
    const drawer = page.getByRole('dialog');
    const inc = drawer.getByRole('button', { name: 'Increase' });
    await click(page, inc.first(), 400);
    await click(page, inc.first(), 400);
    await click(page, inc.first(), 1000);
    await click(page, drawer.getByRole('link', { name: /Checkout/ }).or(drawer.getByRole('button', { name: /Checkout/ })).first(), 1800);
  });

  await step('checkout', async () => {
    await caption(page, '');
    await caption(page, 'Checkout — every order creates a bill due in 30 days (Net 30)');
    await typeInto(page, page.getByPlaceholder(/Deliver to back entrance/), 'Deliver to the back entrance before 7am');
    await sleep(800);
    await click(page, page.getByRole('button', { name: /Place order/ }), 2200);
    await caption(page, 'Order placed: stock reserved, bill issued, and the distributor notified through RabbitMQ');
    await sleep(3500);
    await click(page, page.getByRole('button', { name: 'View order' }), 2000);
  });

  await step('order detail', async () => {
    await caption(page, '');
    await caption(page, 'Order detail: items, bill, timeline');
    await scroll(page, 400, { x: 720, y: 520 });
    await sleep(2000);
    await click(page, page.getByRole('button', { name: /Cancel order/ }).first(), 1500);
    await caption(page, 'Cancel → stock goes back and the distributor gets <b>order.cancelled</b>');
    await sleep(2500);
    await click(page, page.getByRole('button', { name: /Cancel order/ }).last(), 2200);
    await sleep(1500);
  });

  await step('bills', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Bills' }).first(), 1800);
    await caption(page, 'Bills: open, overdue, paid', 'days until due for each Net-30 bill');
    await sleep(2500);
    await click(page, page.getByRole('button', { name: /^Pay$/ }).first(), 1500);
    await caption(page, 'Pay a bill → <b>bill.paid</b> event');
    await sleep(2000);
    await click(page, page.getByRole('button', { name: /^Pay \$/ }), 2200);
  });

  await step('reports', async () => {
    await caption(page, '');
    await click(page, page.getByRole('link', { name: 'Reports' }).first(), 2000);
    await caption(page, 'Customer reports', 'spend over time, by category and by producer, top products');
    await scroll(page, 700, { x: 720, y: 520 });
    await sleep(2500);
  });

  await step('distributor sees it', async () => {
    await caption(page, '');
    await caption(page, 'Meanwhile, at the distributor…');
    await goto(page, `${DIST}/login`, 600);
    await click(page, page.getByRole('button', { name: /sign in/i }), 2200);
    await goto(page, `${DIST}/notifications`, 800);
    await click(page, page.getByRole('tab', { name: /Orders/ }), 1500);
    await caption(page, 'The orders, cancellation and payment arrived as RabbitMQ events', 'order app → transactional outbox → order.events → distributor');
    await sleep(4500);
  });
  await caption(page, '<b>Harvest Market</b> · customer storefront');
  await sleep(2000);
}

// ---------------------------------------------------------------------------
const scenes: Record<string, (p: Page) => Promise<void>> = { infra, distributor, customer };
const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(scenes)) {
  if (!scenes[name]) throw new Error(`unknown scene ${name}`);
  console.log(`● recording ${name}`);
  await record(name, scenes[name]);
}
terminalServer?.close();
