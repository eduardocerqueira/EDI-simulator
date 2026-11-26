import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { EXCHANGES, type PlatformEvent } from '@edi/shared';
import { config, pasvRange } from './config.js';
import { docker, type ContainerInspect, type ContainerSummary } from './docker.js';
import { bus } from './bus.js';
import { metrics } from './metrics.js';
import { probeFtp } from './probe.js';

export type NodeStatus = 'STARTING' | 'READY' | 'SUSPECT' | 'DOWN' | 'REPLACING' | 'MISSING';

export interface NodeState {
  slot: number;
  name: string; // ftp-node-N (network alias the load balancer resolves)
  status: NodeStatus;
  containerId?: string;
  containerName?: string;
  dockerState?: string;
  ip?: string;
  generation: number;
  startedAt?: string;
  readySince?: string;
  passivePorts: string;
  lastProbeAt?: string;
  lastProbeMs?: number;
  lastBanner?: string;
  lastError?: string;
  consecutiveFailures: number;
  firstFailureAt?: string;
  replacements: number;
  lastRecoverySeconds?: number;
}

export type ClusterEventType =
  | 'NODE_READY' | 'PROBE_FAILED' | 'NODE_DOWN' | 'NODE_REPLACING' | 'NODE_REMOVED' | 'NODE_SPAWNED' | 'NODE_RECOVERED'
  | 'CHAOS_INJECTED' | 'ALERT_FIRING' | 'ALERT_RESOLVED' | 'CONTROLLER_STARTED' | 'REPLACE_FAILED';

export interface ClusterEvent {
  id: string;
  at: string;
  type: ClusterEventType;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  slot?: number;
  node?: string;
  message: string;
  details?: Record<string, unknown>;
}

const LABEL_ROLE = 'edi.platform.role=ftp-node';
const nodes = new Map<number, NodeState>();
const events: ClusterEvent[] = [];
const busy = new Set<number>();
const chaosAt = new Map<number, number>();
let project: string | undefined;
let lastReconcileAt: string | undefined;

const nodeName = (slot: number) => `ftp-node-${slot}`;

export function recordEvent(e: Omit<ClusterEvent, 'id' | 'at'>, publish?: { routingKey: string; title: string; extra?: Partial<PlatformEvent> }) {
  const event: ClusterEvent = { id: randomUUID(), at: new Date().toISOString(), ...e };
  events.unshift(event);
  if (events.length > 300) events.length = 300;
  console.log(`${event.at} [${e.type}] ${e.node ?? ''} ${e.message}`);
  if (publish) {
    const msg: PlatformEvent = {
      eventId: event.id, occurredAt: event.at, routingKey: publish.routingKey, severity: e.severity, title: publish.title,
      message: e.message, node: e.node, slot: e.slot, ...publish.extra,
    };
    void bus.publish(EXCHANGES.platform, publish.routingKey, msg);
  }
}

/** Find the compose project this controller belongs to (so e2e/demo stacks don't touch each other). */
async function resolveProject(): Promise<string | undefined> {
  if (process.env.COMPOSE_PROJECT) return process.env.COMPOSE_PROJECT;
  try {
    const self = await docker.inspect(hostname());
    return self.Config.Labels['com.docker.compose.project'];
  } catch {
    return undefined;
  }
}

async function listNodeContainers(): Promise<ContainerSummary[]> {
  const labels = [LABEL_ROLE];
  if (project) labels.push(`com.docker.compose.project=${project}`);
  const all = await docker.list(labels);
  // `docker compose up` renames the old container to "<id>_<name>" while it recreates it: not ours to heal
  return all.filter((c) => !/^\/?[0-9a-f]{12}_/.test(c.Names[0] ?? ''));
}

