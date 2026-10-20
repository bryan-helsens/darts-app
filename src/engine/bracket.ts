/**
 * KO-schema's (single elimination) met byes en poulescheiding.
 *
 * - Schemagrootte = kleinste macht van 2 ≥ aantal spelers; byes gaan naar de
 *   hoogste seeds (dus de beste poulewinnaars).
 * - Spelers uit dezelfde poule komen niet tegen elkaar in de eerste ronde en
 *   worden zo ver mogelijk uit elkaar gezet (verschillende helften, kwarten, ...).
 *   Daarvoor wordt binnen eenzelfde "laag" (alle winnaars, alle tweedes, ...)
 *   zo weinig mogelijk van de seedvolgorde afgeweken.
 */

import type { Qualifier } from './qualify';
import type { BracketLegs } from './settings';
import type { KnockoutStage, Match, PlayerId } from './types';

export function bracketSize(players: number): number {
  let size = 1;
  while (size < players) size *= 2;
  return size;
}

/** Seed per positie in het schema, bv. 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    order = order.flatMap((s) => [s, len + 1 - s]);
  }
  return order;
}

/**
 * Strengheid van de poulescheiding:
 * 3 = zo ver mogelijk uit elkaar op elk niveau, 2 = verschillende helften en
 * geen poulegenoot in ronde 1, 1 = enkel geen poulegenoot in ronde 1, 0 = geen.
 */
export type SeparationLevel = 0 | 1 | 2 | 3;

const SEARCH_BUDGET = 20_000;

class BudgetExceeded extends Error {}

function tryPlace(qualifiers: readonly Qualifier[], size: number, level: SeparationLevel): (Qualifier | null)[] | null {
  const m = qualifiers.length;
  const order = seedOrder(size);
  const slotOfSeed: number[] = [];
  order.forEach((seed, slot) => (slotOfSeed[seed] = slot));
  const depth = Math.log2(size);

  const stratumOf = (q: Qualifier) => (q.withdrawn ? 'W' : String(q.poolPosition));
  const totals = new Map<string, number>();
  for (const q of qualifiers) totals.set(q.poolId, (totals.get(q.poolId) ?? 0) + 1);

  const slots: (Qualifier | null)[] = Array(size).fill(null);
  const used: boolean[] = Array(m).fill(false);
  // counts[d] : sectie-index → poule → aantal
  const counts: Array<Map<number, Map<string, number>>> = Array.from({ length: depth + 1 }, () => new Map());
  const dLevels = level >= 3 ? Array.from({ length: Math.max(0, depth - 1) }, (_, i) => i + 1) : level === 2 ? [1] : [];
  let budget = SEARCH_BUDGET;

  const sectionCount = (d: number, section: number, pool: string) => counts[d].get(section)?.get(pool) ?? 0;
  const bump = (slot: number, pool: string, delta: number) => {
    for (const d of dLevels) {
      const section = Math.floor(slot / (size >> d));
      const map = counts[d].get(section) ?? new Map<string, number>();
      map.set(pool, (map.get(pool) ?? 0) + delta);
      counts[d].set(section, map);
    }
  };

  const ok = (q: Qualifier, slot: number): boolean => {
    if (level >= 1 && size >= 2) {
      const partner = slots[slot ^ 1];
      if (partner && partner.poolId === q.poolId) return false;
    }
    const total = totals.get(q.poolId) as number;
    for (const d of dLevels) {
      const section = Math.floor(slot / (size >> d));
      if (sectionCount(d, section, q.poolId) + 1 > Math.ceil(total / 2 ** d)) return false;
    }
    return true;
  };

  const search = (seedIndex: number): boolean => {
    if (seedIndex === m) return true;
    const slot = slotOfSeed[seedIndex + 1];
    const stratum = stratumOf(qualifiers[seedIndex]);
    for (let i = 0; i < m; i++) {
      if (used[i] || stratumOf(qualifiers[i]) !== stratum) continue;
      const q = qualifiers[i];
      if (--budget < 0) throw new BudgetExceeded();
      if (!ok(q, slot)) continue;
      used[i] = true;
      slots[slot] = q;
      bump(slot, q.poolId, 1);
      if (search(seedIndex + 1)) return true;
      bump(slot, q.poolId, -1);
      slots[slot] = null;
      used[i] = false;
    }
    return false;
  };

  try {
    return search(0) ? slots : null;
  } catch (e) {
    if (e instanceof BudgetExceeded) return null;
    throw e;
  }
}

