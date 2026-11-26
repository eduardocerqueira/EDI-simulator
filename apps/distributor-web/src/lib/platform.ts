import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ClusterEventType, MailboxFolder, NodeStatus, PlatformOverview, PlatformTimeseries } from './types';

export function usePlatformOverview(refetchInterval = 2000) {
  return useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => api<PlatformOverview>('/platform/overview'),
    refetchInterval,
  });
}

export function usePlatformTimeseries(minutes: number, refetchInterval = 5000) {
  return useQuery({
    queryKey: ['platform', 'timeseries', minutes],
    queryFn: () => api<PlatformTimeseries>(`/platform/timeseries?minutes=${minutes}`),
    refetchInterval,
  });
}

/** One stable colour per FTP node across every chart and card. */
export const NODE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)'];
export const nodeColor = (slot: number) => NODE_COLORS[(slot - 1) % NODE_COLORS.length]!;

export const NODE_STATUS: Record<NodeStatus, { label: string; tone: 'success' | 'warning' | 'destructive' | 'info' | 'muted'; help: string }> = {
  READY: { label: 'Ready', tone: 'success', help: 'Answers the FTP "220" greeting; in the load balancer rotation.' },
  STARTING: { label: 'Starting', tone: 'info', help: 'Container started; waiting for the FTP greeting.' },
  SUSPECT: { label: 'Suspect', tone: 'warning', help: 'At least one probe failed. Declared down after the failure threshold.' },
  DOWN: { label: 'Down', tone: 'destructive', help: 'Not answering. The controller is about to replace it.' },
  REPLACING: { label: 'Replacing', tone: 'warning', help: 'Removing the unhealthy container and spawning a new one.' },
  MISSING: { label: 'Missing', tone: 'destructive', help: 'No container exists for this slot.' },
};

export const isTransitional = (s: NodeStatus) => s === 'STARTING' || s === 'REPLACING';
export const isUnhealthy = (s: NodeStatus) => s === 'DOWN' || s === 'MISSING' || s === 'SUSPECT';

export const FOLDER_INFO: Record<MailboxFolder, { label: string; help: string; color: string }> = {
  to_distributor: { label: 'Fresh', help: 'to_distributor/ — inbound X12 uploaded by the producer, waiting for the distributor to pick it up.', color: 'var(--chart-2)' },
  archive: { label: 'Archived', help: 'archive/ — inbound files the distributor downloaded and processed.', color: 'var(--chart-1)' },
  from_distributor: { label: 'Acks waiting', help: 'from_distributor/ — TA1 / 997 acknowledgments waiting for the producer to download.', color: 'var(--chart-4)' },
  error: { label: 'Error', help: 'error/ — files that could not be downloaded after the maximum attempts.', color: 'var(--chart-3)' },
};

export const EVENT_META: Record<ClusterEventType, { label: string; tone: 'success' | 'warning' | 'destructive' | 'info' | 'muted' }> = {
  CONTROLLER_STARTED: { label: 'Controller started', tone: 'muted' },
  CHAOS_INJECTED: { label: 'Chaos injected', tone: 'warning' },
  PROBE_FAILED: { label: 'Probe failed', tone: 'warning' },
  NODE_DOWN: { label: 'Node down', tone: 'destructive' },
  NODE_REPLACING: { label: 'Replacing', tone: 'warning' },
  NODE_REMOVED: { label: 'Removed', tone: 'muted' },
  NODE_SPAWNED: { label: 'Spawned', tone: 'info' },
  NODE_RECOVERED: { label: 'Recovered', tone: 'success' },
  NODE_READY: { label: 'Ready', tone: 'success' },
  ALERT_FIRING: { label: 'Alert firing', tone: 'destructive' },
  ALERT_RESOLVED: { label: 'Alert resolved', tone: 'success' },
  REPLACE_FAILED: { label: 'Replace failed', tone: 'destructive' },
};

export const toneText: Record<string, string> = {
  success: 'text-success',
  warning: 'text-[oklch(0.55_0.13_70)] dark:text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
  muted: 'text-muted-foreground',
};
export const toneBg: Record<string, string> = {
  success: 'bg-success/12',
  warning: 'bg-warning/20',
  destructive: 'bg-destructive/12',
  info: 'bg-info/12',
  muted: 'bg-muted',
};
export const toneDot: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  muted: 'bg-muted-foreground',
};

/** Docker sometimes returns zero dates for containers that never started. */
export const validDate = (d?: string) => (d && !d.startsWith('0001-') ? d : undefined);
export const shortId = (id?: string) => (id ? id.slice(0, 12) : '—');
/** Compose container names may be prefixed with an old id on recreate ("<id>_name"). */
export const cleanName = (n?: string) => (n ? n.replace(/^[0-9a-f]{12}_/, '') : '—');

export const rate = (bps: number | undefined | null) => {
  if (bps === undefined || bps === null) return '—';
  if (bps < 1024) return `${bps.toFixed(bps < 10 ? 1 : 0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
};

/** Byte sizes up to TB (the shared fmt.bytes stops at MB). */
export const bytes = (b: number | undefined | null) => {
  if (b === undefined || b === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : v < 10 ? 2 : 1)} ${units[i]}`;
};
