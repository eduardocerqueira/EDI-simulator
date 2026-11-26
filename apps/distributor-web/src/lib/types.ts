export interface X12Issue {
  id?: string;
  level: string;
  code: string;
  x12Code?: string | null;
  x12CodeSource: string;
  x12CodeDescription?: string | null;
  severity: string;
  message: string;
  segmentId?: string | null;
  segmentPosition?: number | null;
  elementPosition?: number | null;
  elementRef?: string | null;
  badValue?: string | null;
  loopId?: string | null;
  createdAt?: string;
}

export interface DescribedElement {
  position: string;
  ref?: string;
  name?: string;
  value: string;
  codeDescription?: string;
}

export interface DescribedSegment {
  position: number;
  id: string;
  name?: string;
  purpose?: string;
  layer: 'interchange' | 'group' | 'transaction' | 'detail';
  raw: string;
  elements: DescribedElement[];
  issues: X12Issue[];
}

export interface ProcessingEvent {
  id: string;
  stage: string;
  status: string;
  message: string;
  details?: unknown;
  durationMs?: number | null;
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  attemptNo: number;
  statusCode?: number | null;
  success: boolean;
  error?: string | null;
  durationMs: number;
  createdAt: string;
}

export interface ApiDelivery {
  id: string;
  transactionId: string;
  target: string;
  endpoint: string;
  payload: any;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string | null;
  lastStatusCode?: number | null;
  responseBody?: any;
  createdAt: string;
  deliveredAt?: string | null;
  attemptLog: DeliveryAttempt[];
  transaction?: { id: string; type: string; controlNumber: string; interchangeId: string; partner?: { name: string } | null };
}

export interface Acknowledgment {
  id: string;
  interchangeId: string;
  type: string;
  controlNumber: string;
  ackCode: string;
  fileName: string;
  remotePath: string;
  content: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  sentAt?: string | null;
  interchange?: { id: string; controlNumber: string; partner?: { name: string; isaId: string } | null };
}

export interface PartnerRef {
  id: string;
  name: string;
  isaId: string;
}

export interface Kpis {
  range: { hours: number; from: string; to: string; stepMs: number };
  health: { rabbitmq: boolean };
  edi: {
    filesReceived: number;
    filesSent: number;
    inboundBytes: number;
    retriedDownloads: number;
    failedTransfers: number;
    interchanges: number;
    interchangesAccepted: number;
    interchangesPartial: number;
    interchangesRejected: number;
    interchangesErrored: number;
    firstPassYield: number | null;
    transactions: number;
    transactionsIngested: number;
    transactionsSyntaxRejected: number;
    transactionsBusinessRejected: number;
    acceptanceRate: number | null;
    avgProcessingMs: number | null;
    p95ProcessingMs: number | null;
    avgEndToEndMs: number | null;
    p95EndToEndMs: number | null;
    acksSent: number;
    acksPending: number;
    avgAckTurnaroundMs: number | null;
  };
  delivery: {
    total: number;
    success: number;
    backlog: number;
    dead: number;
    attempts: number;
    retries: number;
    retriedDeliveries: number;
    successRate: number | null;
    firstAttemptSuccessRate: number | null;
  };
  validation: {
    topErrors: Array<{ code: string; level: string; x12Code: string | null; x12CodeSource: string; description?: string; count: number }>;
    byLevel: Array<{ level: string; count: number }>;
  };
  byType: Array<{ type: string; total: number; ingested: number; syntaxRejected: number; businessRejected: number }>;
  partners: Array<{ id: string; name: string; isaId: string; interchanges: number; transactions: number; accepted: number; acceptanceRate: number | null; errors: number; lastSeenAt: string | null }>;
  timeseries: {
    interchanges: Array<{ bucket: string; received: number; accepted: number; partial: number; rejected: number }>;
    transactions: Array<{ bucket: string; ingested: number; syntaxRejected: number; businessRejected: number; delivered: number }>;
  };
  inventory: { skus: number; units: number; stockValueCost: number; stockValueRetail: number; lowStock: number; outOfStock: number; lowStockThreshold: number };
  orders: {
    orders: number;
    cancelled: number;
    revenue: number;
    avgOrderValue: number;
    cancellationRate: number | null;
    customers: number;
    openAmount: number;
    openBills: number;
    overdueAmount: number;
    overdueBills: number;
    paidAmount: number;
  };
}

// ---------------------------------------------------------------------------
// Platform (HA FTP cluster)
// ---------------------------------------------------------------------------

export type NodeStatus = 'STARTING' | 'READY' | 'SUSPECT' | 'DOWN' | 'REPLACING' | 'MISSING';

export interface PlatformNode {
  slot: number;
  name: string;
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

export interface FolderStats {
  files: number;
  bytes: number;
  inFlight: number;
  newest?: string;
}

export type MailboxFolder = 'to_distributor' | 'archive' | 'from_distributor' | 'error';

export interface PartnerStorage {
  partner: string;
  folders: Record<MailboxFolder, FolderStats>;
  totalFiles: number;
  totalBytes: number;
}

export interface StorageSnapshot {
  scannedAt?: string;
  scanMs?: number;
  path: string;
  volume?: { sizeBytes: number; freeBytes: number; usedBytes: number; usedRatio: number };
  partners: PartnerStorage[];
  totals: { files: number; bytes: number; fresh: number; archived: number; acks: number; error: number };
  error?: string;
}

export interface PromAlert {
  name: string;
  severity?: string;
  state: 'firing' | 'pending' | 'inactive' | string;
  since: string;
  summary?: string;
  labels: Record<string, string>;
}

export interface PromTarget {
  job: string;
  instance: string;
  health: 'up' | 'down' | 'unknown' | string;
  lastScrape: string;
  lastError: string;
}

export interface LbServer {
  server: string;
  slot?: number;
  up: boolean;
  controlSessions: number;
  dataSessions: number;
  bytesIn: number;
  bytesOut: number;
  throughputBps: number;
}

export interface PartnerTraffic {
  id: string;
  name: string;
  isaId: string;
  ftpUser: string;
  inboundFiles24h: number;
  inboundBytes24h: number;
  outboundFiles24h: number;
  outboundBytes24h: number;
}

export interface PlatformNotification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface PlatformOverview {
  controller:
    | { reachable: false }
    | {
        reachable: true;
        project?: string;
        desiredNodes: number;
        readyNodes: number;
        autoHeal: boolean;
        probe: { intervalMs: number; timeoutMs: number; failureThreshold: number };
        lastReconcileAt?: string;
        nodes: PlatformNode[];
        events: ClusterEvent[];
        storage: StorageSnapshot;
      };
  loadBalancer: { reachable: boolean; statsUrl: string; servers: LbServer[] };
  prometheus: { reachable: boolean; url: string; alerts: PromAlert[]; targets: PromTarget[] };
  partnerTraffic: PartnerTraffic[];
  notifications: { unread: number; items: PlatformNotification[] };
}

export type SeriesRow = { t: number } & Record<string, number>;

export interface PlatformTimeseries {
  minutes: number;
  step: number;
  cluster: SeriesRow[];
  nodeUp: SeriesRow[];
  traffic: SeriesRow[];
  sessions: SeriesRow[];
  probeMs: SeriesRow[];
  storage: SeriesRow[];
}
