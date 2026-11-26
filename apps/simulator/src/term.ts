const tty = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const wrap = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
};

// eslint-disable-next-line no-control-regex
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(visible(h), ...rows.map((r) => visible(r[i] ?? ''))));
  const line = (cells: string[]) => cells.map((cell, i) => cell + ' '.repeat(widths[i]! - visible(cell))).join('  ');
  return [c.bold(line(headers)), widths.map((w) => '─'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}
