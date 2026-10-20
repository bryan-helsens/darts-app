/** Waarschuwen voor mogelijke dubbele spelers ("Jan Peeters" ≈ "jan peters"). */

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** Gelijkenis tussen 0 en 1. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // Zelfde woorden in andere volgorde ("Peeters Jan").
  const sx = x.split(' ').sort().join(' ');
  const sy = y.split(' ').sort().join(' ');
  if (sx === sy) return 0.98;
  const dist = Math.min(levenshtein(x, y), levenshtein(sx, sy));
  let score = 1 - dist / Math.max(x.length, y.length);
  // "Kris V." tegenover "Kris Vermeulen": voornaam gelijk en de rest is een afkorting.
  const [fx, ...rx] = x.split(' ');
  const [fy, ...ry] = y.split(' ');
  if (fx === fy && rx.length > 0 && ry.length > 0 && (ry.join(' ').startsWith(rx.join(' ')) || rx.join(' ').startsWith(ry.join(' ')))) {
    score = Math.max(score, 0.85);
  }
  return score;
}

export function findSimilar<T extends { name: string }>(name: string, candidates: readonly T[], threshold = 0.8): T[] {
  return candidates
    .map((c) => ({ c, s: nameSimilarity(name, c.name) }))
    .filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

/** Zoeken in een lijst op een deel van de naam (zonder accenten). */
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeName(query);
  if (!q) return true;
  const n = normalizeName(name);
  return q.split(' ').every((part) => n.includes(part));
}
