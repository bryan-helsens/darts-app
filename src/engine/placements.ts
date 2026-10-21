/**
 * Eindplaatsen van een speelavond.
 *
 * Poules + A/B: het A-schema bepaalt de plaatsen 1 t.e.m. het aantal
 * A-spelers, gedeeld per ronde waarin iemand uitgeschakeld werd (3–4, 5–8,
 * ...). Het B-schema bepaalt de plaatsen daarna: de B-winnaar wordt eerste na
 * de laatste A-plaats.
 *
 * Schema-formats: de plaats volgt de ronde waarin iemand definitief
 * uitgeschakeld wordt (een verlies zonder `loserNext`), gedeeld per ronde.
 * Double elimination: winnaar en verliezer van de grote finale, dan de
 * verliezersfinale, dan de vroegere L-rondes. Plate: eerst het hoofdschema,
 * dan de plate (winnaar, finalist, vroegere rondes).
 */

import type { BracketStage, KnockoutStage, Match, PlayerId, TournamentFormat } from './types';
import { isEventFinal, isFinished, loserOf } from './types';

export interface Placement {
  playerId: PlayerId;
  /** Gedeelde plaats: from t.e.m. to (bv. 5–8). */
  from: number;
  to: number;
  stage: BracketStage;
}

export interface BracketPlacements {
  placements: Placement[];
  complete: boolean;
}

export function bracketPlacements(
  stage: KnockoutStage,
  matches: readonly Match[],
  participants: readonly PlayerId[],
  offset: number,
): BracketPlacements {
  const own = matches.filter((m) => m.stage === stage);
  if (participants.length === 0) return { placements: [], complete: true };
  if (participants.length === 1) {
    return { placements: [{ playerId: participants[0], from: offset + 1, to: offset + 1, stage }], complete: true };
  }
  const rounds = Math.max(...own.map((m) => m.round));
  const perRound = new Map<number, number>();
  for (const m of own) perRound.set(m.round, (perRound.get(m.round) ?? 0) + 1);
  const aliveAfter = (round: number) => (round === rounds ? 1 : 2 * (perRound.get(round + 1) ?? 0));

  const placements: Placement[] = [];
  for (const m of own) {
    if (!isFinished(m)) continue;
    const loser = loserOf(m) as PlayerId;
    const from = offset + aliveAfter(m.round) + 1;
    const to = offset + aliveAfter(m.round) + (perRound.get(m.round) as number);
    placements.push({ playerId: loser, from, to, stage });
    if (m.round === rounds) {
      placements.push({ playerId: m.winner as PlayerId, from: offset + 1, to: offset + 1, stage });
    }
  }
  return { placements, complete: own.every(isFinished) };
}

export interface KnockoutParticipants {
  A: PlayerId[];
  B: PlayerId[];
}

export function eventPlacements(matches: readonly Match[], ko: KnockoutParticipants): BracketPlacements {
  const a = bracketPlacements('A', matches, ko.A, 0);
  const b = bracketPlacements('B', matches, ko.B, ko.A.length);
  const placements = [...a.placements, ...b.placements].sort((x, y) => x.from - y.from || x.playerId.localeCompare(y.playerId));
  return { placements, complete: a.complete && b.complete };
}

const ELIMINATION_RANK: Partial<Record<BracketStage, number>> = { GF: 0, W: 1, L: 2, M: 0, P: 1 };

export function eliminationPlacements(matches: readonly Match[]): BracketPlacements {
  const own = matches.filter((m) => ELIMINATION_RANK[m.stage as BracketStage] !== undefined);
  // Groepen: wie in dezelfde ronde definitief uitgeschakeld wordt, deelt de plaats.
  // De winnaar van een laatste match (finale, plate-finale) staat net boven de verliezer.
  type Group = { stage: BracketStage; round: number; winner: boolean; size: number };
  const groups = new Map<string, Group>();
  const keyOf = (stage: BracketStage, round: number, winner: boolean) => `${stage}:${round}:${winner ? 'w' : 'l'}`;
  for (const m of own) {
    const stage = m.stage as BracketStage;
    if (m.next === null) groups.set(keyOf(stage, m.round, true), { stage, round: m.round, winner: true, size: 1 });
    if (m.loserNext === null) {
      const key = keyOf(stage, m.round, false);
      const g = groups.get(key) ?? { stage, round: m.round, winner: false, size: 0 };
      g.size++;
      groups.set(key, g);
    }
  }
  const final = own.find(isEventFinal);
  const ordered = [...groups.entries()].sort(([, a], [, b]) => {
    // De winnaar van de finale van de avond altijd eerst.
    const fa = final && a.winner && a.stage === final.stage && a.round === final.round ? 0 : 1;
    const fb = final && b.winner && b.stage === final.stage && b.round === final.round ? 0 : 1;
    return fa - fb || (ELIMINATION_RANK[a.stage] as number) - (ELIMINATION_RANK[b.stage] as number) || b.round - a.round || Number(b.winner) - Number(a.winner);
  });
  const from = new Map<string, number>();
  let place = 1;
  for (const [key, g] of ordered) {
    from.set(key, place);
    place += g.size;
  }

  const placements: Placement[] = [];
  for (const m of own) {
    if (!isFinished(m)) continue;
    const stage = m.stage as BracketStage;
    if (m.loserNext === null) {
      const key = keyOf(stage, m.round, false);
      const start = from.get(key) as number;
      placements.push({ playerId: loserOf(m) as PlayerId, from: start, to: start + (groups.get(key) as Group).size - 1, stage });
    }
    if (m.next === null) {
      const start = from.get(keyOf(stage, m.round, true)) as number;
      placements.push({ playerId: m.winner as PlayerId, from: start, to: start, stage });
    }
  }
  placements.sort((x, y) => x.from - y.from || x.playerId.localeCompare(y.playerId));
  return { placements, complete: own.length > 0 && own.every(isFinished) };
}

/** Eindplaatsen volgens het format van de avond. */
export function formatPlacements(format: TournamentFormat, matches: readonly Match[], ko: KnockoutParticipants | null): BracketPlacements {
  if (format === 'poules_ab') return ko ? eventPlacements(matches, ko) : { placements: [], complete: false };
  return eliminationPlacements(matches);
}

export function formatPlace(from: number, to: number): string {
  return from === to ? `${from}` : `${from}–${to}`;
}
