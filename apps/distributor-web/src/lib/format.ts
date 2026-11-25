const nf = new Intl.NumberFormat('en-US');
const cf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const cfCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

export const fmt = {
  num: (n: number | null | undefined) => (n === null || n === undefined ? '—' : nf.format(n)),
  money: (n: number | null | undefined) => (n === null || n === undefined ? '—' : cf.format(n)),
  moneyCompact: (n: number | null | undefined) => (n === null || n === undefined ? '—' : cfCompact.format(n)),
  pct: (r: number | null | undefined, digits = 1) => (r === null || r === undefined ? '—' : `${(r * 100).toFixed(digits)}%`),
  ms: (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    return `${(ms / 60_000).toFixed(1)} min`;
  },
  bytes: (b: number | null | undefined) => {
    if (b === null || b === undefined) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  },
  date: (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'),
  dateTime: (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—',
  time: (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'),
  ago: (d: string | Date | null | undefined) => {
    if (!d) return '—';
    const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  },
  /** X12 dates: YYMMDD or CCYYMMDD → readable. */
  x12Date: (v: string | null | undefined) => {
    if (!v) return '—';
    const s = v.length === 6 ? `20${v}` : v;
    if (s.length !== 8) return v;
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  },
  x12Time: (v: string | null | undefined) => (v && v.length >= 4 ? `${v.slice(0, 2)}:${v.slice(2, 4)}` : v || '—'),
  short: (id: string | null | undefined) => (id ? id.slice(-8) : '—'),
};