/** Verdeelt de spelers over de posities van het schema. */
export function placeQualifiers(qualifiers: readonly Qualifier[]): { slots: (Qualifier | null)[]; level: SeparationLevel } {
  const size = bracketSize(qualifiers.length);
  for (const level of [3, 2, 1, 0] as const) {
    const slots = tryPlace(qualifiers, size, level);
    if (slots) return { slots, level };
  }
  throw new Error('Kon het schema niet opstellen');
}

export function bestOfForRound(legs: BracketLegs, round: number, rounds: number): number {
  const fromFinal = rounds - round;
  if (fromFinal === 0) return legs.final;
  if (fromFinal === 1) return legs.semi;
  return legs.early;
}

export function roundName(round: number, rounds: number): string {
  const fromFinal = rounds - round;
  if (fromFinal === 0) return 'Finale';
  if (fromFinal === 1) return 'Halve finale';
  if (fromFinal === 2) return 'Kwartfinale';
  return `1/${2 ** fromFinal} finale`;
}

export interface BuiltBracket {
  stage: KnockoutStage;
  participants: PlayerId[];
  slots: (PlayerId | null)[];
  level: SeparationLevel;
  matches: Match[];
}

export function knockoutMatchId(stage: KnockoutStage, round: number, index: number): string {
  return `${stage}-R${round}-${index + 1}`;
}

export function buildKnockout(
  stage: KnockoutStage,
  qualifiers: readonly Qualifier[],
  legs: BracketLegs,
  createdAt: number,
): BuiltBracket {
  const participants = qualifiers.map((q) => q.playerId);
  if (qualifiers.length <= 1) {
    return { stage, participants, slots: participants, level: 3, matches: [] };
  }
  const { slots, level } = placeQualifiers(qualifiers);
  const size = slots.length;
  const rounds = Math.log2(size);
  const grid: Match[][] = [];
  for (let r = 1; r <= rounds; r++) {
    const row: Match[] = [];
    for (let i = 0; i < size >> r; i++) {
      row.push({
        id: knockoutMatchId(stage, r, i),
        stage,
        round: r,
        position: i,
        poolId: null,
        player1: null,
        player2: null,
        bestOf: bestOfForRound(legs, r, rounds),
        legs1: null,
        legs2: null,
        winner: null,
        walkover: false,
        next: r < rounds ? { matchId: knockoutMatchId(stage, r + 1, i >> 1), slot: ((i % 2) + 1) as 1 | 2 } : null,
        loserNext: null,
        createdAt,
        finishedAt: null,
        board: null,
      });
    }
    grid.push(row);
  }

  const skip = new Set<string>();
  grid[0].forEach((match, i) => {
    const a = slots[2 * i]?.playerId ?? null;
    const b = slots[2 * i + 1]?.playerId ?? null;
    if (a && b) {
      match.player1 = a;
      match.player2 = b;
      return;
    }
    // Bye: de speler gaat rechtstreeks naar ronde 2.
    skip.add(match.id);
    const player = a ?? b;
    if (player && rounds >= 2) {
      const target = grid[1][i >> 1];
      if (i % 2 === 0) target.player1 = player;
      else target.player2 = player;
    }
  });

  return {
    stage,
    participants,
    slots: slots.map((q) => q?.playerId ?? null),
    level,
    matches: grid.flat().filter((m) => !skip.has(m.id)),
  };
}
