/**
 * Het verloop van een avond met het standaardformat (poules + A/B-schema),
 * samengesteld uit de losse bouwstenen. Wordt gebruikt door de UI, de
 * seed-generator en de tests.
 */

import { buildKnockout, type BuiltBracket } from './bracket';
import type { KnockoutParticipants } from './placements';
import { assignPools, createPoolMatches } from './pools';
import { splitQualifiers } from './qualify';
import type { Rng } from './rng';
import type { LegsSettings } from './settings';
import { barrageNeeds, poolStandings, type BarrageNeed, type PoolStanding } from './standings';
import type { EventPlayer, Match, PlayerId, Pool } from './types';
import { isFinished } from './types';

export function startPools(input: {
  players: readonly EventPlayer[];
  sizes: readonly number[];
  bestOf: number;
  rng: Rng;
  createdAt: number;
}): { pools: Pool[]; matches: Match[] } {
  const pools = assignPools(input.players, input.sizes, input.rng);
  return { pools, matches: createPoolMatches(pools, input.bestOf, input.createdAt) };
}

export interface PoolPhaseStatus {
  standings: PoolStanding[];
  /** Alle poulematchen gespeeld. */
  poolsComplete: boolean;
  /** Barrages die nog beslist moeten worden (spelen of loten). */
  barrageNeeds: BarrageNeed[];
  /** Er lopen nog barragematchen. */
  barragesOpen: boolean;
  readyForKnockout: boolean;
}

export function poolPhaseStatus(input: {
  pools: readonly Pool[];
  matches: readonly Match[];
  advance: number;
  lotSeed: string;
  withdrawn?: ReadonlySet<PlayerId>;
  acceptedLots?: ReadonlySet<string>;
  averages?: ReadonlyMap<PlayerId, number>;
}): PoolPhaseStatus {
  const standings = input.pools.map((pool) =>
    poolStandings(pool, input.matches, { lotSeed: input.lotSeed, withdrawn: input.withdrawn, averages: input.averages }),
  );
  const poolsComplete = standings.every((s) => s.complete);
  const needs = poolsComplete
    ? standings.flatMap((s) => barrageNeeds(s, input.advance, input.matches, input.acceptedLots))
    : [];
  const barragesOpen = input.matches.some((m) => m.stage === 'barrage' && !isFinished(m));
  return {
    standings,
    poolsComplete,
    barrageNeeds: needs,
    barragesOpen,
    readyForKnockout: poolsComplete && needs.length === 0 && !barragesOpen,
  };
}

export interface GeneratedKnockouts {
  A: BuiltBracket;
  B: BuiltBracket;
  matches: Match[];
  participants: KnockoutParticipants;
}

export function generateKnockouts(input: {
  standings: readonly PoolStanding[];
  advance: number;
  legs: LegsSettings;
  lotSeed: string;
  seedRanks?: ReadonlyMap<PlayerId, number | null | undefined>;
  createdAt: number;
}): GeneratedKnockouts {
  const { A, B } = splitQualifiers(input.standings, {
    advance: input.advance,
    lotSeed: input.lotSeed,
    seedRanks: input.seedRanks,
  });
  const a = buildKnockout('A', A, input.legs.A, input.createdAt);
  const b = buildKnockout('B', B, input.legs.B, input.createdAt);
  return {
    A: a,
    B: b,
    matches: [...a.matches, ...b.matches],
    participants: { A: a.participants, B: b.participants },
  };
}
