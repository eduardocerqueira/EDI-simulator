import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { q } from '../http.js';

/**
 * Platform area: health and monitoring of the HA FTP cluster.
 * Sources: the platform controller (nodes, events, storage), Prometheus
 * (load balancer metrics, alerts, scrape targets) and our own database
 * (traffic per trading partner).
 */
async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type PromVector = { metric: Record<string, string>; value: [number, string] }[];
type PromMatrix = { metric: Record<string, string>; values: [number, string][] }[];

async function promQuery(query: string): Promise<PromVector | null> {
  const r = await getJson<{ data: { result: PromVector } }>(`${config.platform.prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
  return r?.data.result ?? null;
}

async function promRange(query: string, start: number, end: number, step: number): Promise<PromMatrix> {
  const r = await getJson<{ data: { result: PromMatrix } }>(
    `${config.platform.prometheusUrl}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`,
  );
  return r?.data.result ?? [];
}

const slotOf = (server: string) => Number(server.replace(/\D/g, '')) || undefined;
const byServer = (v: PromVector | null) => new Map((v ?? []).map((r) => [r.metric.server ?? r.metric.node ?? '', Number(r.value[1])]));

/** Align several Prometheus series into chart rows: [{ t, <key>: value }]. */
function align(series: Array<{ key: string; values: [number, string][] }>, start: number, end: number, step: number) {
  const rows: Array<Record<string, number>> = [];
  for (let t = start; t <= end; t += step) rows.push({ t: t * 1000 });
  const index = new Map(rows.map((r, i) => [r.t, i]));
  for (const s of series) {
    for (const [ts, v] of s.values) {
      const i = index.get(Math.round(ts) * 1000);
      if (i !== undefined) rows[i]![s.key] = Number(v);
    }
  }
  return rows;
}

export async function platformRoutes(app: FastifyInstance) {
  app.get('/platform/overview', async () => {
    const [controller, alerts, targets, up, ctrlSessions, dataSessions, bytesIn, bytesOut, throughput] = await Promise.all([
      getJson<Record<string, unknown> & { nodes?: Array<Record<string, unknown>>; storage?: unknown; events?: unknown[] }>(`${config.platform.controllerUrl}/api/state`),
      getJson<{ data: { alerts: Array<{ labels: Record<string, string>; annotations: Record<string, string>; state: string; activeAt: string; value: string }> } }>(`${config.platform.prometheusUrl}/api/v1/alerts`),
      getJson<{ data: { activeTargets: Array<{ labels: Record<string, string>; health: string; lastScrape: string; lastError: string; scrapeUrl: string }> } }>(`${config.platform.prometheusUrl}/api/v1/targets?state=active`),
      promQuery('haproxy_server_status{proxy="ftp_control",state="UP"}'),
      promQuery('sum by (server) (haproxy_server_current_sessions{proxy="ftp_control"})'),
      promQuery('sum by (server) (haproxy_server_current_sessions{proxy=~"pasv_.*"})'),
      promQuery('sum by (server) (haproxy_server_bytes_in_total)'),
      promQuery('sum by (server) (haproxy_server_bytes_out_total)'),
      promQuery('sum by (server) (rate(haproxy_server_bytes_in_total[1m]) + rate(haproxy_server_bytes_out_total[1m]))'),
    ]);
    const upM = byServer(up), cs = byServer(ctrlSessions), ds = byServer(dataSessions), bi = byServer(bytesIn), bo = byServer(bytesOut), tp = byServer(throughput);
    const servers = [...new Set([...upM.keys(), ...bi.keys()])].filter(Boolean).sort();
    const loadBalancer = {
      reachable: up !== null,
      statsUrl: 'http://localhost:8404',
      servers: servers.map((server) => ({
        server,
        slot: slotOf(server),
        up: upM.get(server) === 1,
        controlSessions: cs.get(server) ?? 0,
        dataSessions: ds.get(server) ?? 0,
        bytesIn: bi.get(server) ?? 0,
        bytesOut: bo.get(server) ?? 0,
        throughputBps: tp.get(server) ?? 0,
      })),
    };

    // Traffic per trading partner over the last 24h (from the distributor's transfer log)
    const since = new Date(Date.now() - 24 * 3600_000);
    const [partners, traffic] = await Promise.all([
      prisma.tradingPartner.findMany({ select: { id: true, name: true, isaId: true, ftpUser: true }, orderBy: { code: 'asc' } }),
      prisma.fileTransfer.groupBy({ by: ['partnerId', 'direction'], where: { discoveredAt: { gte: since } }, _count: { _all: true }, _sum: { sizeBytes: true } }),
    ]);
    const partnerTraffic = partners.map((p) => {
      const t = (dir: string) => traffic.find((x) => x.partnerId === p.id && x.direction === dir);
      return {
        ...p,
        inboundFiles24h: t('INBOUND')?._count._all ?? 0,
        inboundBytes24h: t('INBOUND')?._sum.sizeBytes ?? 0,
        outboundFiles24h: t('OUTBOUND')?._count._all ?? 0,
        outboundBytes24h: t('OUTBOUND')?._sum.sizeBytes ?? 0,
      };
    });

    const notifications = await prisma.notification.findMany({ where: { type: { startsWith: 'platform.' } }, orderBy: { createdAt: 'desc' }, take: 15 });
    const unread = await prisma.notification.count({ where: { type: { startsWith: 'platform.' }, read: false } });

    return {
      controller: controller ? { reachable: true, ...controller } : { reachable: false },
      loadBalancer,
      prometheus: {
        reachable: alerts !== null,
        url: 'http://localhost:9090',
        alerts: (alerts?.data.alerts ?? []).map((a) => ({ name: a.labels.alertname, severity: a.labels.severity, state: a.state, since: a.activeAt, summary: a.annotations.summary, labels: a.labels })),
        targets: (targets?.data.activeTargets ?? []).map((t) => ({ job: t.labels.job, instance: t.labels.instance, health: t.health, lastScrape: t.lastScrape, lastError: t.lastError })),
      },
      partnerTraffic,
      notifications: { unread, items: notifications },
    };
  });

  /** Recovery timeline: filtered, paginated controller events (node, type, severity, q, page, pageSize). */
  app.get('/platform/events', async (req, reply) => {
    const f = q(req);
    const params = new URLSearchParams();
    for (const k of ['node', 'type', 'severity', 'q', 'page', 'pageSize']) if (f[k]) params.set(k, f[k]!);
    const r = await getJson<Record<string, unknown>>(`${config.platform.controllerUrl}/api/events?${params}`);
    if (!r) return reply.code(503).send({ error: 'Platform controller unreachable' });
    return r;
  });

  app.get('/platform/timeseries', async (req) => {
    const minutes = Math.min(360, Math.max(5, Number(q(req).minutes ?? 15) || 15));
    const end = Math.floor(Date.now() / 1000);
    const start = end - minutes * 60;
    const step = Math.max(5, Math.round((minutes * 60) / 180 / 5) * 5);
    const [ready, desired, nodeUp, traffic, sessions, probe, storage] = await Promise.all([
      promRange('ftp_cluster_ready_nodes', start, end, step),
      promRange('ftp_cluster_desired_nodes', start, end, step),
      promRange('ftp_node_up', start, end, step),
      promRange('sum by (server) (rate(haproxy_server_bytes_in_total[30s]) + rate(haproxy_server_bytes_out_total[30s]))', start, end, step),
      promRange('sum by (server) (haproxy_server_current_sessions)', start, end, step),
      promRange('ftp_node_probe_duration_seconds * 1000', start, end, step),
      promRange('sum by (folder) (ftp_storage_files)', start, end, step),
    ]);
    const nodeKey = (m: Record<string, string>) => m.node ?? (m.server ? `ftp-node-${slotOf(m.server)}` : m.slot ? `ftp-node-${m.slot}` : 'value');
    return {
      minutes, step,
      cluster: align([...ready.map((s) => ({ key: 'ready', values: s.values })), ...desired.map((s) => ({ key: 'desired', values: s.values }))], start, end, step),
      nodeUp: align(nodeUp.map((s) => ({ key: nodeKey(s.metric), values: s.values })), start, end, step),
      traffic: align(traffic.map((s) => ({ key: nodeKey(s.metric), values: s.values })), start, end, step),
      sessions: align(sessions.map((s) => ({ key: nodeKey(s.metric), values: s.values })), start, end, step),
      probeMs: align(probe.map((s) => ({ key: nodeKey(s.metric), values: s.values })), start, end, step),
      storage: align(storage.map((s) => ({ key: s.metric.folder ?? 'files', values: s.values })), start, end, step),
    };
  });

  /** Break a node on purpose (same as scripts/chaos/ftp-node-fail.sh, via the controller). */
  app.post('/platform/chaos', async (req, reply) => {
    const body = (req.body ?? {}) as { slot?: number; mode?: string };
    try {
      const res = await fetch(`${config.platform.controllerUrl}/api/chaos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot: body.slot, mode: body.mode === 'kill' ? 'kill' : 'pause' }),
        signal: AbortSignal.timeout(5000),
      });
      const json = await res.json();
      return reply.code(res.status).send(json);
    } catch (e) {
      return reply.code(502).send({ error: `Platform controller unreachable: ${(e as Error).message}` });
    }
  });
}
