/**
 * Schrijver-suggestie: wie noteert de score aan een bord?
 *
 * Net als de bordplanning wordt dit niet opgeslagen maar afgeleid, zodat elk
 * toestel dezelfde suggestie toont. Kandidaten spelen nu niet, gaven niet op,
 * zijn nog geen schrijver aan een ander bord en spelen niet de volgende match
 * op hetzelfde bord. Per bezet bord, in deze volgorde:
 *  1. de verliezer van de vorige match op dat bord;
 *  2. de speler die het langst niet meer speelde (wie nog niet speelde eerst,
 *     bij gelijkheid op loting).
 * Wie straks op een ander bord moet spelen, komt pas aan bod als er niemand
 * anders vrij is.
 */

import { lotValue } from './rng';
import type { ScheduleResult } from './scheduler';
import { loserOf, type Match, type MatchId, type PlayerId } from './types';

export interface ScorerInput {
  matches: readonly Match[];
  /** Huidige toestand van de borden (replay tot nu). */
  replay: ScheduleResult;
  /** Per bord de eerstvolgende (voorspelde) match, indien gekend. */
  upcoming?: ReadonlyMap<number, { matchId: MatchId }>;
  withdrawn: ReadonlySet<PlayerId>;
  /** Seed voor de loting bij gelijkheid (bv. de rng-seed van de avond). */
  seed: string;
}

/** Per bezet bord de voorgestelde schrijver (of null als niemand vrij is). */
export function suggestScorers(input: ScorerInput): Map<number, PlayerId | null> {
  const { matches, replay, upcoming, withdrawn, seed } = input;
  const byId = new Map(matches.map((m) => [m.id, m]));
  const playersOf = (id: MatchId | null | undefined): PlayerId[] => {
    const m = id ? byId.get(id) : undefined;
    return m ? [m.player1, m.player2].filter((p): p is PlayerId => p !== null) : [];
  };

  const participants = new Set<PlayerId>();
  for (const m of matches) for (const p of [m.player1, m.player2]) if (p) participants.add(p);

  const playing = new Set<PlayerId>();
  for (const b of replay.boards) for (const p of playersOf(b.matchId)) playing.add(p);
  // Wie in de eerstvolgende match van een bord speelt, en op welk bord.
  const nextBoardOf = new Map<PlayerId, number>();
  for (const [board, a] of upcoming ?? []) for (const p of playersOf(a.matchId)) if (!nextBoardOf.has(p)) nextBoardOf.set(p, board);

  // Laatste einde per speler (walk-overs tellen niet: dan werd er niet gespeeld).
  const lastEnd = new Map<PlayerId, number>();
  for (const m of matches) {
    if (m.finishedAt === null || m.walkover) continue;
    for (const p of [m.player1, m.player2]) if (p) lastEnd.set(p, Math.max(lastEnd.get(p) ?? -Infinity, m.finishedAt));
  }

  const out = new Map<number, PlayerId | null>();
  const chosen = new Set<PlayerId>();

  for (const board of [...replay.boards].filter((b) => b.matchId).sort((a, b) => a.board - b.board)) {
    /** 0 = vrij, 1 = enkel als niemand anders kan, null = uitgesloten. */
    const tier = (p: PlayerId | null | undefined): 0 | 1 | null => {
      if (!p || !participants.has(p) || withdrawn.has(p) || playing.has(p) || chosen.has(p)) return null;
      const nextBoard = nextBoardOf.get(p);
      if (nextBoard === board.board) return null;
      return nextBoard === undefined ? 0 : 1;
    };
    const previous = replay.assignments
      .filter((a) => a.board === board.board && a.end !== null && !a.interrupted && a.end <= replay.at && a.matchId !== board.matchId)
      .sort((a, b) => (b.end as number) - (a.end as number))[0];
    const prevMatch = previous ? byId.get(previous.matchId) : undefined;
    const loser = prevMatch && !prevMatch.walkover ? loserOf(prevMatch) : null;
    const idleFirst = (a: PlayerId, b: PlayerId) =>
      (lastEnd.get(a) ?? -Infinity) - (lastEnd.get(b) ?? -Infinity) ||
      lotValue(seed, 'scorer', board.matchId as string, a) - lotValue(seed, 'scorer', board.matchId as string, b);

    let pick: PlayerId | null = null;
    for (const level of [0, 1] as const) {
      if (loser && tier(loser) === level) pick = loser;
      else pick = [...participants].filter((p) => tier(p) === level).sort(idleFirst)[0] ?? null;
      if (pick) break;
    }
    if (pick) chosen.add(pick);
    out.set(board.board, pick);
  }
  return out;
}
