/**
 * Doorstroming van de poules naar het A- en B-schema.
 *
 * De top k van elke poule gaat naar A, de rest naar B. Binnen eenzelfde
 * poulepositie (alle winnaars, alle tweedes, ...) worden spelers over de
 * poules heen vergeleken op: winstpercentage → legsaldo per match →
 * gewonnen legs per match → ranking → loting. Zo zijn poules van
 * verschillende grootte eerlijk te vergelijken.
 */

import { lotValue } from './rng';
import type { PoolStanding, StandingRow } from './standings';
import type { PlayerId } from './types';

export interface Qualifier {
  playerId: PlayerId;
  poolId: string;
  poolPosition: number;
  withdrawn: boolean;
}

export interface QualifyOptions {
  advance: number;
  lotSeed: string;
  seedRanks?: ReadonlyMap<PlayerId, number | null | undefined>;
}

function perMatch(value: number, played: number): number {
  return played === 0 ? 0 : value / played;
}

export function compareAcrossPools(opts: QualifyOptions) {
  return (a: StandingRow & { poolId: string }, b: StandingRow & { poolId: string }): number => {
    const keysA = [perMatch(a.won, a.played), perMatch(a.legDiff, a.played), perMatch(a.legsFor, a.played)];
    const keysB = [perMatch(b.won, b.played), perMatch(b.legDiff, b.played), perMatch(b.legsFor, b.played)];
    for (let i = 0; i < keysA.length; i++) {
      if (Math.abs(keysA[i] - keysB[i]) > 1e-9) return keysB[i] - keysA[i];
    }
    const rankA = opts.seedRanks?.get(a.playerId) ?? Number.POSITIVE_INFINITY;
    const rankB = opts.seedRanks?.get(b.playerId) ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA < rankB ? -1 : 1;
    return lotValue(opts.lotSeed, 'cross', a.playerId) - lotValue(opts.lotSeed, 'cross', b.playerId);
  };
}

/** Geeft A- en B-lijst terug in seedvolgorde (beste eerst). */
export function splitQualifiers(standings: readonly PoolStanding[], opts: QualifyOptions): { A: Qualifier[]; B: Qualifier[] } {
  const maxSize = Math.max(0, ...standings.map((s) => s.rows.length));
  const compare = compareAcrossPools(opts);
  const A: Qualifier[] = [];
  const B: Qualifier[] = [];
  for (let pos = 1; pos <= maxSize; pos++) {
    const rows = standings
      .flatMap((s) => s.rows.filter((r) => r.position === pos).map((r) => ({ ...r, poolId: s.poolId })))
      .sort(compare);
    for (const r of rows) {
      const q: Qualifier = { playerId: r.playerId, poolId: r.poolId, poolPosition: pos, withdrawn: r.withdrawn };
      (pos <= opts.advance ? A : B).push(q);
    }
  }
  // Opgegeven spelers achteraan: zo krijgen ze nooit een bye.
  const last = (list: Qualifier[]) => [...list.filter((q) => !q.withdrawn), ...list.filter((q) => q.withdrawn)];
  return { A: last(A), B: last(B) };
}
