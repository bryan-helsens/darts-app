/**
 * Spelers over poules verdelen (slangverdeling) en poulematchen aanmaken.
 */

import type { Rng } from './rng';
import type { EventPlayer, Match, Pool } from './types';

export function poolId(index: number): string {
  return `P${index + 1}`;
}

/**
 * Slangverdeling: gerankte spelers eerst (sterkste eerst), heen en terug over
 * de poules, zodat de sterkste spelers in verschillende poules zitten.
 * Spelers zonder ranking vullen de overige plaatsen in willekeurige volgorde.
 */
export function assignPools(players: readonly EventPlayer[], sizes: readonly number[], rng: Rng): Pool[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total !== players.length) {
    throw new Error(`Indeling voor ${total} spelers, maar er zijn ${players.length} spelers`);
  }

  const ranked = players.filter((p) => p.seedRank != null);
  const unranked = players.filter((p) => p.seedRank == null);
  // Willekeurig schudden vóór het sorteren: gelijke rankings worden zo geloot.
  const rankedOrder = rng.shuffle(ranked).sort((a, b) => (a.seedRank as number) - (b.seedRank as number));
  const order = [...rankedOrder, ...rng.shuffle(unranked)];

  // Plaatsen in slangvolgorde: rij 0 links→rechts, rij 1 rechts→links, ...
  const slots: number[] = [];
  const maxSize = Math.max(...sizes);
  for (let row = 0; row < maxSize; row++) {
    const poolsInRow = sizes.map((s, i) => (s > row ? i : -1)).filter((i) => i >= 0);
    if (row % 2 === 1) poolsInRow.reverse();
    slots.push(...poolsInRow);
  }

  const pools: Pool[] = sizes.map((_, i) => ({ id: poolId(i), label: `Poule ${i + 1}`, playerIds: [] }));
  order.forEach((player, i) => pools[slots[i]].playerIds.push(player.id));
  return pools;
}

/** Round robin volgens de cirkelmethode: per ronde een lijst van paren (indexen). */
export function roundRobinRounds(count: number): Array<Array<[number, number]>> {
  const list: number[] = Array.from({ length: count }, (_, i) => i);
  if (count % 2 === 1) list.push(-1);
  const n = list.length;
  const rounds: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== -1 && b !== -1) pairs.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Roteren met de eerste vast.
    list.splice(1, 0, list.pop() as number);
  }
  return rounds;
}

export function createPoolMatches(pools: readonly Pool[], bestOf: number, createdAt: number): Match[] {
  const matches: Match[] = [];
  for (const pool of pools) {
    roundRobinRounds(pool.playerIds.length).forEach((pairs, r) => {
      pairs.forEach(([a, b], i) => {
        matches.push({
          id: `${pool.id}-R${r + 1}-${i + 1}`,
          stage: 'pool',
          round: r + 1,
          position: i,
          poolId: pool.id,
          player1: pool.playerIds[a],
          player2: pool.playerIds[b],
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
      });
    });
  }
  return matches;
}
