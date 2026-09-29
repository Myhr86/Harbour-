// Deterministic seeded RNG (mulberry32). The generator state lives inside
// GameState.rng, so saving the state and reloading it replays the same day.

export interface RngHolder {
  rng: number;
}

export function next(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) >>> 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** True with probability pct/100. */
export function chance(h: RngHolder, pct: number): boolean {
  return next(h) * 100 < pct;
}

/** Integer in [lo, hi] inclusive. */
export function int(h: RngHolder, lo: number, hi: number): number {
  return lo + Math.floor(next(h) * (hi - lo + 1));
}

export function pick<T>(h: RngHolder, arr: readonly T[]): T {
  return arr[Math.floor(next(h) * arr.length)];
}

export function seedFromString(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
