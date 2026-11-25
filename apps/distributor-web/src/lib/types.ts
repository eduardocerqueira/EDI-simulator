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
