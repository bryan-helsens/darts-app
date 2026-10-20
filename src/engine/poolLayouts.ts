/**
 * Mogelijke poule-indelingen voor n spelers.
 *
 * Standaard: poules van 4; als dat niet uitkomt poules van 5; poules van 3
 * alleen als 4 en 5 niet volstaan (6, 7 en 11 spelers). De wedstrijdleider kan
 * ook kiezen voor minder, grotere poules.
 */

export interface PoolLayout {
  /** Stabiele sleutel, bv. "4-4-5". */
  id: string;
  sizes: number[];
  standard: boolean;
  /** Standaard aantal doorstromers per poule naar het A-schema. */
  advanceToA: number;
  label: string;
}

const MAX_POOL_SIZE = 7;
const MAX_SINGLE_POOL = 8;

export function standardSizes(n: number): number[] {
  if (n <= 5) return [n];
  for (let threes = 0; threes * 3 <= n; threes++) {
    for (let fives = 0; threes * 3 + fives * 5 <= n; fives++) {
      const rest = n - threes * 3 - fives * 5;
      if (rest % 4 === 0) {
        return [...Array(rest / 4).fill(4), ...Array(fives).fill(5), ...Array(threes).fill(3)];
      }
    }
  }
  throw new Error(`Geen poule-indeling mogelijk voor ${n} spelers`);
}

/** n spelers zo gelijk mogelijk over p poules (kleinere poules eerst). */
export function balancedSizes(n: number, p: number): number[] {
  const base = Math.floor(n / p);
  const extra = n % p;
  return [...Array(p - extra).fill(base), ...Array(extra).fill(base + 1)];
}

export function defaultAdvance(sizes: number[]): number {
  if (sizes.length === 1) return Math.max(1, Math.min(4, sizes[0] - 2));
  return Math.max(1, Math.min(2, Math.min(...sizes) - 1));
}

export function describeSizes(sizes: number[]): string {
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, count]) => `${count} ${count === 1 ? 'poule' : 'poules'} van ${size}`)
    .join(' + ');
}

function layout(sizes: number[], standard: boolean): PoolLayout {
  return {
    id: sizes.join('-'),
    sizes,
    standard,
    advanceToA: defaultAdvance(sizes),
    label: describeSizes(sizes),
  };
}

/** Alle zinvolle indelingen: de standaard plus varianten met minder, grotere poules. */
export function layoutOptions(n: number): PoolLayout[] {
  if (n < 2) return [];
  const std = standardSizes(n);
  const options: PoolLayout[] = [layout(std, true)];
  const seen = new Set([options[0].id]);
  for (let p = std.length - 1; p >= 1; p--) {
    const sizes = balancedSizes(n, p);
    const max = Math.max(...sizes);
    if (p === 1 ? max > MAX_SINGLE_POOL : max > MAX_POOL_SIZE) continue;
    const l = layout(sizes, false);
    if (!seen.has(l.id)) {
      seen.add(l.id);
      options.push(l);
    }
  }
  return options;
}

/** Aantal spelers in het A-schema voor een indeling met k doorstromers per poule. */
export function knockoutSizes(sizes: number[], advance: number): { A: number; B: number } {
  let a = 0;
  for (const s of sizes) a += Math.min(advance, s);
  const total = sizes.reduce((x, y) => x + y, 0);
  return { A: a, B: total - a };
}

export function poolMatchCount(sizes: number[]): number {
  return sizes.reduce((sum, s) => sum + (s * (s - 1)) / 2, 0);
}