function stateFor(slot: number): NodeState {
  let s = nodes.get(slot);
  if (!s) {
    const r = pasvRange(slot);
    s = { slot, name: nodeName(slot), status: 'STARTING', generation: 1, passivePorts: `${r.min}-${r.max}`, consecutiveFailures: 0, replacements: 0 };
    nodes.set(slot, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Reconcile loop
// ---------------------------------------------------------------------------

export async function initCluster() {
  project = await resolveProject();
  for (const slot of config.slots) stateFor(slot);
  recordEvent({ type: 'CONTROLLER_STARTED', severity: 'INFO', message: `Platform controller watching ${config.slots.length} FTP node slot(s)${project ? ` in project "${project}"` : ''}` });
}

export async function reconcile() {
  let containers: ContainerSummary[];
  try {
    containers = await listNodeContainers();
  } catch (e) {
    console.warn('[reconcile] docker unavailable:', (e as Error).message);
    return;
  }
  lastReconcileAt = new Date().toISOString();
  await Promise.all(config.slots.map((slot) => reconcileSlot(slot, containers.filter((c) => Number(c.Labels['edi.platform.slot']) === slot))));
  updateMetrics();
}

async function reconcileSlot(slot: number, containers: ContainerSummary[]) {
  if (busy.has(slot)) return;
  const s = stateFor(slot);
  // newest container wins if there are leftovers
  const c = containers.sort((a, b) => b.Created - a.Created)[0];

  if (!c) {
    if (s.status !== 'MISSING') {
      s.status = 'MISSING';
      s.containerId = undefined;
      recordEvent({ type: 'NODE_DOWN', severity: 'ERROR', slot, node: s.name, message: `${s.name} has no container` },
        { routingKey: 'platform.node.down', title: `FTP node ${s.name} missing` });
    }
    if (config.autoHeal) await replace(slot, 'container missing');
    return;
  }

  if (c.Id !== s.containerId || !s.ip || !s.startedAt || s.startedAt.startsWith('0001')) {
    const info = await docker.inspect(c.Id).catch(() => undefined);
    s.containerId = c.Id;
    s.containerName = c.Names[0]?.replace(/^\//, '');
    s.generation = Number(c.Labels['edi.platform.generation'] ?? s.generation ?? 1);
    s.startedAt = info?.State.StartedAt;
    s.ip = info ? Object.values(info.NetworkSettings.Networks)[0]?.IPAddress : undefined;
  }
  s.dockerState = c.State;

  if (['exited', 'dead', 'created'].includes(c.State) && Date.now() - c.Created * 1000 > 5000) {
    // a stopped container may just be docker compose recreating it: confirm over a few checks
    s.consecutiveFailures++;
    s.lastError = `container is ${c.State}`;
    if (s.consecutiveFailures === 1) {
      s.firstFailureAt = new Date().toISOString();
      s.status = 'SUSPECT';
      recordEvent({ type: 'PROBE_FAILED', severity: 'WARNING', slot, node: s.name, message: `${s.name} container is ${c.State}` });
    }
    if (s.consecutiveFailures >= Math.max(2, config.failureThreshold - 1)) return markDown(s, `container is ${c.State}`);
    return;
  }

  const r = await probeFtp(s.name, 21, config.probeTimeoutMs);
  s.lastProbeAt = new Date().toISOString();
  s.lastProbeMs = r.ms;
  metrics.probeDuration.set({ slot: String(slot) }, r.ms / 1000);

  if (r.ok) {
    s.lastBanner = r.banner;
    s.lastError = undefined;
    if (s.status !== 'READY') {
      const recovering = s.firstFailureAt || chaosAt.has(slot) || s.status === 'STARTING' && s.replacements > 0;
      const since = chaosAt.get(slot) ?? (s.firstFailureAt ? Date.parse(s.firstFailureAt) : undefined);
      s.status = 'READY';
      s.readySince = s.lastProbeAt;
      if (recovering && since) {
        const secs = Math.round((Date.now() - since) / 100) / 10;
        s.lastRecoverySeconds = secs;
        metrics.recoverySeconds.set({ slot: String(slot) }, secs);
        recordEvent({ type: 'NODE_RECOVERED', severity: 'INFO', slot, node: s.name, message: `${s.name} is back in service (generation ${s.generation}) — recovered in ${secs}s`, details: { container: s.containerName, recoverySeconds: secs } },
          { routingKey: 'platform.node.ready', title: `FTP node ${s.name} recovered`, extra: { container: s.containerName, generation: s.generation, recoverySeconds: secs } });
      } else {
        recordEvent({ type: 'NODE_READY', severity: 'INFO', slot, node: s.name, message: `${s.name} answers "${r.banner}" (${r.ms}ms)` });
      }
      chaosAt.delete(slot);
    }
    s.consecutiveFailures = 0;
    s.firstFailureAt = undefined;
    return;
  }

  // probe failed
  s.lastError = r.error;
  const fresh = s.startedAt && Date.now() - Date.parse(s.startedAt) < config.startupGraceMs && s.status === 'STARTING';
  if (fresh) return; // still booting
  s.consecutiveFailures++;
  if (s.consecutiveFailures === 1) {
    s.firstFailureAt = s.lastProbeAt;
    s.status = 'SUSPECT';
    recordEvent({ type: 'PROBE_FAILED', severity: 'WARNING', slot, node: s.name, message: `${s.name} probe failed: ${r.error}` });
  }
  if (s.consecutiveFailures >= config.failureThreshold) {
    await markDown(s, `${s.consecutiveFailures} consecutive probes failed (${r.error})${c.State === 'paused' ? ' — container is frozen' : ''}`);
  }
}

async function markDown(s: NodeState, reason: string) {
  if (s.status !== 'DOWN' && s.status !== 'REPLACING') {
    s.status = 'DOWN';
    s.firstFailureAt ??= new Date().toISOString();
    recordEvent({ type: 'NODE_DOWN', severity: 'ERROR', slot: s.slot, node: s.name, message: `${s.name} is DOWN: ${reason}`, details: { container: s.containerName } },
      { routingKey: 'platform.node.down', title: `FTP node ${s.name} down`, extra: { container: s.containerName, generation: s.generation } });
  }
  if (config.autoHeal) await replace(s.slot, reason);
}

// ---------------------------------------------------------------------------
// Self-healing: replace a node with a brand-new container
// ---------------------------------------------------------------------------

function buildCreateBody(tpl: ContainerInspect, slot: number, generation: number, replaces?: string) {
  const range = pasvRange(slot);
  const name = nodeName(slot);
  const env = tpl.Config.Env.filter((e) => !/^(FTP_PASV_MIN_PORT|FTP_PASV_MAX_PORT|FTP_NODE_NAME)=/.test(e));
  env.push(`FTP_PASV_MIN_PORT=${range.min}`, `FTP_PASV_MAX_PORT=${range.max}`, `FTP_NODE_NAME=${name}`);
  const labels: Record<string, string> = {
    ...tpl.Config.Labels,
    'edi.platform.slot': String(slot),
    'edi.platform.generation': String(generation),
    'edi.platform.spawned-by': 'platform-controller',
    'edi.platform.spawned-at': new Date().toISOString(),
    'com.docker.compose.service': name,
  };
  if (replaces) labels['edi.platform.replaces'] = replaces;
  const network = Object.keys(tpl.NetworkSettings.Networks)[0]!;
  return {
    network,
    body: {
      Image: tpl.Config.Image,
      Env: env,
      Labels: labels,
      Cmd: tpl.Config.Cmd,
      Entrypoint: tpl.Config.Entrypoint,
      ExposedPorts: tpl.Config.ExposedPorts,
      Healthcheck: tpl.Config.Healthcheck,
      WorkingDir: tpl.Config.WorkingDir,
      HostConfig: {
        Mounts: tpl.HostConfig.Mounts,
        Binds: tpl.HostConfig.Binds,
        NetworkMode: network,
        RestartPolicy: tpl.HostConfig.RestartPolicy,
        Init: tpl.HostConfig.Init,
        LogConfig: tpl.HostConfig.LogConfig,
      },
      NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: [name] } } },
    },
  };
}

export async function replace(slot: number, reason: string) {
  if (busy.has(slot)) return;
  busy.add(slot);
  const s = stateFor(slot);
  const started = Date.now();
  try {
    s.status = 'REPLACING';
    recordEvent({ type: 'NODE_REPLACING', severity: 'WARNING', slot, node: s.name, message: `Replacing ${s.name}: ${reason}` },
      { routingKey: 'platform.node.replacing', title: `Replacing FTP node ${s.name}` });

    const all = await listNodeContainers();
    const old = all.find((c) => Number(c.Labels['edi.platform.slot']) === slot);
    const templateId = old?.Id ?? all.find((c) => c.State === 'running')?.Id;
    if (!templateId) throw new Error('no container available to use as a template');
    const tpl = await docker.inspect(templateId);
    const containerName = old ? tpl.Name.replace(/^\//, '') : `${project ?? 'edi'}-ftp-node-${slot}-1`;
    const generation = Number(old?.Labels['edi.platform.generation'] ?? s.generation ?? 1) + 1;

    if (old) {
      if (old.State === 'paused') await docker.unpause(old.Id).catch(() => undefined);
      await docker.remove(old.Id);
      recordEvent({ type: 'NODE_REMOVED', severity: 'INFO', slot, node: s.name, message: `Removed unhealthy container ${containerName} (${old.Id.slice(0, 12)})` });
    }

    const { body } = buildCreateBody(tpl, slot, generation, old?.Id);
    const created = await docker.create(containerName, body);
    await docker.start(created.Id);
    const info = await docker.inspect(created.Id);
    Object.assign(s, {
      status: 'STARTING' as NodeStatus,
      containerId: created.Id,
      containerName,
      generation,
      startedAt: info.State.StartedAt,
      ip: Object.values(info.NetworkSettings.Networks)[0]?.IPAddress,
      consecutiveFailures: 0,
      replacements: s.replacements + 1,
    });
    metrics.replacements.inc({ slot: String(slot) });
    recordEvent({
      type: 'NODE_SPAWNED', severity: 'INFO', slot, node: s.name,
      message: `Spawned ${containerName} (${created.Id.slice(0, 12)}, generation ${generation}) on the shared storage volume in ${Date.now() - started}ms — waiting for FTP greeting`,
      details: { container: containerName, ip: s.ip, generation },
    });
  } catch (e) {
    s.status = 'DOWN';
    recordEvent({ type: 'REPLACE_FAILED', severity: 'ERROR', slot, node: s.name, message: `Could not replace ${s.name}: ${(e as Error).message}` },
      { routingKey: 'platform.node.down', title: `FTP node ${s.name} replacement failed` });
  } finally {
    busy.delete(slot);
  }
}

// ---------------------------------------------------------------------------
// Chaos: make a node fail on purpose
// ---------------------------------------------------------------------------

export async function injectChaos(slot: number | undefined, mode: 'pause' | 'kill') {
  const candidates = [...nodes.values()].filter((n) => n.status === 'READY' && n.containerId);
  const target = slot ? nodes.get(slot) : candidates[Math.floor(Math.random() * candidates.length)];
  if (!target?.containerId) throw new Error(slot ? `node slot ${slot} has no running container` : 'no READY node to break');
  if (mode === 'pause') await docker.pause(target.containerId);
  else await docker.kill(target.containerId);
  chaosAt.set(target.slot, Date.now());
  recordEvent({
    type: 'CHAOS_INJECTED', severity: 'WARNING', slot: target.slot, node: target.name,
    message: mode === 'pause' ? `Chaos: froze ${target.name} (docker pause) — it accepts TCP but never answers` : `Chaos: killed ${target.name} (docker kill)`,
  }, { routingKey: 'platform.chaos.injected', title: `Chaos injected on ${target.name}`, extra: { container: target.containerName } });
  return { slot: target.slot, node: target.name, container: target.containerName, mode };
}

// ---------------------------------------------------------------------------

function updateMetrics() {
  let ready = 0;
  for (const s of nodes.values()) {
    const up = s.status === 'READY' ? 1 : 0;
    ready += up;
    metrics.nodeUp.set({ slot: String(s.slot), node: s.name }, up);
    metrics.nodeGeneration.set({ slot: String(s.slot), node: s.name }, s.generation);
  }
  metrics.readyNodes.set(ready);
  metrics.desiredNodes.set(config.slots.length);
}

export function clusterState() {
  const list = [...nodes.values()].sort((a, b) => a.slot - b.slot);
  return {
    project,
    desiredNodes: config.slots.length,
    readyNodes: list.filter((n) => n.status === 'READY').length,
    autoHeal: config.autoHeal,
    probe: { intervalMs: config.probeIntervalMs, timeoutMs: config.probeTimeoutMs, failureThreshold: config.failureThreshold },
    lastReconcileAt,
    nodes: list,
    events: events.slice(0, 100),
  };
}
