#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DISTRIBUTOR, PRODUCERS } from '@edi/shared';
import { analyzeInterchange, describeAckCode, inspectionReport } from '@edi/x12';
import { runCustomers } from './customers.js';
import { fetchAcks, listScenarios, resolveProducers, runProducers } from './producers.js';
import type { SupportedType } from './generators.js';
import { c } from './term.js';

const HELP = `
${c.bold('EDI simulator')} — Harvest Hub X12 playground

${c.bold('Usage')}
  npm run sim:producers -- [options]     send X12 files from producers over FTP
  npm run sim:customers -- [options]     simulate customers ordering in the order app
  npm run sim:inspect   -- <file.x12>    explain an X12 file segment by segment
  npx tsx apps/simulator/src/cli.ts acks [--remove]   download TA1/997 acks sent to producers
  npx tsx apps/simulator/src/cli.ts scenarios         list bad-data scenarios

${c.bold('producers options')}
  -n, --count <N>          number of transactions (default 20, env SIM_COUNT)
  -b, --bad-ratio <0..1>   share of transactions with injected errors (default 0.25)
  -t, --types <list>       832,846,856 (default all)
  -p, --producers <x>      number of random producers or ISA IDs list (default all 10)
  -i, --interval <ms>      pause between files (default 300)
      --bootstrap          first send a valid 832 catalog from every selected producer
  -s, --scenario <ID>      force one scenario for every transaction (see "scenarios")
      --usage <T|P>        ISA15 usage indicator (default T)
      --dry-run            only write files locally, no FTP
      --out <dir>          output folder (default ./simulator-output)

${c.bold('customers options')}
  -c, --customers <N>      customers to simulate (default 5, max 8 seeded)
  -o, --orders <N>         orders to place (default 15)
      --cancel-ratio <r>   share of orders cancelled (default 0.15)
      --pay-ratio <r>      share of bills paid immediately (default 0.3)
      --api <url>          order API (default http://localhost:4100, env ORDER_API_URL)

${c.bold('environment')}  FTP_HOST (localhost) FTP_PORT (21) FTP_PRODUCER_PASSWORD (producer123)
`;

const env = process.env;
const [command, ...rest] = process.argv.slice(2);

const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    count: { type: 'string', short: 'n' },
    'bad-ratio': { type: 'string', short: 'b' },
    types: { type: 'string', short: 't' },
    producers: { type: 'string', short: 'p' },
    interval: { type: 'string', short: 'i' },
    bootstrap: { type: 'boolean' },
    scenario: { type: 'string', short: 's' },
    usage: { type: 'string' },
    'dry-run': { type: 'boolean' },
    out: { type: 'string' },
    customers: { type: 'string', short: 'c' },
    orders: { type: 'string', short: 'o' },
    'cancel-ratio': { type: 'string' },
    'pay-ratio': { type: 'string' },
    api: { type: 'string' },
    remove: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

const num = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number(v));
const ftp = { host: env.FTP_HOST ?? 'localhost', port: Number(env.FTP_PORT ?? 21), password: env.FTP_PRODUCER_PASSWORD ?? 'producer123' };
// npm workspaces run scripts from apps/simulator; resolve paths against where the user typed the command.
const userCwd = env.INIT_CWD ?? process.cwd();
const outDir = resolve(userCwd, values.out ?? env.SIM_OUT_DIR ?? 'simulator-output');

async function main() {
  if (!command || values.help || command === 'help') {
    console.log(HELP);
    return;
  }
  switch (command) {
    case 'producers': {
      const types = (values.types ?? env.SIM_TYPES ?? '832,846,856').split(',').map((t) => t.trim()) as SupportedType[];
      const invalid = types.filter((t) => !['832', '846', '856'].includes(t));
      if (invalid.length) throw new Error(`Unsupported type(s): ${invalid.join(', ')}`);
      await runProducers({
        count: num(values.count ?? env.SIM_COUNT, 20),
        badRatio: num(values['bad-ratio'] ?? env.SIM_BAD_RATIO, 0.25),
        types,
        producers: resolveProducers(values.producers ?? env.SIM_PRODUCERS),
        intervalMs: num(values.interval ?? env.SIM_INTERVAL_MS, 300),
        bootstrap: values.bootstrap ?? env.SIM_BOOTSTRAP === 'true',
        scenario: values.scenario,
        outDir,
        dryRun: values['dry-run'] ?? false,
        usage: values.usage === 'P' ? 'P' : 'T',
        ftp,
      });
      break;
    }
    case 'customers':
      await runCustomers({
        api: values.api ?? env.ORDER_API_URL ?? 'http://localhost:4100',
        customers: num(values.customers ?? env.SIM_CUSTOMERS, 5),
        orders: num(values.orders ?? env.SIM_ORDERS, 15),
        cancelRatio: num(values['cancel-ratio'], 0.15),
        payRatio: num(values['pay-ratio'], 0.3),
        intervalMs: num(values.interval, 200),
        password: env.SEED_CUSTOMER_PASSWORD ?? 'password123',
      });
      break;
    case 'scenarios':
      listScenarios();
      break;
    case 'acks':
      await fetchAcks({ producers: resolveProducers(values.producers), outDir, ftp }, values.remove ?? false);
      break;
    case 'inspect': {
      const file = positionals[0];
      if (!file) throw new Error('usage: inspect <file.x12>');
      inspect(readFileSync(resolve(userCwd, file), 'utf8'));
      break;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}

/** Print an X12 file the way you'd read it with an implementation guide next to you. */
function inspect(raw: string) {
  const result = analyzeInterchange(raw, { receiverIds: [DISTRIBUTOR.isaId, ...PRODUCERS.map((p) => p.isaId)] });
  const report = inspectionReport(result);
  const color = { interchange: c.magenta, group: c.yellow, transaction: c.cyan, detail: (s: string) => s };
  if (result.delimiters) {
    console.log(c.bold('\nDelimiters') + c.dim(` (detected from the fixed-length ISA)`));
    console.log(`  element "${result.delimiters.element}"   component "${result.delimiters.component}"   segment "${result.delimiters.segment}"\n`);
  }
  for (const s of report.segments) {
    const paint = color[s.layer];
    console.log(`${c.dim(String(s.position).padStart(3))} ${paint(c.bold(s.id.padEnd(4)))} ${paint(s.raw)}  ${c.dim(s.name ?? '')}`);
    for (const e of s.elements) {
      if (e.value.trim() === '') continue;
      console.log(`      ${c.dim(e.position.padEnd(6))} ${(e.name ?? '').padEnd(42)} ${c.bold(JSON.stringify(e.value))}${e.codeDescription ? c.dim(` = ${e.codeDescription}`) : ''}`);
    }
    for (const i of s.issues) console.log(`      ${c.red('✖')} ${c.red(i.message)} ${c.dim(`[${i.x12CodeSource} ${i.x12Code ?? ''} ${describeAckCode(i.x12CodeSource, i.x12Code) ?? ''}]`)}`);
  }
  const loose = result.issues.filter((i) => !i.segmentPosition);
  for (const i of loose) console.log(`${c.red('✖')} ${i.message} ${c.dim(`[${i.x12CodeSource} ${i.x12Code}]`)}`);
  console.log(`\n${report.ok ? c.green('✔') : c.red('✖')} ${c.bold(report.summary)}`);
}

main().catch((e) => {
  console.error(c.red(`✖ ${(e as Error).message}`));
  process.exit(1);
});
