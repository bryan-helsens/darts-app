/**
 * Seizoensranking.
 *
 * Per avond telt het totaal (plaatsingspunten + deelnamepunten). Met "beste X
 * van Y" tellen enkel de X beste avonden. Tiebreakers: aantal overwinningen
 * op een avond → beste resultaat → onderling resultaat → gewonnen legs →
 * loting.
 */

import { lotValue } from './rng';
import type { BestOfSettings } from './settings';
import { rankGroups, tally, type Tally } from './standings';
import type { Match, PlayerId } from './types';

export interface EventResultRow {
  eventId: string;
  playerId: PlayerId;
  placeFrom: number;
  placeTo: number;
  /** Totaal van die avond (plaatsing + deelname). */
  points: number;
}

export interface RankingRow {
  position: number;
  playerId: PlayerId;
  /** Punten die meetellen (beste X). */
  counted: number;
  /** Alle punten samen. */
  total: number;
  events: number;
  wins: number;
  bestPlace: number;
  legsWon: number;
  /** Avonden die meetellen. */
  countedEventIds: string[];
  byLot: boolean;
}

export function seasonRanking(
  results: readonly EventResultRow[],
  matches: readonly Match[],
  bestOf: BestOfSettings,
  lotSeed: string,
): RankingRow[] {
  const byPlayer = new Map<PlayerId, EventResultRow[]>();
  for (const r of results) {
    const list = byPlayer.get(r.playerId) ?? [];
    list.push(r);
    byPlayer.set(r.playerId, list);
  }
  const players = [...byPlayer.keys()];
  const legs = new Map<PlayerId, number>(players.map((p) => [p, 0]));
  for (const m of matches) {
    if (m.winner === null) continue;
    if (m.player1 && legs.has(m.player1)) legs.set(m.player1, (legs.get(m.player1) as number) + (m.legs1 ?? 0));
    if (m.player2 && legs.has(m.player2)) legs.set(m.player2, (legs.get(m.player2) as number) + (m.legs2 ?? 0));
  }

  const base = new Map(
    players.map((p) => {
      const list = byPlayer.get(p) as EventResultRow[];
      const sorted = [...list].sort((a, b) => b.points - a.points || a.placeFrom - b.placeFrom);
      const countedList = bestOf.enabled ? sorted.slice(0, bestOf.count) : sorted;
      return [
        p,
        {
          playerId: p,
          counted: countedList.reduce((s, r) => s + r.points, 0),
          total: list.reduce((s, r) => s + r.points, 0),
          events: list.length,
          wins: list.filter((r) => r.placeFrom === 1).length,
          bestPlace: Math.min(...list.map((r) => r.placeFrom)),
          legsWon: legs.get(p) as number,
          countedEventIds: countedList.map((r) => r.eventId),
        },
      ];
    }),
  );

  const resolveHeadToHead = (ids: PlayerId[]): PlayerId[][] => {
    if (ids.length <= 1) return [ids];
    const mini = tally(ids, matches);
    const groups = rankGroups(ids, (id) => {
      const t = mini.get(id) as Tally;
      return [t.won];
    });
    if (groups.length > 1) return groups.flatMap(resolveHeadToHead);
    return rankGroups(ids, (id) => [base.get(id)!.legsWon]);
  };

  const blocks = rankGroups(players, (id) => {
    const b = base.get(id)!;
    return [b.counted, b.wins, -b.bestPlace];
  }).flatMap(resolveHeadToHead);

  const rows: RankingRow[] = [];
  for (const block of blocks) {
    const byLot = block.length > 1;
    const ordered = byLot ? [...block].sort((a, b) => lotValue(lotSeed, a) - lotValue(lotSeed, b)) : block;
    for (const id of ordered) rows.push({ position: rows.length + 1, ...base.get(id)!, byLot });
  }
  return rows;
}
