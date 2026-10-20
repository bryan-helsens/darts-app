/**
 * Poulerangschikking.
 *
 * Volgorde: gewonnen matchen → legsaldo → gewonnen legs → onderling resultaat
 * → hoogste gemiddelde (als dat voor iedereen gekend is) → barrage → loting.
 * Spelers die opgaven, staan altijd onderaan hun poule.
 */

import { lotValue } from './rng';
import type { Match, PlayerId, Pool } from './types';
import { isFinished } from './types';

export interface Tally {
  played: number;
  won: number;
  lost: number;
  legsFor: number;
  legsAgainst: number;
}

export interface StandingRow extends Tally {
  playerId: PlayerId;
  /** 1-based. */
  position: number;
  legDiff: number;
  withdrawn: boolean;
  /** Positie (mede) bepaald door loting. */
  byLot: boolean;
}

export interface PoolStanding {
  poolId: string;
  rows: StandingRow[];
  /** Alle poulematchen zijn gespeeld. */
  complete: boolean;
  /** Groepen die enkel door loting gescheiden zijn, in volgorde van de stand. */
  lotGroups: PlayerId[][];
}

export interface StandingsOptions {
  lotSeed: string;
  withdrawn?: ReadonlySet<PlayerId>;
  averages?: ReadonlyMap<PlayerId, number>;
}

export function emptyTally(): Tally {
  return { played: 0, won: 0, lost: 0, legsFor: 0, legsAgainst: 0 };
}

export function tally(playerIds: readonly PlayerId[], matches: readonly Match[]): Map<PlayerId, Tally> {
  const set = new Set(playerIds);
  const out = new Map<PlayerId, Tally>(playerIds.map((id) => [id, emptyTally()]));
  for (const m of matches) {
    if (!isFinished(m) || !m.player1 || !m.player2) continue;
    if (!set.has(m.player1) || !set.has(m.player2)) continue;
    const t1 = out.get(m.player1) as Tally;
    const t2 = out.get(m.player2) as Tally;
    t1.played++;
    t2.played++;
    t1.legsFor += m.legs1 ?? 0;
    t1.legsAgainst += m.legs2 ?? 0;
    t2.legsFor += m.legs2 ?? 0;
    t2.legsAgainst += m.legs1 ?? 0;
    if (m.winner === m.player1) {
      t1.won++;
      t2.lost++;
    } else {
      t2.won++;
      t1.lost++;
    }
  }
  return out;
}

/** Sorteert op sleutels (hoger = beter) en groepeert gelijke sleutels. */
export function rankGroups<T>(items: readonly T[], keys: (item: T) => number[]): T[][] {
  const withKeys = items.map((item) => ({ item, k: keys(item) }));
  withKeys.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) {
      if (a.k[i] !== b.k[i]) return b.k[i] - a.k[i];
    }
    return 0;
  });
  const groups: T[][] = [];
  let prev: number[] | null = null;
  for (const { item, k } of withKeys) {
    if (prev && k.every((v, i) => v === (prev as number[])[i])) groups[groups.length - 1].push(item);
    else groups.push([item]);
    prev = k;
  }
  return groups;
}

const mainKeys = (t: Tally) => [t.won, t.legsFor - t.legsAgainst, t.legsFor];

