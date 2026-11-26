import { config } from './config.js';
import { recordEvent } from './cluster.js';

export interface PromAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'pending' | 'firing' | 'inactive';
  activeAt: string;
  value: string;
}

let active = new Map<string, PromAlert>();
let lastAlerts: PromAlert[] = [];
let reachable = false;

const key = (a: PromAlert) => `${a.labels.alertname}|${a.labels.node ?? a.labels.server ?? a.labels.partner ?? ''}`;

/**
 * Prometheus evaluates the alert rules (infra/prometheus/alerts.yml). We poll
 * its active alerts and turn firing/resolved transitions into platform events
 * (RabbitMQ → distributor notifications).
 */
export async function pollAlerts() {
  try {
    const res = await fetch(`${config.prometheusUrl}/api/v1/alerts`, { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { data: { alerts: PromAlert[] } };
    reachable = true;
    lastAlerts = body.data.alerts;
    const firing = new Map(body.data.alerts.filter((a) => a.state === 'firing').map((a) => [key(a), a]));
    for (const [k, a] of firing) {
      if (!active.has(k)) {
        recordEvent(
          { type: 'ALERT_FIRING', severity: a.labels.severity === 'critical' ? 'ERROR' : 'WARNING', node: a.labels.node, message: `Prometheus alert ${a.labels.alertname} firing: ${a.annotations.summary ?? ''}` },
          { routingKey: 'platform.alert.firing', title: `Alert: ${a.labels.alertname}`, extra: { alert: a.labels.alertname } },
        );
      }
    }
    for (const [k, a] of active) {
      if (!firing.has(k)) {
        recordEvent(
          { type: 'ALERT_RESOLVED', severity: 'INFO', node: a.labels.node, message: `Prometheus alert ${a.labels.alertname} resolved: ${a.annotations.summary ?? ''}` },
          { routingKey: 'platform.alert.resolved', title: `Resolved: ${a.labels.alertname}`, extra: { alert: a.labels.alertname } },
        );
      }
    }
    active = firing;
  } catch {
    reachable = false;
  }
}

export const alertState = () => ({ reachable, alerts: lastAlerts });
