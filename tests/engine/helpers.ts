import type { Match } from '../../src/engine';

let counter = 0;

/** Afgewerkte match voor handgemaakte testgevallen. */
export function played(p1: string, p2: string, legs1: number, legs2: number, extra: Partial<Match> = {}): Match {
  counter++;
  return {
    id: extra.id ?? `m${counter}`,
    stage: 'pool',
    round: 1,
    position: 0,
    poolId: 'P1',
    player1: p1,
    player2: p2,
    bestOf: 3,
    legs1,
    legs2,
    winner: legs1 > legs2 ? p1 : p2,
    walkover: false,
    next: null,
    loserNext: null,
    createdAt: 0,
    finishedAt: counter,
    board: null,
    ...extra,
  };
}

/** Open match (nog niet gespeeld). */
export function open(id: string, p1: string | null, p2: string | null, extra: Partial<Match> = {}): Match {
  return {
    id,
    stage: 'pool',
    round: 1,
    position: 0,
    poolId: 'P1',
    player1: p1,
    player2: p2,
    bestOf: 3,
    legs1: null,
    legs2: null,
    winner: null,
    walkover: false,
    next: null,
    loserNext: null,
    createdAt: 0,
    finishedAt: null,
    board: null,
    ...extra,
  };
}

export const MIN = 60_000;
