/**
 * Uitgooien bij 501 double out: welke worpen een rest uitgooien, en met
 * hoeveel darts dat kan. Puur en zonder tabel: alle routes worden uitgerekend
 * en de beste gekozen (minste darts, dan de gebruikelijke voorkeur: aanloop op
 * T20/T19, uitgooien op D16, D20 of D8).
 */

export type CheckoutDarts = 1 | 2 | 3;

export interface Segment {
  kind: 'S' | 'D' | 'T';
  /** 1–20, of 25 voor de bull (S25 = 25, D25 = bull = 50). */
  n: number;
}

/** Restscores die niet uit te gooien zijn met drie darts. */
export const BOGEY_CHECKOUTS: ReadonlySet<number> = new Set([159, 162, 163, 165, 166, 168, 169]);
/** Scores die je met drie darts niet kan gooien. */
export const IMPOSSIBLE_VISITS: ReadonlySet<number> = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);

export const segmentValue = (s: Segment) => s.n * (s.kind === 'S' ? 1 : s.kind === 'D' ? 2 : 3);

export function segmentLabel(s: Segment): string {
  if (s.n === 25) return s.kind === 'D' ? 'Bull' : '25';
  return s.kind === 'S' ? String(s.n) : `${s.kind}${s.n}`;
}

// Voorkeur voor de laatste dart (lager = beter).
const FINISH_PENALTY: Record<number, number> = { 16: 0, 20: 1, 8: 2, 12: 3, 10: 3, 18: 4, 4: 4, 6: 5, 14: 5, 25: 5, 2: 6 };
const finishPenalty = (s: Segment) => FINISH_PENALTY[s.n] ?? 6;

// Voorkeur voor de aanloopdarts.
function setupPenalty(s: Segment): number {
  if (s.kind === 'T') return s.n === 20 ? 0 : s.n === 19 ? 1 : s.n >= 15 ? 2 : 4;
  if (s.kind === 'S') return s.n === 25 ? 4 : 3;
  return s.n === 25 ? 5 : 6;
}

const NUMBERS = Array.from({ length: 20 }, (_, i) => 20 - i);
/** Aanloopdarts in volgorde van voorkeur (bepaalt ook de keuze bij gelijke strafpunten). */
const SETUP_SEGMENTS: Segment[] = [
  ...NUMBERS.map((n): Segment => ({ kind: 'T', n })),
  { kind: 'S', n: 25 },
  ...NUMBERS.map((n): Segment => ({ kind: 'S', n })),
  { kind: 'D', n: 25 },
  ...NUMBERS.map((n): Segment => ({ kind: 'D', n })),
];
const FINISH_SEGMENTS: Segment[] = [...NUMBERS.map((n): Segment => ({ kind: 'D', n })), { kind: 'D', n: 25 }];
const finishByValue = new Map<number, Segment>();
for (const s of FINISH_SEGMENTS) {
  const current = finishByValue.get(segmentValue(s));
  if (!current || finishPenalty(s) < finishPenalty(current)) finishByValue.set(segmentValue(s), s);
}

/** Minimaal aantal darts om `score` uit te gooien (null = onmogelijk). */
export function minCheckoutDarts(score: number): CheckoutDarts | null {
  const route = checkoutSuggestion(score);
  return route ? (route.length as CheckoutDarts) : null;
}

/** Met hoeveel darts een uitgooi van `score` kan gebeurd zijn (de eerste darts kunnen gemist zijn). */
export function checkoutOptions(score: number): CheckoutDarts[] {
  const min = minCheckoutDarts(score);
  if (min === null) return [];
  return ([1, 2, 3] as const).filter((d) => d >= min);
}

/**
 * Beste route om `remaining` uit te gooien met hoogstens `darts` darts,
 * of null als dat niet kan (bogey, 1, meer dan 170 …).
 */
export function checkoutSuggestion(remaining: number, darts: CheckoutDarts = 3): Segment[] | null {
  if (!Number.isInteger(remaining) || remaining < 2 || remaining > 170) return null;
  for (let count = 1; count <= darts; count++) {
    let best: { route: Segment[]; penalty: number } | null = null;
    const consider = (route: Segment[]) => {
      const penalty = route.slice(0, -1).reduce((p, s) => p + setupPenalty(s), 0) + finishPenalty(route[route.length - 1]);
      if (!best || penalty < best.penalty) best = { route, penalty };
    };
    if (count === 1) {
      const f = finishByValue.get(remaining);
      if (f) consider([f]);
    } else if (count === 2) {
      for (const a of SETUP_SEGMENTS) {
        const f = finishByValue.get(remaining - segmentValue(a));
        if (f) consider([a, f]);
      }
    } else {
      for (const a of SETUP_SEGMENTS) {
        for (const b of SETUP_SEGMENTS) {
          const f = finishByValue.get(remaining - segmentValue(a) - segmentValue(b));
          if (f) consider([a, b, f]);
        }
      }
    }
    if (best) return (best as { route: Segment[] }).route;
  }
  return null;
}

/** "T20 · T19 · D12" */
export function formatCheckout(route: readonly Segment[] | null): string {
  return route ? route.map(segmentLabel).join(' · ') : '';
}
