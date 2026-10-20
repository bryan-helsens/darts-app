/**
 * Reproduceerbare toevalsgenerator. Elke speelavond krijgt een vaste seed,
 * zodat een loting altijd opnieuw te berekenen (en te controleren) is.
 */

/** 53-bit hash van een string (cyrb53). */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Lotingswaarde: lager = beter. Altijd dezelfde uitkomst voor dezelfde invoer. */
export function lotValue(seed: string, ...parts: string[]): number {
  return hashString([seed, ...parts].join('|'));
}

export interface Rng {
  /** Getal in [0, 1). */
  next(): number;
  /** Geheel getal in [0, max). */
  int(max: number): number;
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(next() * max);
  return {
    next,
    int,
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    pick<T>(items: readonly T[]): T {
      return items[int(items.length)];
    },
  };
}