export function poolStandings(pool: Pool, matches: readonly Match[], opts: StandingsOptions): PoolStanding {
  const withdrawn = opts.withdrawn ?? new Set<PlayerId>();
  const poolMatches = matches.filter((m) => m.stage === 'pool' && m.poolId === pool.id);
  const barrages = matches.filter((m) => m.stage === 'barrage' && m.poolId === pool.id);
  const totals = tally(pool.playerIds, poolMatches);

  const between = (list: readonly Match[], ids: readonly PlayerId[]) => {
    const set = new Set(ids);
    return list.filter((m) => m.player1 !== null && m.player2 !== null && set.has(m.player1) && set.has(m.player2));
  };

  const resolveByBarrage = (ids: PlayerId[]): PlayerId[][] => {
    if (ids.length <= 1) return [ids];
    const relevant = between(barrages, ids);
    if (relevant.length === 0 || !relevant.every(isFinished)) return [ids];
    const t = tally(ids, relevant);
    const groups = rankGroups(ids, (id) => {
      const x = t.get(id) as Tally;
      return [x.won, x.legsFor - x.legsAgainst];
    });
    if (groups.length === 1) return [ids];
    return groups.flatMap(resolveByBarrage);
  };

  const resolveTie = (ids: PlayerId[]): PlayerId[][] => {
    if (ids.length <= 1) return [ids];
    // Onderling resultaat (mini-competitie tussen de gelijk staande spelers).
    const mini = tally(ids, between(poolMatches, ids));
    const groups = rankGroups(ids, (id) => mainKeys(mini.get(id) as Tally));
    if (groups.length > 1) return groups.flatMap(resolveTie);
    // Gemiddelde, alleen als het voor iedereen gekend is.
    const avg = opts.averages;
    if (avg && ids.every((id) => avg.has(id))) {
      const byAvg = rankGroups(ids, (id) => [avg.get(id) as number]);
      if (byAvg.length > 1) return byAvg.flatMap(resolveByBarrage);
    }
    return resolveByBarrage(ids);
  };

  const orderSet = (ids: PlayerId[]) =>
    rankGroups(ids, (id) => mainKeys(totals.get(id) as Tally)).flatMap(resolveTie);

  const active = pool.playerIds.filter((id) => !withdrawn.has(id));
  const out = pool.playerIds.filter((id) => withdrawn.has(id));
  const blocks = [...orderSet(active), ...orderSet(out)];

  const rows: StandingRow[] = [];
  const lotGroups: PlayerId[][] = [];
  for (const block of blocks) {
    const byLot = block.length > 1;
    const ordered = byLot
      ? [...block].sort((a, b) => lotValue(opts.lotSeed, pool.id, a) - lotValue(opts.lotSeed, pool.id, b))
      : block;
    if (byLot) lotGroups.push(ordered);
    for (const id of ordered) {
      const t = totals.get(id) as Tally;
      rows.push({
        playerId: id,
        position: rows.length + 1,
        ...t,
        legDiff: t.legsFor - t.legsAgainst,
        withdrawn: withdrawn.has(id),
        byLot,
      });
    }
  }

  return {
    poolId: pool.id,
    rows,
    complete: poolMatches.every(isFinished),
    lotGroups,
  };
}

export interface BarrageNeed {
  poolId: string;
  playerIds: PlayerId[];
  /** Sleutel om een gekozen loting te onthouden. */
  key: string;
  /** Plaatsen waarover het gaat, bv. 2 en 3. */
  positions: number[];
}

export function barrageKey(poolId: string, playerIds: readonly PlayerId[]): string {
  return `${poolId}:${[...playerIds].sort().join(',')}`;
}

/**
 * Een barrage is nodig als een gelijke stand die enkel door loting beslist
 * wordt, over de grens A/B loopt. Een gekozen loting (acceptedLots) of een
 * reeds aangemaakte barrage heft de nood op.
 */
export function barrageNeeds(
  standing: PoolStanding,
  advance: number,
  matches: readonly Match[],
  acceptedLots: ReadonlySet<string> = new Set(),
): BarrageNeed[] {
  if (!standing.complete) return [];
  const needs: BarrageNeed[] = [];
  for (const group of standing.lotGroups) {
    const rows = standing.rows.filter((r) => group.includes(r.playerId));
    if (rows.some((r) => r.withdrawn)) continue;
    const positions = rows.map((r) => r.position);
    const straddles = Math.min(...positions) <= advance && Math.max(...positions) > advance;
    if (!straddles) continue;
    const key = barrageKey(standing.poolId, group);
    if (acceptedLots.has(key)) continue;
    const set = new Set(group);
    const hasBarrage = matches.some(
      (m) =>
        m.stage === 'barrage' &&
        m.poolId === standing.poolId &&
        m.player1 !== null &&
        m.player2 !== null &&
        set.has(m.player1) &&
        set.has(m.player2),
    );
    if (hasBarrage) continue;
    needs.push({ poolId: standing.poolId, playerIds: [...group], key, positions });
  }
  return needs;
}

/** Barrage: ieder tegen ieder binnen de groep (bij 2 spelers één match). */
export function createBarrageMatches(
  need: BarrageNeed,
  bestOf: number,
  createdAt: number,
  existing: readonly Match[],
): Match[] {
  const offset = existing.filter((m) => m.stage === 'barrage' && m.poolId === need.poolId).length;
  const out: Match[] = [];
  const ids = need.playerIds;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push({
        id: `${need.poolId}-BAR-${offset + out.length + 1}`,
        stage: 'barrage',
        round: 1,
        position: offset + out.length,
        poolId: need.poolId,
        player1: ids[i],
        player2: ids[j],
        bestOf,
        legs1: null,
        legs2: null,
        winner: null,
        walkover: false,
        next: null,
        loserNext: null,
        createdAt,
        finishedAt: null,
        board: null,
      });
    }
  }
  return out;
}
