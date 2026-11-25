export type Variant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline' | 'muted';

const MAP: Record<string, Variant> = {
  // interchange
  ACCEPTED: 'success',
  PARTIALLY_ACCEPTED: 'warning',
  REJECTED: 'destructive',
  RECEIVED: 'info',
  ERROR: 'destructive',
  // transaction
  INGESTED: 'info',
  DELIVERED: 'success',
  DELIVERY_FAILED: 'destructive',
  SYNTAX_REJECTED: 'destructive',
  ENVELOPE_REJECTED: 'destructive',
  BUSINESS_REJECTED: 'warning',
  // files
  DISCOVERED: 'muted',
  RETRYING: 'warning',
  DOWNLOADED: 'info',
  PROCESSED: 'success',
  FAILED: 'destructive',
  SENT: 'success',
  PENDING: 'muted',
  // deliveries
  SUCCESS: 'success',
  DEAD: 'destructive',
  // orders / bills
  PLACED: 'info',
  CANCELLED: 'muted',
  OPEN: 'info',
  PAID: 'success',
  OVERDUE: 'destructive',
  // events
  FAILURE: 'destructive',
  INFO: 'info',
  RETRY: 'warning',
  WARNING: 'warning',
  // ack codes
  A: 'success',
  E: 'warning',
  P: 'warning',
  R: 'destructive',
};

export const statusVariant = (s: string | null | undefined): Variant => (s ? MAP[s] ?? 'outline' : 'muted');

export const statusLabel = (s: string | null | undefined) =>
  s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—';

export const INTERCHANGE_STATUSES = ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'RECEIVED', 'ERROR'];
export const TRANSACTION_STATUSES = ['DELIVERED', 'INGESTED', 'BUSINESS_REJECTED', 'SYNTAX_REJECTED', 'ENVELOPE_REJECTED', 'DELIVERY_FAILED', 'ERROR'];
export const TX_TYPES = [
  { value: '832', label: '832 · Price/Sales Catalog' },
  { value: '846', label: '846 · Inventory Advice' },
  { value: '856', label: '856 · Ship Notice' },
];
export const TYPE_NAMES: Record<string, string> = { '832': 'Catalog', '846': 'Inventory', '856': 'Ship Notice', '997': 'Func. Ack', TA1: 'Interchange Ack' };

export const ACK_LABEL: Record<string, string> = { A: 'Accepted', E: 'Accepted w/ errors', P: 'Partially accepted', R: 'Rejected' };
