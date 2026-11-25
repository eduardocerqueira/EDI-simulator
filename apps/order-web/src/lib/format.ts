const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (n: number | null | undefined) => currency.format(n ?? 0);
export const moneyCompact = (n: number) => (Math.abs(n) >= 10000 ? `$${compact.format(n)}` : currency.format(n));
export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export function relative(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (86400 * 30)), 'month');
}

/** Whole days from now until `d` (negative = in the past). */
export function daysUntil(d: string | Date): number {
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / 86400_000);
}

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y!, (mo ?? 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

export const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const TX_LABEL: Record<string, string> = { '832': '832 Catalog', '846': '846 Inventory', '856': '856 Ship Notice' };
