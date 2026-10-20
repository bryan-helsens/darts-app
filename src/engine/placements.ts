/**
 * Eindplaatsen van een speelavond.
 *
 * Het A-schema bepaalt de plaatsen 1 t.e.m. het aantal A-spelers, gedeeld per
 * ronde waarin iemand uitgeschakeld werd (3–4, 5–8, ...). Het B-schema bepaalt
 * de plaatsen daarna: de B-winnaar wordt eerste na de laatste A-plaats.
 */

import type { KnockoutStage, Match, PlayerId } from './types';
import { isFinished, loserOf } from './types';

export interface Placement {
  playerId: PlayerId;
  /** Gedeelde plaats: from t.e.m. to (bv. 5–8). */
  from: number;
  to: number;
  stage: KnockoutStage;
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

export function formatPlace(from: number, to: number): string {
  return from === to ? `${from}` : `${from}–${to}`;
}
