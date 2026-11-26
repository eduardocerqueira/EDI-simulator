const env = (k: string, d: string) => process.env[k] ?? d;
const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

export const config = {
  port: num('PORT', 9100),
  dockerSocket: env('DOCKER_SOCKET', '/var/run/docker.sock'),
  amqpUrl: env('AMQP_URL', 'amqp://edi:edi@localhost:5672'),
  prometheusUrl: env('PROMETHEUS_URL', 'http://prometheus:9090'),
  storagePath: env('STORAGE_PATH', '/srv/ftp'),
  /** Desired cluster size: one slot per FTP node (ftp-node-1..N). */
  slots: env('FTP_SLOTS', '1,2,3').split(',').map((s) => Number(s.trim())).filter(Boolean),
  pasvBase: num('FTP_PASV_BASE', 21100),
  pasvPerNode: num('FTP_PASV_PER_NODE', 10),
  probeIntervalMs: num('PROBE_INTERVAL_MS', 2000),
  probeTimeoutMs: num('PROBE_TIMEOUT_MS', 1500),
  /** Consecutive failed probes before a node is declared down and replaced. */
  failureThreshold: num('FAILURE_THRESHOLD', 3),
  /** Grace period for a freshly started node before probes count as failures. */
  startupGraceMs: num('STARTUP_GRACE_MS', 20000),
  storageScanMs: num('STORAGE_SCAN_MS', 10000),
  alertPollMs: num('ALERT_POLL_MS', 5000),
  autoHeal: env('AUTO_HEAL', 'true') === 'true',
};

export const pasvRange = (slot: number) => {
  const min = config.pasvBase + (slot - 1) * config.pasvPerNode;
  return { min, max: min + config.pasvPerNode - 1 };
};
