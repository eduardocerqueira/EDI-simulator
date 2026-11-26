import { tokenStore } from './api';

export type ItemStatus = 'OPEN' | 'IN_PROGRESS' | 'REPORTED' | 'PRODUCER_REPLIED' | 'RESOLVED' | 'DISMISSED';
type Tone = 'destructive' | 'warning' | 'info' | 'success' | 'muted' | 'outline' | 'secondary';

export const ITEM_STATUS: Record<ItemStatus, { label: string; variant: Tone; help: string }> = {
  OPEN: { label: 'Open', variant: 'destructive', help: 'New failure, nobody is working on it yet' },
  IN_PROGRESS: { label: 'In progress', variant: 'warning', help: 'Someone at Harvest Hub is investigating' },
  REPORTED: { label: 'Reported', variant: 'info', help: 'Sent to the producer in an exception report, waiting for an answer' },
  PRODUCER_REPLIED: { label: 'Producer replied', variant: 'success', help: 'The producer answered the report — review the reply' },
  RESOLVED: { label: 'Resolved', variant: 'muted', help: 'Fixed (e.g. corrected file received)' },
  DISMISSED: { label: 'Dismissed', variant: 'outline', help: 'Not actionable (test file, duplicate, …)' },
};
export const OPEN_STATUSES: ItemStatus[] = ['OPEN', 'IN_PROGRESS', 'REPORTED', 'PRODUCER_REPLIED'];

export const PRIORITY: Record<string, { label: string; variant: Tone; rank: number }> = {
  HIGH: { label: 'High', variant: 'destructive', rank: 0 },
  MEDIUM: { label: 'Medium', variant: 'warning', rank: 1 },
  LOW: { label: 'Low', variant: 'muted', rank: 2 },
};

export const LAYER: Record<string, { label: string; color: string; help: string }> = {
  ENVELOPE: { label: 'Envelope', color: 'var(--chart-5)', help: 'ISA/IEA problems — the whole interchange is rejected with TA1 R' },
  SYNTAX: { label: 'Syntax', color: 'var(--chart-3)', help: 'Group, transaction, segment or element errors — 997 AK3/AK4/AK5/AK9' },
  BUSINESS: { label: 'Business', color: 'var(--chart-2)', help: 'Valid X12 that breaks a business rule (unknown product, bad price…)' },
  SYSTEM: { label: 'System', color: 'var(--muted-foreground)', help: 'Our own processing failure' },
};

export const EMAIL_STATUS: Record<string, { label: string; variant: Tone }> = {
  queued: { label: 'Queued', variant: 'secondary' },
  sent: { label: 'Sent', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'info' },
  opened: { label: 'Opened', variant: 'success' },
  bounced: { label: 'Bounced', variant: 'destructive' },
  complained: { label: 'Spam complaint', variant: 'destructive' },
  failed: { label: 'Failed', variant: 'destructive' },
  received: { label: 'Received', variant: 'success' },
  quarantined: { label: 'Quarantined', variant: 'warning' },
};

export const aiLabel = (n: number) => `AI-${String(n).padStart(6, '0')}`;
export const rptLabel = (n: number) => `RPT-${String(n).padStart(6, '0')}`;

export interface HistoryEntry {
  at: string;
  by: string;
  action: string;
  from?: string;
  to?: string;
  note?: string;
}

export interface ActionItemRow {
  id: string;
  number: number;
  kind: string;
  layer: string;
  title: string;
  errorCodes: string[];
  issueCount: number;
  failedTransactions: number;
  priority: string;
  status: ItemStatus;
  assignee: string | null;
  note: string | null;
  occurredAt: string;
  reportedAt: string | null;
  repliedAt: string | null;
  updatedAt: string;
  partner: { id: string; name: string; isaId: string; specialty: string | null; contactEmail: string | null };
  interchange: { id: string; controlNumber: string; status: string; ta1AckCode: string | null; fileTransfer: { fileName: string } };
  reports: Array<{ id: string; number: number; createdAt: string }>;
}

/** Authenticated download (the CSV endpoint needs the bearer token, so a plain <a href> won't do). */
export async function downloadAuthed(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${tokenStore.get() ?? ''}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Where a notification should take you when clicked. */
export function notificationLink(n: { type?: string; interchangeId?: string | null; transactionId?: string | null; orderNumber?: string | null; payload?: unknown }) {
  const p = (n.payload ?? {}) as { reportId?: string };
  if (n.type?.startsWith('platform.')) return '/platform';
  if (n.type === 'edi.producer.replied' || n.type?.startsWith('edi.report.')) return p.reportId ? `/edi/action-items?tab=reports&report=${p.reportId}` : '/edi/action-items?tab=reports';
  if (n.type === 'edi.email.quarantined') return '/edi/action-items?tab=email';
  if (n.transactionId) return `/edi/transactions/${n.transactionId}`;
  if (n.interchangeId) return `/edi/interchanges/${n.interchangeId}`;
  if (n.orderNumber) return `/orders?q=${n.orderNumber}`;
  return null;
}
