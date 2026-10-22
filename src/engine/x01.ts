/**
 * 501 double out per beurt: legs, beurten, busts, uitgooien en gemiddelden.
 * Puur: de scorer in de browser en de controle op de server volgen dezelfde
 * regels (zie de trigger match_legs_before_write).
 *
 * Een leg is een reeks beurten die strikt afwisselt, te beginnen bij
 * `starter`. Een bust telt als 0 punten en 3 darts. Wie uitgooit, zegt met
 * hoeveel darts (1, 2 of 3): dat telt mee voor het gemiddelde.
 */

import { checkoutOptions, IMPOSSIBLE_VISITS, type CheckoutDarts } from './checkout';
import type { Match, MatchId, PlayerId } from './types';

export type Slot = 1 | 2;
export const START_SCORE = 501;
/** Hoogste uitgooi wordt pas bewaard vanaf 100 (zoals bij de klassementen). */
export const HIGH_FINISH_MIN = 100;

export interface Visit {
  /** Gegooide punten (0 bij een bust). */
  score: number;
  bust: boolean;
}

export interface Leg {
  starter: Slot;
  visits: readonly Visit[];
  /** Enkel bij een uitgegooide leg. */
  checkoutDarts: CheckoutDarts | null;
}

export interface LegState {
  remaining: [number, number];
  /** Wie nu moet gooien (ook als de leg gedaan is: de volgende in de beurt). */
  toThrow: Slot;
  winner: Slot | null;
  darts: [number, number];
  points: [number, number];
}

export type VisitInput = { score: number; checkoutDarts?: CheckoutDarts } | { bust: true };

export type VisitOutcome =
  | { kind: 'scored'; leg: Leg }
  | { kind: 'bust'; leg: Leg; reason: 'over' | 'one-left' | 'no-checkout' | 'manual' }
  | { kind: 'needs-darts'; options: CheckoutDarts[] }
  | { kind: 'won'; leg: Leg; winner: Slot }
  | { kind: 'invalid'; message: string };

export const other = (slot: Slot): Slot => (slot === 1 ? 2 : 1);
export const visitSlot = (starter: Slot, index: number): Slot => (index % 2 === 0 ? starter : other(starter));
/** Wie begint in leg `index` (0-based): om beurten. */
export const legStarter = (first: Slot, index: number): Slot => (index % 2 === 0 ? first : other(first));

export function newLeg(starter: Slot): Leg {
  return { starter, visits: [], checkoutDarts: null };
}

export function isPossibleScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 180 && !IMPOSSIBLE_VISITS.has(score);
}

export function legState(leg: Leg): LegState {
  const remaining: [number, number] = [START_SCORE, START_SCORE];
  const darts: [number, number] = [0, 0];
  const points: [number, number] = [0, 0];
  let winner: Slot | null = null;
  leg.visits.forEach((v, i) => {
    const slot = visitSlot(leg.starter, i);
    const k = slot - 1;
    const last = i === leg.visits.length - 1;
    if (!v.bust) {
      remaining[k] -= v.score;
      points[k] += v.score;
    }
    darts[k] += !v.bust && last && remaining[k] === 0 && leg.checkoutDarts ? leg.checkoutDarts : 3;
    if (remaining[k] === 0) winner = slot;
  });
  return { remaining, toThrow: visitSlot(leg.starter, leg.visits.length), winner, darts, points };
}

/** Een beurt toevoegen. Busts worden automatisch herkend (te veel, 1 over, of 0 zonder geldige uitgooi). */
export function applyVisit(leg: Leg, input: VisitInput): VisitOutcome {
  const state = legState(leg);
  if (state.winner !== null) return { kind: 'invalid', message: 'Deze leg is al uitgespeeld.' };
  const rest = state.remaining[state.toThrow - 1];
  const add = (visit: Visit, checkoutDarts: CheckoutDarts | null = null): Leg => ({ ...leg, visits: [...leg.visits, visit], checkoutDarts });

  if ('bust' in input) {
    if (rest > 181) return { kind: 'invalid', message: 'Bust kan pas als de rest 181 of minder is.' };
    return { kind: 'bust', leg: add({ score: 0, bust: true }), reason: 'manual' };
  }
  const { score } = input;
  if (!isPossibleScore(score)) return { kind: 'invalid', message: score > 180 ? 'Meer dan 180 kan niet.' : `${score} kan je niet gooien met drie darts.` };
  if (score > rest) return { kind: 'bust', leg: add({ score: 0, bust: true }), reason: 'over' };
  if (rest - score === 1) return { kind: 'bust', leg: add({ score: 0, bust: true }), reason: 'one-left' };
  if (score === rest) {
    const options = checkoutOptions(score);
    if (options.length === 0) return { kind: 'bust', leg: add({ score: 0, bust: true }), reason: 'no-checkout' };
    const darts = input.checkoutDarts ?? (options.length === 1 ? options[0] : undefined);
    if (darts === undefined) return { kind: 'needs-darts', options };
    if (!options.includes(darts)) return { kind: 'invalid', message: `${score} uitgooien kan niet met ${darts} ${darts === 1 ? 'dart' : 'darts'}.` };
    return { kind: 'won', leg: add({ score, bust: false }, darts), winner: state.toThrow };
  }
  return { kind: 'scored', leg: add({ score, bust: false }) };
}

