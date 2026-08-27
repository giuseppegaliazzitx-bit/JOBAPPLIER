export const DEFAULT_DAILY_CAP = 20;

export function shuffleBatch<T>(items: T[], rnd: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

export function humanDelayMs(rnd: () => number = Math.random): number {
  const u = Math.min(0.999, Math.max(0.001, rnd()));
  const v = Math.min(0.999, Math.max(0.001, rnd()));
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const ms = 850 * Math.exp(0.4 * z);
  return Math.round(Math.min(2800, Math.max(280, ms)));
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}
