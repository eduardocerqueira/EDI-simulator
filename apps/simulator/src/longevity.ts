import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Producer } from './shared.js';
import { deliverJob, forcedScenario, loadState, planJob, saveState, sleep, type ProducerOptions } from './producers.js';
import { rand, sample } from './random.js';
import { c, table } from './term.js';

/**
 * Longevity / soak test for the FTP platform and the ingestion pipeline.
 *
 * Instead of one sender firing files back to back, every *active* producer is
 * an independent sender with its own FTP sessions, waiting a random 0..D
 * seconds between files. The number of active producers follows a random walk
 * between the ramp bounds (ramping up and down), so the traffic oscillates the
 * way real trading partners do.
 *
 * With both --runs and --duration, the per-producer delay is adapted on the fly
 * so the run delivers about `runs` files in `duration` minutes, while the total
 * rate still rises and falls with the number of active producers.
 */
export interface LongevityOptions extends ProducerOptions {
  /** total files to send (optional when a duration is given) */
  runs?: number;
  /** minutes; hard stop (optional when runs is given) */
  durationMin?: number;
  /** active producers oscillate between these bounds */
  ramp: [number, number];
  /** cap for the random delay between two files of the same producer, in seconds */
  delaySec?: number;
  /** print one line per file */
  verbose: boolean;
}

const DEFAULT_DELAY_SEC = 10;
const STATUS_EVERY_MS = 10_000;
const SPARK = '▁▂▃▄▅▆▇█';

function spark(values: number[], max = Math.max(1, ...values)): string {
  return values.map((v) => (v <= 0 ? ' ' : SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))])).join('');
}

