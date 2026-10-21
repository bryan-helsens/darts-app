/**
 * Schema-formats zonder poules:
 *  - double elimination: winnaarsschema (W), verliezersschema (L) en één grote
 *    finale (GF) tussen beide winnaars, zonder herkansing;
 *  - enkelvoudige eliminatie met troostschema: hoofdschema (M) en plate (P).
 *    Zijn er byes, dan gaan alle verliezers van ronde 1 én ronde 2 naar de
 *    plate (ook wie in ronde 1 een bye had); zonder byes enkel ronde 1. Zo
 *    speelt iedereen minstens twee matchen.
 *
 * Het schema wordt eerst symbolisch opgebouwd op een raster van 2^k plaatsen:
 * elke plaats krijgt een bron (speler, bye, winnaar of verliezer van een
 * knoop). `resolveBracket` lost dat in één beweging op: een knoop met twee
 * bronnen wordt een echte match, met één bron een doorgeefmatch (die speler
 * schuift door zonder te spelen) en zonder bronnen valt hij weg. Byes in het
 * winnaarsschema, lege plaatsen in het verliezersschema en byes in de plate
 * werken zo allemaal op dezelfde manier.
 */

import { bestOfForRound, bracketSize, roundName, seedOrder } from './bracket';
import type { Rng } from './rng';
import type { LegsSettings } from './settings';
import type { EliminationFormat, EliminationStage, EventPlayer, Match, PlayerId, Stage } from './types';

export type BracketSource =
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'bye' }
  | { kind: 'winner'; node: string }
  | { kind: 'loser'; node: string };

export interface BracketNode {
  id: string;
  stage: EliminationStage;
  round: number;
  /** Plaats in de ronde van het volledige raster (0-based). */
  position: number;
  bestOf: number;
  sources: [BracketSource, BracketSource];
}

export type NodeKind = 'real' | 'pass' | 'dead';

type Effective = { kind: 'player'; playerId: PlayerId } | { kind: 'winner' | 'loser'; node: string } | null;

export const MIN_BRACKET_PLAYERS = 4;

export function eliminationMatchId(stage: EliminationStage, round: number, index: number): string {
  return `${stage}-R${round}-${index + 1}`;
}

/**
 * Zet symbolische knopen (in topologische volgorde) om naar matchen met
 * `next`/`loserNext`. Doorgeefmatchen en lege knopen verdwijnen.
 */
