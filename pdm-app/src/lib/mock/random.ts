// Deterministic pseudo-random helpers so the mock fleet looks the same on every load.

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(key: string): () => number {
  return mulberry32(hashString(key));
}

export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function between(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

export function intBetween(rand: () => number, min: number, max: number): number {
  return Math.floor(between(rand, min, max + 1));
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

// "Now" for the mock world: the current time rounded down to 5 minutes, fixed for the session.
export const NOW = Math.floor(Date.now() / (5 * 60_000)) * 5 * 60_000;

export function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

export function isoIn(ms: number): string {
  return new Date(NOW + ms).toISOString();
}
