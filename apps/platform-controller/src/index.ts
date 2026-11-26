import Fastify from 'fastify';
import { alertState, pollAlerts } from './alerts.js';
import { bus } from './bus.js';
import { clusterState, initCluster, injectChaos, queryEvents, reconcile, type EventQuery } from './cluster.js';
import { config } from './config.js';
import { docker } from './docker.js';
import { registry } from './metrics.js';
import { scanStorage, storageSnapshot } from './storage.js';

/**
 * Platform controller — keeps the FTP cluster at its desired size.
 *
 *   probe every node (FTP "220" greeting) → N failures → DOWN
 *     → remove container → spawn a new one in the same slot
 *       (same image, shared storage volume, network alias the LB resolves)
 *     → wait for the greeting → READY (recovery time measured)
 *
 * Also: storage scan of the shared volume, Prometheus metrics on /metrics,
 * Prometheus alert → RabbitMQ platform events, chaos injection API.
 */
function loop(name: string, everyMs: number, fn: () => Promise<unknown>) {
  const tick = async () => {
    try {
      await fn();
    } catch (e) {
      console.warn(`[${name}]`, (e as Error).message);
    } finally {
      setTimeout(tick, everyMs);
    }
  };
  setTimeout(tick, 500);
}

async function main() {
  await docker.ping().catch((e) => console.warn(`[docker] not reachable at ${config.dockerSocket}: ${e.message}`));
  await bus.start();
  await initCluster();

  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok', rabbitmq: bus.connected }));
  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', registry.contentType);
    return registry.metrics();
  });
  app.get('/api/state', async () => ({ ...clusterState(), storage: storageSnapshot(), prometheus: alertState() }));
  app.get('/api/storage', async () => storageSnapshot());
  app.get('/api/events', async (req) => queryEvents(req.query as EventQuery));
  app.post('/api/chaos', async (req, reply) => {
    const { slot, mode } = (req.body ?? {}) as { slot?: number; mode?: 'pause' | 'kill' };
    try {
      return await injectChaos(slot ? Number(slot) : undefined, mode === 'kill' ? 'kill' : 'pause');
    } catch (e) {
      return reply.code(409).send({ error: (e as Error).message });
    }
  });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[platform-controller] listening on :${config.port} — slots ${config.slots.join(',')}, auto-heal ${config.autoHeal}`);

  loop('reconcile', config.probeIntervalMs, reconcile);
  loop('storage', config.storageScanMs, scanStorage);
  loop('alerts', config.alertPollMs, pollAlerts);
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