/** Down-sample a series to at most `width` points by averaging buckets. */
function squeeze(values: number[], width: number): number[] {
  if (values.length <= width) return values;
  const out: number[] = [];
  const size = values.length / width;
  for (let i = 0; i < width; i++) {
    const slice = values.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    out.push(slice.reduce((s, v) => s + v, 0) / Math.max(1, slice.length));
  }
  return out;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function parseRamp(arg: string | undefined, poolSize: number): [number, number] {
  if (!arg) return [poolSize, poolSize];
  const m = /^\s*(\d+)\s*[,:-]\s*(\d+)\s*$/.exec(arg) ?? /^\s*(\d+)\s*$/.exec(arg);
  if (!m) throw new Error(`--ramp expects "min,max" (e.g. 0,10), got "${arg}"`);
  const lo = Number(m[1]);
  const hi = Number(m[2] ?? m[1]);
  const min = Math.max(0, Math.min(lo, hi));
  const max = Math.min(poolSize, Math.max(lo, hi));
  if (max < 1) throw new Error('--ramp needs a maximum of at least 1 producer');
  return [Math.min(min, max), max];
}

interface Sender {
  producer: Producer;
  stopped: boolean;
  wake?: () => void;
  done: Promise<void>;
}

export async function runLongevity(opts: LongevityOptions) {
  if (!opts.runs && !opts.durationMin) throw new Error('Longevity mode needs --runs and/or --duration');
  mkdirSync(join(opts.outDir, 'sent'), { recursive: true });
  const state = loadState(opts.outDir);
  const forced = forcedScenario(opts);
  const pool = opts.producers;
  const [rampMin, rampMax] = opts.ramp;
  const runs = opts.runs ?? Infinity;
  const durationMs = opts.durationMin ? opts.durationMin * 60_000 : Infinity;
  const adaptive = Number.isFinite(runs) && Number.isFinite(durationMs);
  const delayCap = opts.delaySec ?? (adaptive ? undefined : DEFAULT_DELAY_SEC);
  const expectedActive = Math.max(1, (rampMin + rampMax) / 2);
  const stepMs = Number.isFinite(durationMs) ? Math.min(60_000, Math.max(5_000, durationMs / 40)) : 15_000;

  // ---- plan summary --------------------------------------------------------
  const target = adaptive ? `${runs} files in ${opts.durationMin} min (~${((runs / durationMs) * 60_000).toFixed(0)} files/min on average)` : Number.isFinite(runs) ? `${runs} files` : `${opts.durationMin} min`;
  console.log(c.bold(`\n▶ Longevity run: ${target}`) + c.dim(` → ${opts.dryRun ? `local folder ${opts.outDir}/sent (dry run)` : `ftp://${opts.ftp.host}:${opts.ftp.port}`}`));
  console.log(
    c.dim(
      `  producers ramp ${rampMin}..${rampMax} of ${pool.length} (changes every ~${Math.round(stepMs / 1000)}s) · ` +
        `delay between files ${delayCap !== undefined ? `random 0..${delayCap}s` : 'random, adapted to the target'}${adaptive && delayCap !== undefined ? ' (adapted, capped)' : ''} · ` +
        `bad ratio ${forced ? `forced ${forced.id}` : opts.badRatio} · types ${opts.types.join(',')}`,
    ),
  );
  if (adaptive && delayCap !== undefined) {
    // average producer sends one file every (cap/2 + upload) seconds at most
    const maxRate = expectedActive / (delayCap / 2 + 0.2);
    const reachable = Math.floor((maxRate * durationMs) / 1000);
    if (reachable < runs * 0.9) {
      console.log(c.yellow(`  ⚠ with --delay ${delayCap}s about ${reachable} files fit in ${opts.durationMin} min; lower --delay or raise --duration to reach ${runs}.`));
    }
  }
  console.log(c.dim('  Ctrl+C stops gracefully and prints the summary.\n'));

  // ---- shared counters -----------------------------------------------------
  const started = Date.now();
  const deadline = started + durationMs;
  let scheduled = 0;
  let delivered = 0;
  let failed = 0;
  let retried = 0;
  let bad = 0;
  let uploadEmaSec = 0.2;
  let interrupted = false;
  const perBucket: number[] = []; // files delivered per status bucket
  const activeSeries: number[] = []; // active producers, sampled every second
  let peakActive = 0;
  let bucketFiles = 0;

  const finished = () => interrupted || scheduled >= runs || Date.now() >= deadline;

  /** Random pause before the next file of one producer. */
  const nextDelayMs = () => {
    let max = delayCap ?? DEFAULT_DELAY_SEC;
    if (adaptive) {
      const remaining = runs - scheduled;
      const remSec = Math.max(1, (deadline - Date.now()) / 1000);
      const perProducerRate = remaining / remSec / expectedActive; // files/s for an average producer
      const meanGap = perProducerRate > 0 ? Math.max(0, 1 / perProducerRate - uploadEmaSec) : max;
      max = 2 * meanGap; // uniform 0..max has mean = meanGap
      if (delayCap !== undefined) max = Math.min(max, delayCap);
    }
    return Math.random() * max * 1000;
  };

  // ---- senders -------------------------------------------------------------
  const senders = new Map<string, Sender>();
  const running = new Set<Promise<void>>(); // includes senders already ramped down but still uploading

  const startSender = (producer: Producer) => {
    const s: Sender = { producer, stopped: false, done: Promise.resolve() };
    s.done = (async () => {
      // stagger the first file so a ramp-up doesn't fire N uploads in the same millisecond
      await interruptibleSleep(s, Math.random() * 1500);
      while (!s.stopped && !finished()) {
        scheduled++;
        const job = planJob(opts, producer, forced);
        if (job.scenario) bad++;
        const d = await deliverJob(opts, state, job);
        uploadEmaSec = uploadEmaSec * 0.9 + (d.ms / 1000) * 0.1;
        if (d.ok) {
          delivered++;
          bucketFiles++;
          if (d.attempts > 1) retried++;
        } else failed++;
        if (opts.verbose || !d.ok || d.attempts > 1) {
          const result = !d.ok ? c.red(`FTP error: ${d.error}`) : d.attempts > 1 ? c.yellow(`uploaded (attempt ${d.attempts})`) : c.green(opts.dryRun ? 'written' : 'uploaded');
          console.log(
            `  ${c.dim(clock(Date.now() - started))} ${producer.isaId.padEnd(12)} ${job.type} ${d.controlNumber} ${job.scenario ? c.yellow(job.scenario.id) : c.green('valid')} ${result}`,
          );
        }
        if ((delivered + failed) % 25 === 0) saveState(opts.outDir, state);
        await interruptibleSleep(s, nextDelayMs());
      }
    })();
    running.add(s.done);
    void s.done.finally(() => running.delete(s.done));
    senders.set(producer.isaId, s);
  };

  const stopSender = (s: Sender) => {
    s.stopped = true;
    s.wake?.();
    senders.delete(s.producer.isaId);
  };

  function interruptibleSleep(s: Sender, ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        s.wake = undefined;
        resolve();
      }
      s.wake = done;
    });
  }

  /** Move the number of active producers to `n`, starting/stopping random ones. */
  const setActive = (n: number) => {
    const before = senders.size;
    const added: string[] = [];
    const removed: string[] = [];
    while (senders.size < n) {
      const idle = pool.filter((p) => !senders.has(p.isaId));
      const p = sample(idle, 1)[0]!;
      startSender(p);
      added.push(p.isaId);
    }
    while (senders.size > n) {
      const s = sample([...senders.values()], 1)[0]!;
      stopSender(s);
      removed.push(s.producer.isaId);
    }
    peakActive = Math.max(peakActive, n);
    if (before !== n) {
      const arrow = n > before ? c.green('↗') : c.yellow('↘');
      const who = [...added.map((x) => c.green(`+${x}`)), ...removed.map((x) => c.yellow(`-${x}`))].join(' ');
      console.log(`  ${c.dim(clock(Date.now() - started))} ${arrow} producers ${before} → ${c.bold(String(n))}  ${who}`);
    }
  };

  // ---- ramp: random walk with momentum between rampMin and rampMax ----------
  let current = Math.max(1, rampMin);
  let dir = 1;
  const nextLevel = () => {
    if (rampMin === rampMax) return rampMax;
    if (current <= rampMin) dir = 1;
    else if (current >= rampMax) dir = -1;
    else if (Math.random() < 0.25) dir = -dir; // change direction now and then
    if (Math.random() < 0.15) return current; // plateau
    const step = rand(1, Math.max(1, Math.round((rampMax - rampMin) / 4)));
    current = Math.min(rampMax, Math.max(rampMin, current + dir * step));
    // never sit at 0 producers for long when files are still due
    if (current === 0) dir = 1;
    return current;
  };

  const onSigint = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log(c.yellow('\n  ⏹ stopping: finishing in-flight uploads (Ctrl+C again to quit now)…'));
    for (const s of [...senders.values()]) s.wake?.();
  };
  process.on('SIGINT', onSigint);

  const status = () => {
    const elapsed = Date.now() - started;
    const rate = (delivered / Math.max(1, elapsed)) * 60_000;
    const progress = Number.isFinite(runs) ? `${delivered + failed}/${runs} (${Math.round(((delivered + failed) / runs) * 100)}%)` : String(delivered + failed);
    const time = Number.isFinite(durationMs) ? `${clock(elapsed)} / ${clock(durationMs)}` : clock(elapsed);
    perBucket.push(bucketFiles);
    bucketFiles = 0;
    console.log(
      `  ${c.cyan(time)}  producers ${c.bold(String(senders.size).padStart(2))} ${c.dim(spark(squeeze(activeSeries.slice(-60), 12), rampMax))}  ` +
        `sent ${c.bold(progress)}  ${rate.toFixed(0)}/min  ` +
        `${c.green(`ok ${delivered}`)}${failed ? ' ' + c.red(`failed ${failed}`) : ''}${retried ? ' ' + c.yellow(`retried ${retried}`) : ''}  ${c.dim(`bad ${bad}`)}`,
    );
  };

  // ---- optional bootstrap: one valid 832 catalog per producer first ---------
  if (opts.bootstrap) {
    console.log(c.dim(`  bootstrap: sending a valid 832 catalog from each of ${pool.length} producer(s)…`));
    for (const p of pool) {
      const d = await deliverJob(opts, state, { producer: p, type: '832' });
      if (!d.ok) console.log(c.red(`  bootstrap ${p.isaId}: ${d.error}`));
    }
  }

  // ---- main loop -----------------------------------------------------------
  setActive(current);
  let nextStep = Date.now() + stepMs;
  let nextStatus = Date.now() + STATUS_EVERY_MS;
  let nextSample = Date.now() + 1000;
  while (!finished()) {
    await sleep(250);
    const now = Date.now();
    if (now >= nextSample) {
      activeSeries.push(senders.size);
      nextSample += 1000;
    }
    if (now >= nextStep) {
      setActive(nextLevel());
      nextStep = now + stepMs * (0.6 + Math.random() * 0.8); // irregular steps
    }
    if (now >= nextStatus) {
      status();
      nextStatus = now + STATUS_EVERY_MS;
    }
  }
  status();
  for (const s of [...senders.values()]) stopSender(s);
  // in-flight uploads finish; sleeping senders were woken and exit
  await Promise.all([...running]);
  process.off('SIGINT', onSigint);
  saveState(opts.outDir, state);

  // ---- summary -------------------------------------------------------------
  const elapsed = Date.now() - started;
  const total = delivered + failed;
  const reason = interrupted ? 'interrupted' : scheduled >= runs ? 'all runs sent' : 'duration reached';
  console.log(`\n${c.bold('Summary')} ${c.dim(`(${reason})`)}`);
  console.log(
    table(
      ['Metric', 'Value'],
      [
        ['Duration', clock(elapsed)],
        ['Files', `${total}${Number.isFinite(runs) ? ` of ${runs}` : ''} (${total - bad} valid, ${bad} with injected errors)`],
        ['Delivered', c.green(String(delivered))],
        ['Failed', failed ? c.red(String(failed)) : '0'],
        ['Needed a retry', retried ? c.yellow(String(retried)) : '0'],
        ['Average rate', `${((delivered / Math.max(1, elapsed)) * 60_000).toFixed(1)} files/min`],
        ['Producers (ramp)', `${rampMin}..${rampMax}, peak ${peakActive}, average ${(activeSeries.reduce((a, b) => a + b, 0) / Math.max(1, activeSeries.length)).toFixed(1)}`],
      ],
    ),
  );
  console.log(`\n  ${c.dim('active producers')} ${spark(squeeze(activeSeries, 60), rampMax)}  ${c.dim(`(0..${rampMax}, 1 char ≈ ${Math.max(1, Math.round(activeSeries.length / 60))}s)`)}`);
  console.log(`  ${c.dim('files / 10s     ')} ${spark(squeeze(perBucket, 60))}  ${c.dim(`(peak ${Math.max(0, ...perBucket)})`)}`);
  console.log(c.dim(`\nCopies saved in ${join(opts.outDir, 'sent')}; manifest in ${join(opts.outDir, 'manifest.jsonl')}`));
  if (!opts.dryRun) console.log(c.dim('Watch it: Distributor UI → Platform (FTP Cluster → Metrics) and EDI → Interchanges (http://localhost:3000)'));
  if (failed) process.exitCode = 1;
}