export function resolveBracket(nodes: readonly BracketNode[], createdAt: number): { matches: Match[]; kinds: Map<string, NodeKind> } {
  const kinds = new Map<string, NodeKind>();
  const passOut = new Map<string, Effective>();
  const effective = new Map<string, [Effective, Effective]>();
  const usedWinner = new Set<string>();
  const usedLoser = new Set<string>();

  const resolve = (s: BracketSource, at: string): Effective => {
    if (s.kind === 'player') return { kind: 'player', playerId: s.playerId };
    if (s.kind === 'bye') return null;
    const kind = kinds.get(s.node);
    if (kind === undefined) throw new Error(`${at} verwijst naar ${s.node}, dat (nog) niet bestaat`);
    const used = s.kind === 'winner' ? usedWinner : usedLoser;
    if (used.has(s.node)) throw new Error(`De ${s.kind === 'winner' ? 'winnaar' : 'verliezer'} van ${s.node} gaat naar twee plaatsen`);
    used.add(s.node);
    if (kind === 'real') return { kind: s.kind, node: s.node };
    // Doorgeefmatch: de enige speler schuift door, er is geen verliezer.
    return kind === 'pass' && s.kind === 'winner' ? (passOut.get(s.node) as Effective) : null;
  };

  for (const node of nodes) {
    if (kinds.has(node.id)) throw new Error(`Dubbele knoop ${node.id}`);
    const pair: [Effective, Effective] = [resolve(node.sources[0], node.id), resolve(node.sources[1], node.id)];
    const present = pair.filter((e) => e !== null);
    kinds.set(node.id, present.length === 2 ? 'real' : present.length === 1 ? 'pass' : 'dead');
    if (present.length === 1) passOut.set(node.id, present[0]);
    effective.set(node.id, pair);
  }

  const matches = new Map<string, Match>();
  for (const node of nodes) {
    if (kinds.get(node.id) !== 'real') continue;
    const [a, b] = effective.get(node.id) as [Effective, Effective];
    matches.set(node.id, {
      id: node.id,
      stage: node.stage,
      round: node.round,
      position: node.position,
      poolId: null,
      player1: a?.kind === 'player' ? a.playerId : null,
      player2: b?.kind === 'player' ? b.playerId : null,
      bestOf: node.bestOf,
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
  for (const node of nodes) {
    if (kinds.get(node.id) !== 'real') continue;
    (effective.get(node.id) as [Effective, Effective]).forEach((e, i) => {
      if (!e || e.kind === 'player') return;
      const from = matches.get(e.node) as Match;
      const ref = { matchId: node.id, slot: (i + 1) as 1 | 2 };
      if (e.kind === 'winner') from.next = ref;
      else from.loserNext = ref;
    });
  }
  return { matches: [...matches.values()], kinds };
}

/**
 * Seedvolgorde zoals bij de poules: gerankte spelers op ranking (gelijken
 * geloot), daarna de spelers zonder ranking in willekeurige volgorde.
 */
export function seedPlayers(players: readonly EventPlayer[], rng: Rng): PlayerId[] {
  const ranked = players.filter((p) => p.seedRank != null);
  const unranked = players.filter((p) => p.seedRank == null);
  return [...rng.shuffle(ranked).sort((a, b) => (a.seedRank as number) - (b.seedRank as number)), ...rng.shuffle(unranked)].map((p) => p.id);
}

/** Eerste ronde: seed per plaats volgens `seedOrder`, byes voor de hoogste seeds. */
function firstRoundSources(seeds: readonly PlayerId[], size: number): BracketSource[] {
  return seedOrder(size).map((seed) => (seed <= seeds.length ? { kind: 'player', playerId: seeds[seed - 1] } : { kind: 'bye' }));
}

/** Gewoon KO-schema als knopen: ronde 1 uit `first`, daarna telkens de winnaars. */
function singleElimNodes(stage: EliminationStage, first: readonly BracketSource[], bestOf: (round: number, rounds: number) => number): BracketNode[] {
  const size = first.length;
  const rounds = Math.log2(size);
  const nodes: BracketNode[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < size >> r; i++) {
      nodes.push({
        id: eliminationMatchId(stage, r, i),
        stage,
        round: r,
        position: i,
        bestOf: bestOf(r, rounds),
        sources:
          r === 1
            ? [first[2 * i], first[2 * i + 1]]
            : [
                { kind: 'winner', node: eliminationMatchId(stage, r - 1, 2 * i) },
                { kind: 'winner', node: eliminationMatchId(stage, r - 1, 2 * i + 1) },
              ],
      });
    }
  }
  return nodes;
}

/**
 * Double elimination. Verliezersschema: L1 = de verliezers van W1 onderling;
 * daarna afwisselend een instroomronde (winnaars van L tegen de verliezers van
 * de volgende W-ronde) en een ronde onder de winnaars van L. In elke oneven
 * instroomronde komen de W-verliezers in omgekeerde volgorde binnen: zo
 * treffen spelers elkaar zo laat mogelijk opnieuw (in L1 en L2 nooit).
 */
export function doubleElimNodes(seeds: readonly PlayerId[], legs: LegsSettings): BracketNode[] {
  const size = bracketSize(seeds.length);
  const k = Math.log2(size);
  const w = singleElimNodes('W', firstRoundSources(seeds, size), (r, rounds) => (r >= rounds - 1 ? legs.A.semi : legs.A.early));
  const lRounds = 2 * (k - 1);
  const lBestOf = (r: number) => bestOfForRound(legs.B, r, lRounds);
  const l: BracketNode[] = [];
  const L = (round: number, index: number) => eliminationMatchId('L', round, index);
  const W = (round: number, index: number) => eliminationMatchId('W', round, index);
  // L1: verliezers van W1 per twee.
  for (let i = 0; i < size >> 2; i++) {
    l.push({
      id: L(1, i),
      stage: 'L',
      round: 1,
      position: i,
      bestOf: lBestOf(1),
      sources: [
        { kind: 'loser', node: W(1, 2 * i) },
        { kind: 'loser', node: W(1, 2 * i + 1) },
      ],
    });
  }
  for (let j = 1; j <= k - 1; j++) {
    // Instroomronde L(2j): winnaars van L(2j−1) tegen de verliezers van W(j+1).
    const count = size >> (j + 1);
    for (let i = 0; i < count; i++) {
      const drop = j % 2 === 1 ? count - 1 - i : i;
      l.push({
        id: L(2 * j, i),
        stage: 'L',
        round: 2 * j,
        position: i,
        bestOf: lBestOf(2 * j),
        sources: [
          { kind: 'winner', node: L(2 * j - 1, i) },
          { kind: 'loser', node: W(j + 1, drop) },
        ],
      });
    }
    if (j === k - 1) break;
    // Ronde L(2j+1): de winnaars van L(2j) onderling.
    for (let i = 0; i < count >> 1; i++) {
      l.push({
        id: L(2 * j + 1, i),
        stage: 'L',
        round: 2 * j + 1,
        position: i,
        bestOf: lBestOf(2 * j + 1),
        sources: [
          { kind: 'winner', node: L(2 * j, 2 * i) },
          { kind: 'winner', node: L(2 * j, 2 * i + 1) },
        ],
      });
    }
  }
  const gf: BracketNode = {
    id: eliminationMatchId('GF', 1, 0),
    stage: 'GF',
    round: 1,
    position: 0,
    bestOf: legs.A.final,
    sources: [
      { kind: 'winner', node: W(k, 0) },
      { kind: 'winner', node: L(lRounds, 0) },
    ],
  };
  return [...w, ...l, gf];
}

const PLATE_SEARCH_BUDGET = 50_000;

/**
 * Enkelvoudige eliminatie met plate. De verliezers uit ronde 2 zijn de
 * topseeds van de plate (en krijgen dus eerst de byes); de verliezers uit
 * ronde 1 worden zo verdeeld dat niemand in zijn eerste plate-match de speler
 * terugziet die hem net uitschakelde.
 */
export function plateNodes(seeds: readonly PlayerId[], legs: LegsSettings): BracketNode[] {
  const size = bracketSize(seeds.length);
  const first = firstRoundSources(seeds, size);
  const main = singleElimNodes('M', first, (r, rounds) => bestOfForRound(legs.A, r, rounds));
  const byes = size - seeds.length;

  type Entrant = { node: string; round: 1 | 2; position: number };
  const r2: Entrant[] = byes > 0 ? Array.from({ length: size >> 2 }, (_, i) => ({ node: eliminationMatchId('M', 2, i), round: 2 as const, position: i })) : [];
  const r1: Entrant[] = [];
  for (let i = 0; i < size >> 1; i++) {
    if (first[2 * i].kind === 'player' && first[2 * i + 1].kind === 'player') r1.push({ node: eliminationMatchId('M', 1, i), round: 1, position: i });
  }
  const entrants = r2.length + r1.length;
  const plateSize = bracketSize(entrants);
  const order = seedOrder(plateSize);
  const slotOfSeed: number[] = [];
  order.forEach((seed, slot) => (slotOfSeed[seed] = slot));
  const isBye = (slot: number) => order[slot] > entrants;

  // Eerste tegenstander: het kleinste naburige blok met minstens één speler.
  const firstBlock = (slot: number): number[] => {
    for (let level = 0; (1 << level) < plateSize; level++) {
      const start = ((slot >> level) ^ 1) << level;
      const block = Array.from({ length: 1 << level }, (_, i) => start + i).filter((s) => !isBye(s));
      if (block.length > 0) return block;
    }
    return [];
  };
  const conflict = (a: Entrant, b: Entrant) =>
    (a.round === 1 && b.round === 2 && b.position === a.position >> 1) || (a.round === 2 && b.round === 1 && a.position === b.position >> 1);

  // Seeds 1..m: verliezers uit ronde 2 (in eender welke volgorde), daarna die uit ronde 1.
  const slots: (Entrant | null)[] = Array(plateSize).fill(null);
  const used = new Set<Entrant>();
  let budget = PLATE_SEARCH_BUDGET;
  const fits = (e: Entrant, slot: number) => {
    for (const s of firstBlock(slot)) if (slots[s] && conflict(e, slots[s] as Entrant)) return false;
    for (let s = 0; s < plateSize; s++) {
      const other = slots[s];
      if (other && firstBlock(s).includes(slot) && conflict(e, other)) return false;
    }
    return true;
  };
  // Eerst de verliezers uit ronde 1 (zij hebben de vaste plaatsen), dan die uit ronde 2.
  const fillOrder = [...Array.from({ length: r1.length }, (_, i) => r2.length + i + 1), ...Array.from({ length: r2.length }, (_, i) => i + 1)];
  const place = (index: number): boolean => {
    if (index === fillOrder.length) return true;
    const seed = fillOrder[index];
    const slot = slotOfSeed[seed];
    for (const e of seed <= r2.length ? r2 : r1) {
      if (used.has(e) || --budget < 0) continue;
      if (!fits(e, slot)) continue;
      used.add(e);
      slots[slot] = e;
      if (place(index + 1)) return true;
      slots[slot] = null;
      used.delete(e);
    }
    return false;
  };
  if (!place(0)) {
    // Geen verdeling zonder herkansing mogelijk (bv. 5 spelers): gewoon in volgorde.
    slots.fill(null);
    [...r2, ...r1].forEach((e, i) => (slots[slotOfSeed[i + 1]] = e));
  }

  const plateFirst: BracketSource[] = slots.map((e) => (e ? { kind: 'loser', node: e.node } : { kind: 'bye' }));
  const plate = singleElimNodes('P', plateFirst, (r, rounds) => bestOfForRound(legs.B, r, rounds));
  return [...main, ...plate];
}

export interface BuiltElimination {
  format: EliminationFormat;
  /** Seedvolgorde (1 = topseed). */
  seeds: PlayerId[];
  size: number;
  byes: number;
  /** Aantal spelers in de plate (enkel bij single_elim_plate). */
  plateSize: number | null;
  matches: Match[];
}

/** Bouwt het schema uit een vaste seedvolgorde (deterministisch). */
export function buildElimination(format: EliminationFormat, seeds: readonly PlayerId[], legs: LegsSettings, createdAt: number): BuiltElimination {
  if (seeds.length < MIN_BRACKET_PLAYERS) throw new Error(`Minstens ${MIN_BRACKET_PLAYERS} spelers nodig voor dit format.`);
  if (new Set(seeds).size !== seeds.length) throw new Error('Een speler staat twee keer in de seedlijst.');
  const nodes = format === 'double_elim' ? doubleElimNodes(seeds, legs) : plateNodes(seeds, legs);
  const { matches } = resolveBracket(nodes, createdAt);
  const size = bracketSize(seeds.length);
  const plate = matches.filter((m) => m.stage === 'P').length;
  return {
    format,
    seeds: [...seeds],
    size,
    byes: size - seeds.length,
    plateSize: format === 'single_elim_plate' ? plate + 1 : null,
    matches,
  };
}

export function startBracket(input: {
  format: EliminationFormat;
  players: readonly EventPlayer[];
  legs: LegsSettings;
  rng: Rng;
  createdAt: number;
}): BuiltElimination {
  return buildElimination(input.format, seedPlayers(input.players, input.rng), input.legs, input.createdAt);
}

// ---------------------------------------------------------------------------
// Namen
// ---------------------------------------------------------------------------

export const STAGE_NAMES: Record<Stage, string> = {
  pool: 'Poules',
  barrage: 'Barrages',
  A: 'A-schema',
  B: 'B-schema',
  W: 'Winnaarsschema',
  L: 'Verliezersschema',
  GF: 'Grote finale',
  M: 'Hoofdschema',
  P: 'Plate',
};

/** Naam van een ronde, bv. "Winnaarsfinale", "Verliezers ronde 3", "Plate halve finale". */
export function stageRoundName(stage: Stage, round: number, rounds: number): string {
  switch (stage) {
    case 'W':
      if (round === rounds) return 'Winnaarsfinale';
      if (round === rounds - 1) return 'Winnaars halve finale';
      return `Winnaars ronde ${round}`;
    case 'L':
      return round === rounds ? 'Verliezersfinale' : `Verliezers ronde ${round}`;
    case 'GF':
      return 'Grote finale';
    case 'P':
      if (round === rounds) return 'Plate-finale';
      if (round === rounds - 1) return 'Plate halve finale';
      return `Plate ronde ${round}`;
    case 'pool':
      return `Ronde ${round}`;
    case 'barrage':
      return 'Barrage';
    default:
      return roundName(round, rounds);
  }
}
