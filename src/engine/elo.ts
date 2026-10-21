/**
 * Elo-rating: het niveau van een speler over alle avonden en seizoenen heen.
 *
 * Net als de bordplanning wordt Elo niet opgeslagen maar telkens berekend uit
 * alle gespeelde matchen, in chronologische volgorde. Correcties, samengevoegde
 * en geanonimiseerde spelers kloppen zo altijd vanzelf.
 *
 * - Verwachte score: E = 1 / (1 + 10^((Rtegenstander − Reigen) / 400)).
 * - Nieuwe rating: R + K × (uitslag − E), met uitslag 1 (winst) of 0 (verlies).
 * - Elke speler gebruikt zijn eigen K: de nieuwkomers-K voor zijn eerste
 *   matchen, daarna de gewone K. De instellingen komen van het seizoen van
 *   de match.
 * - Walk-overs tellen niet mee: er werd niet gespeeld.
 */

import type { EloSettings } from './settings';
import type { PlayerId } from './types';

export interface EloMatch {
  id: string;
  eventId: string;
  /** Datum van de avond, "jjjj-mm-dd" (eerste sorteersleutel). */
  date: string;
  /** Eindtijd (ms) binnen de avond; null = onbekend. */
  finishedAt: number | null;
  player1: PlayerId;
  player2: PlayerId;
  winner: PlayerId;
  walkover: boolean;
}

export interface EloPoint {
  matchId: string;
  eventId: string;
  date: string;
  before: number;
  after: number;
}

export interface EloResult {
  ratings: Map<PlayerId, number>;
  /** Aantal meegetelde matchen per speler. */
  matches: Map<PlayerId, number>;
  /** Verloop per speler, in chronologische volgorde. */
  history: Map<PlayerId, EloPoint[]>;
}

export function expectedScore(own: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - own) / 400));
}

/** Chronologisch: datum, dan eindtijd, dan id (zodat de volgorde altijd vastligt). */
export function eloOrder(a: EloMatch, b: EloMatch): number {
  return a.date.localeCompare(b.date) || (a.finishedAt ?? 0) - (b.finishedAt ?? 0) || a.id.localeCompare(b.id);
}

export function computeElo(matches: readonly EloMatch[], settingsFor: (m: EloMatch) => EloSettings): EloResult {
  const ratings = new Map<PlayerId, number>();
  const counts = new Map<PlayerId, number>();
  const history = new Map<PlayerId, EloPoint[]>();

  for (const m of [...matches].sort(eloOrder)) {
    if (m.walkover || m.player1 === m.player2) continue;
    if (m.winner !== m.player1 && m.winner !== m.player2) continue;
    const s = settingsFor(m);
    const r1 = ratings.get(m.player1) ?? s.start;
    const r2 = ratings.get(m.player2) ?? s.start;
    const k = (p: PlayerId) => ((counts.get(p) ?? 0) < s.newcomerMatches ? s.newcomerK : s.k);
    const score1 = m.winner === m.player1 ? 1 : 0;
    const n1 = r1 + k(m.player1) * (score1 - expectedScore(r1, r2));
    const n2 = r2 + k(m.player2) * (1 - score1 - expectedScore(r2, r1));
    for (const [p, before, after] of [
      [m.player1, r1, n1],
      [m.player2, r2, n2],
    ] as const) {
      ratings.set(p, after);
      counts.set(p, (counts.get(p) ?? 0) + 1);
      history.set(p, [...(history.get(p) ?? []), { matchId: m.id, eventId: m.eventId, date: m.date, before, after }]);
    }
  }
  return { ratings, matches: counts, history };
}

/**
 * Seedingrangen op Elo (1 = sterkste) voor de gegeven spelers. Wie nog geen
 * enkele Elo-match speelde, krijgt geen rang en wordt dus willekeurig verdeeld.
 */
export function eloSeedRanks(elo: EloResult, players: readonly PlayerId[]): Map<PlayerId, number> {
  const rated = players.filter((p) => (elo.matches.get(p) ?? 0) > 0);
  rated.sort((a, b) => (elo.ratings.get(b) ?? 0) - (elo.ratings.get(a) ?? 0) || a.localeCompare(b));
  return new Map(rated.map((p, i) => [p, i + 1]));
}

/** Elo-verschil over één avond (laatste rating na − eerste rating voor), of null. */
export function eloChangeForEvent(history: readonly EloPoint[] | undefined, eventId: string): number | null {
  const points = (history ?? []).filter((h) => h.eventId === eventId);
  if (points.length === 0) return null;
  return points[points.length - 1].after - points[0].before;
}
