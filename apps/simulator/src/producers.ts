import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Client } from 'basic-ftp';
import { PRODUCERS, productsOf, type Producer } from './shared.js';
import { chooseProducts, type SupportedType } from './generators.js';
import { buildInterchange } from './interchange.js';
import { chance, pick, sample, weighted } from './random.js';
import { SCENARIOS, scenariosFor, type Scenario } from './scenarios.js';
import { c, table } from './term.js';

export interface ProducerOptions {
  count: number;
  badRatio: number;
  types: SupportedType[];
  producers: Producer[];
  intervalMs: number;
  /** When set, wait a random 0..delaySec seconds between files instead of the fixed interval. */
  delaySec?: number;
  bootstrap: boolean;
  scenario?: string;
  outDir: string;
  dryRun: boolean;
  usage: 'T' | 'P';
  ftp: { host: string; port: number; password: string };
}

export interface State {
  [isaId: string]: { lastIcn: number; history: string[] };
}

const TYPE_WEIGHTS: Record<SupportedType, number> = { '832': 1, '846': 3, '856': 2 };

export function loadState(dir: string): State {
  const f = join(dir, 'state.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as State) : {};
}
export function saveState(dir: string, s: State) {
  writeFileSync(join(dir, 'state.json'), JSON.stringify(s, null, 2));
}

/** Interchange control numbers must be unique per sender: persist a counter per producer. */
function nextIcn(state: State, p: Producer): number {
  const cur = state[p.isaId] ?? { lastIcn: Math.floor(Date.now() / 1000) % 100_000_000, history: [] };
  cur.lastIcn += 1;
  state[p.isaId] = cur;
  return cur.lastIcn;
}

/**
 * Upload with retries, like a real EDI sender: if the FTP node holding our
 * session dies (the load balancer then closes it), reconnect through the load
 * balancer and try again — the next connection lands on a healthy node.
 */
async function uploadWithRetry(opts: ProducerOptions, producer: Producer, fileName: string, content: string): Promise<number> {
  const attempts = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      await uploadAs(opts, producer, fileName, content);
      return attempt;
    } catch (e) {
      if (attempt >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function uploadAs(opts: ProducerOptions, producer: Producer, fileName: string, content: string) {
  const client = new Client(15_000);
  try {
    await client.access({ host: opts.ftp.host, port: opts.ftp.port, user: producer.ftpUser, password: opts.ftp.password, secure: false });
    // Upload as .tmp and rename: the distributor never picks up a half-written file.
    const tmp = `/to_distributor/${fileName}.tmp`;
    await client.uploadFrom(Readable.from(Buffer.from(content, 'utf8')), tmp);
    await client.rename(tmp, `/to_distributor/${fileName}`);
  } finally {
    client.close();
  }
}

export type Job = { producer: Producer; type: SupportedType; scenario?: Scenario };

export function forcedScenario(opts: Pick<ProducerOptions, 'scenario'>): Scenario | undefined {
  const forced = opts.scenario ? SCENARIOS.find((s) => s.id === opts.scenario) : undefined;
  if (opts.scenario && !forced) throw new Error(`Unknown scenario "${opts.scenario}". Run "npm run sim:scenarios" to list them.`);
  return forced;
}

/** One transaction for `producer`: weighted type, and an injected error with probability badRatio (or the forced scenario). */
export function planJob(opts: Pick<ProducerOptions, 'types' | 'badRatio'>, producer: Producer, forced?: Scenario): Job {
  let type = weighted(Object.fromEntries(opts.types.map((t) => [t, TYPE_WEIGHTS[t]])) as Partial<Record<SupportedType, number>>);
  let scenario: Scenario | undefined;
  if (forced) {
    scenario = forced;
    if (forced.types && !forced.types.includes(type)) type = forced.types[0] as SupportedType;
  } else if (chance(opts.badRatio)) {
    scenario = pick(scenariosFor(type));
  }
  return { producer, type, scenario };
}

export interface Delivery {
  fileName: string;
  controlNumber: string;
  ok: boolean;
  attempts: number;
  error?: string;
  ms: number;
}

/** Build the interchange, keep a local copy + manifest line, and upload it over FTP (with retries). */
export async function deliverJob(opts: ProducerOptions, state: State, job: Job): Promise<Delivery> {
  const started = Date.now();
  const icn = nextIcn(state, job.producer);
  const history = state[job.producer.isaId]!.history;
  const products = chooseProducts(productsOf(job.producer.code), job.type);
  const { x12, controlNumber } = buildInterchange({
    producer: job.producer, type: job.type, controlNumber: icn, products, scenario: job.scenario,
    previousControlNumber: history.at(-1), usage: opts.usage,
  });
  history.push(String(icn).padStart(9, '0'));
  if (history.length > 50) history.shift();
  const fileName = `${job.type}_${job.producer.isaId}_${controlNumber}${job.scenario ? `_${job.scenario.id}` : ''}.x12`;
  writeFileSync(join(opts.outDir, 'sent', fileName), x12);
  appendFileSync(join(opts.outDir, 'manifest.jsonl'), JSON.stringify({ at: new Date().toISOString(), fileName, producer: job.producer.isaId, type: job.type, icn: controlNumber, scenario: job.scenario?.id ?? null, expected: job.scenario?.expected ?? 'TA1 A / 997 A / ingested' }) + '\n');
  if (opts.dryRun) return { fileName, controlNumber, ok: true, attempts: 0, ms: Date.now() - started };
  try {
    const attempts = await uploadWithRetry(opts, job.producer, fileName, x12);
    return { fileName, controlNumber, ok: true, attempts, ms: Date.now() - started };
  } catch (e) {
    return { fileName, controlNumber, ok: false, attempts: 4, error: (e as Error).message, ms: Date.now() - started };
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runProducers(opts: ProducerOptions) {
  mkdirSync(join(opts.outDir, 'sent'), { recursive: true });
  const state = loadState(opts.outDir);
  const forced = forcedScenario(opts);

  const jobs: Job[] = [];
  if (opts.bootstrap) for (const p of opts.producers) jobs.push({ producer: p, type: '832' });
  for (let i = 0; i < opts.count; i++) jobs.push(planJob(opts, pick(opts.producers), forced));

  console.log(c.bold(`\n▶ Simulating ${jobs.length} X12 interchange(s) from ${opts.producers.length} producer(s)`) +
    c.dim(` → ${opts.dryRun ? `local folder ${opts.outDir}/sent (dry run)` : `ftp://${opts.ftp.host}:${opts.ftp.port}`}\n`));

  const rows: string[][] = [];
  let ok = 0;
  let failed = 0;
  for (const [i, job] of jobs.entries()) {
    const d = await deliverJob(opts, state, job);
    let result: string;
    if (opts.dryRun) result = c.dim('written');
    else if (!d.ok) result = c.red(`FTP error: ${d.error}`);
    else result = d.attempts > 1 ? c.yellow(`uploaded (attempt ${d.attempts})`) : c.green('uploaded');
    if (d.ok) ok++;
    else failed++;
    rows.push([
      String(i + 1), job.producer.isaId, job.type, d.controlNumber,
      job.scenario ? c.yellow(job.scenario.id) : c.green('valid'), job.scenario ? c.dim(job.scenario.expected) : c.dim('accepted'), result,
    ]);
    if (i < jobs.length - 1) {
      if (opts.delaySec !== undefined) await sleep(Math.random() * opts.delaySec * 1000);
      else if (opts.intervalMs) await sleep(opts.intervalMs);
    }
  }
  saveState(opts.outDir, state);
  console.log(table(['#', 'Producer', 'Type', 'ICN', 'Scenario', 'Expected', 'Result'], rows));
  const bad = jobs.filter((j) => j.scenario).length;
  console.log(`\n${c.bold('Summary')}: ${jobs.length} files (${jobs.length - bad} valid, ${bad} with injected errors) — ${ok} delivered, ${failed} failed`);
  console.log(c.dim(`Copies saved in ${join(opts.outDir, 'sent')}; manifest in ${join(opts.outDir, 'manifest.jsonl')}`));
  if (!opts.dryRun) console.log(c.dim('Watch them arrive: Distributor UI → EDI → Interchanges (http://localhost:3000)'));
  if (failed) process.exitCode = 1;
}

/** Download TA1 / 997 acknowledgments the distributor sent back to producers. */
export async function fetchAcks(opts: Pick<ProducerOptions, 'producers' | 'outDir' | 'ftp'>, remove: boolean) {
  const dir = join(opts.outDir, 'acks');
  mkdirSync(dir, { recursive: true });
  const rows: string[][] = [];
  for (const p of opts.producers) {
    const client = new Client(15_000);
    try {
      await client.access({ host: opts.ftp.host, port: opts.ftp.port, user: p.ftpUser, password: opts.ftp.password, secure: false });
      const files = (await client.list('/from_distributor')).filter((f) => f.isFile && !f.name.endsWith('.tmp'));
      for (const f of files) {
        await client.downloadTo(join(dir, f.name), `/from_distributor/${f.name}`);
        const body = readFileSync(join(dir, f.name), 'utf8');
        const summary = body.match(/TA1\*[^~]*/)?.[0] ?? (body.match(/AK9\*[^~]*/g) ?? []).join(' ') ?? '';
        rows.push([p.isaId, f.name, summary]);
        if (remove) await client.remove(`/from_distributor/${f.name}`);
      }
    } catch (e) {
      rows.push([p.isaId, c.red('error'), (e as Error).message]);
    } finally {
      client.close();
    }
  }
  console.log(table(['Producer', 'File', 'Acknowledgment'], rows));
  console.log(c.dim(`Saved to ${dir}`));
}

export function listScenarios() {
  console.log(table(['Scenario', 'Layer', 'Expected ack', 'Types', 'Description'], SCENARIOS.map((s) => [s.id, s.layer, s.expected, s.types?.join(',') ?? 'all', s.description])));
}

export function resolveProducers(arg: string | undefined): Producer[] {
  if (!arg) return PRODUCERS;
  if (/^\d+$/.test(arg)) return sample(PRODUCERS, Math.min(PRODUCERS.length, Number(arg)));
  const ids = arg.split(',').map((x) => x.trim().toUpperCase());
  const found = PRODUCERS.filter((p) => ids.includes(p.isaId) || ids.includes(p.code));
  if (!found.length) throw new Error(`No producers match "${arg}". Known: ${PRODUCERS.map((p) => p.isaId).join(', ')}`);
  return found;
}
