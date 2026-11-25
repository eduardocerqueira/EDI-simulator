export const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
export const chance = (p: number) => Math.random() < p;
export function sample<T>(xs: readonly T[], n: number): T[] {
  const copy = [...xs];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}
export function weighted<T extends string>(weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}