/** Laatste beurt ongedaan maken (ook een uitgooi). */
export function undoVisit(leg: Leg): Leg {
  if (leg.visits.length === 0) return leg;
  return { ...leg, visits: leg.visits.slice(0, -1), checkoutDarts: null };
}

/** Controle van een volledige of lopende leg (zelfde regels als de database). Geeft een foutmelding of null. */
export function validateLeg(leg: Leg): string | null {
  let current = newLeg(leg.starter);
  for (let i = 0; i < leg.visits.length; i++) {
    const v = leg.visits[i];
    const last = i === leg.visits.length - 1;
    const outcome = applyVisit(current, v.bust ? { bust: true } : { score: v.score, checkoutDarts: last && leg.checkoutDarts ? leg.checkoutDarts : undefined });
    if (outcome.kind === 'invalid') return `Beurt ${i + 1}: ${outcome.message}`;
    if (outcome.kind === 'needs-darts') return `Beurt ${i + 1}: het aantal darts voor de uitgooi ontbreekt.`;
    if (!v.bust && outcome.kind === 'bust') return `Beurt ${i + 1}: ${v.score} is een bust.`;
    if (outcome.kind === 'won' && !last) return `Beurt ${i + 1}: de leg was al uitgespeeld.`;
    current = outcome.leg;
  }
  if (leg.checkoutDarts !== null && legState(leg).winner === null) return 'Uitgooi zonder dat de leg uitgespeeld is.';
  return null;
}

export interface MatchScore {
  legs: [number, number];
  winner: Slot | null;
  need: number;
}

/** Legstand uit de afgewerkte legs. */
export function matchScore(legs: readonly Leg[], bestOf: number): MatchScore {
  const need = Math.floor(bestOf / 2) + 1;
  const won: [number, number] = [0, 0];
  for (const leg of legs) {
    const w = legState(leg).winner;
    if (w) won[w - 1]++;
  }
  const winner: Slot | null = won[0] >= need ? 1 : won[1] >= need ? 2 : null;
  return { legs: won, winner, need };
}

export interface DartsTotals {
  darts: number;
  points: number;
}

/** 3-dart gemiddelde (punten per drie darts), op 2 decimalen. */
export function threeDartAverage(t: DartsTotals | null | undefined): number | null {
  if (!t || t.darts === 0) return null;
  return Math.round((t.points / t.darts) * 3 * 100) / 100;
}

export interface X01Stats extends DartsTotals {
  count180: number;
  highestScore: number | null;
  /** Hoogste uitgooi vanaf HIGH_FINISH_MIN, anders null. */
  highestFinish: number | null;
}

/** Statistieken per speler over alle legs van een match. */
export function matchStats(legs: readonly Leg[]): [X01Stats, X01Stats] {
  const out: [X01Stats, X01Stats] = [
    { darts: 0, points: 0, count180: 0, highestScore: null, highestFinish: null },
    { darts: 0, points: 0, count180: 0, highestScore: null, highestFinish: null },
  ];
  for (const leg of legs) {
    const state = legState(leg);
    leg.visits.forEach((v, i) => {
      if (v.bust) return;
      const s = out[visitSlot(leg.starter, i) - 1];
      if (v.score === 180) s.count180++;
      s.highestScore = Math.max(s.highestScore ?? 0, v.score);
    });
    for (const k of [0, 1] as const) {
      out[k].darts += state.darts[k];
      out[k].points += state.points[k];
    }
    if (state.winner) {
      const finish = leg.visits[leg.visits.length - 1].score;
      const s = out[state.winner - 1];
      if (finish >= HIGH_FINISH_MIN) s.highestFinish = Math.max(s.highestFinish ?? 0, finish);
    }
  }
  return out;
}

/**
 * Gemiddelde per speler over de poulematchen, voor de tiebreak in de poule.
 * Enkel als *alle* gespeelde poulematchen (zonder walk-overs) van die speler
 * per beurt gescoord werden: anders vergelijk je een volledig gemiddelde met een half.
 */
export function poolAverages(matches: readonly Match[], totals: ReadonlyMap<MatchId, ReadonlyMap<PlayerId, DartsTotals>>): Map<PlayerId, number> {
  const sum = new Map<PlayerId, DartsTotals>();
  const incomplete = new Set<PlayerId>();
  for (const m of matches) {
    if (m.stage !== 'pool' || m.winner === null || m.walkover) continue;
    for (const p of [m.player1, m.player2]) {
      if (!p) continue;
      const t = totals.get(m.id)?.get(p);
      if (!t || t.darts === 0) {
        incomplete.add(p);
        continue;
      }
      const acc = sum.get(p) ?? { darts: 0, points: 0 };
      sum.set(p, { darts: acc.darts + t.darts, points: acc.points + t.points });
    }
  }
  const out = new Map<PlayerId, number>();
  for (const [p, t] of sum) {
    const avg = threeDartAverage(t);
    if (!incomplete.has(p) && avg !== null) out.set(p, avg);
  }
  return out;
}
