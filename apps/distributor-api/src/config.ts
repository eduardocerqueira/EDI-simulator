import { DISTRIBUTOR } from '@edi/shared';

const env = (k: string, d: string) => process.env[k] ?? d;
const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

export const config = {
  port: num('PORT', 4000),
  jwtSecret: env('JWT_SECRET', 'dev-distributor-secret-change-me'),
  amqpUrl: env('AMQP_URL', 'amqp://edi:edi@localhost:5672'),
  ftp: {
    host: env('FTP_HOST', 'localhost'),
    port: num('FTP_PORT', 21),
    user: env('FTP_USER', 'distributor'),
    password: env('FTP_PASSWORD', 'distributor123'),
    pollIntervalMs: num('FTP_POLL_INTERVAL_MS', 5000),
    maxDownloadAttempts: num('FTP_MAX_DOWNLOAD_ATTEMPTS', 5),
    enabled: env('FTP_ENABLED', 'true') === 'true',
  },
  orderApi: {
    url: env('ORDER_API_URL', 'http://localhost:4100'),
    apiKey: env('ORDER_API_KEY', 'integration-key-change-me'),
    timeoutMs: num('ORDER_API_TIMEOUT_MS', 5000),
  },
  delivery: {
    maxAttempts: num('DELIVERY_MAX_ATTEMPTS', 5),
    baseBackoffMs: num('DELIVERY_BASE_BACKOFF_MS', 2000),
    /** Probability (0..1) of simulating a transient network failure, to demo retries. */
    failureRate: Number(env('DELIVERY_FAILURE_RATE', '0.05')),
    pollMs: num('DELIVERY_POLL_MS', 2000),
  },
  platform: {
    prometheusUrl: env('PROMETHEUS_URL', 'http://localhost:9090'),
    controllerUrl: env('PLATFORM_CONTROLLER_URL', 'http://localhost:9100'),
  },
  email: {
    /** Only a simulated Resend is wired in this version: nothing leaves the machine. */
    provider: 'resend-simulated' as const,
    from: env('EMAIL_FROM', 'Harvest Hub EDI Operations <edi-support@harvesthub.example>'),
    /** the "verified" sending domain: the simulated API rejects other From domains with 403, like Resend */
    sendingDomain: env('EMAIL_SENDING_DOMAIN', 'harvesthub.example'),
    /** inbound domain; replies go to edi-replies+RPT-000123@<inboundDomain> so they thread back to the report */
    inboundDomain: env('EMAIL_INBOUND_DOMAIN', 'inbound.harvesthub.example'),
    /** Svix-style signing secret shared by the simulated Resend and our webhook endpoint */
    webhookSecret: env('RESEND_WEBHOOK_SECRET', `whsec_${Buffer.from('harvest-hub-dev-webhook-signing-key').toString('base64')}`),
    webhookUrl: env('RESEND_WEBHOOK_URL', `http://127.0.0.1:${num('PORT', 4000)}/api/webhooks/resend`),
    /** share of report e-mails a (simulated) producer answers */
    simReplyRate: Number(env('RESEND_SIM_REPLY_RATE', '0.7')),
    simReplyDelayMs: num('RESEND_SIM_REPLY_DELAY_MS', 12_000),
  },
  markup: Number(env('PRICE_MARKUP', '0.35')),
  lowStockThreshold: num('LOW_STOCK_THRESHOLD', 25),
  admin: {
    email: env('ADMIN_EMAIL', 'admin@harvesthub.local'),
    password: env('ADMIN_PASSWORD', 'admin123'),
  },
  identity: DISTRIBUTOR,
};
