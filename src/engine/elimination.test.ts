import { describe, expect, it } from 'vitest';
import {
  buildElimination,
  resolveBracket,
  seedPlayers,
  stageRoundName,
  startBracket,
  type BracketNode,
  type BuiltElimination,
} from './elimination';
import { eliminationPlacements } from './placements';
import { applyResult, autoWalkovers, walkoverLegs } from './results';
import { createRng, type Rng } from './rng';
import { DEFAULT_LEGS } from './settings';
import type { EliminationFormat, Match, PlayerId } from './types';
import { isEventFinal, isFinished } from './types';

const FORMATS: EliminationFormat[] = ['double_elim', 'single_elim_plate'];
const seedsFor = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

/** Structuur: unieke id's, geldige verwijzingen, elke plaats precies één bron, geen lussen. */
function structureErrors(b: BuiltElimination): string[] {
  const errors: string[] = [];
  const byId = new Map(b.matches.map((m) => [m.id, m]));
  if (byId.size !== b.matches.length) errors.push('dubbele id');
  const incoming = new Map<string, number>();
  const bump = (key: string) => incoming.set(key, (incoming.get(key) ?? 0) + 1);
  for (const m of b.matches) {
    if (m.player1) bump(`${m.id}:1`);
    if (m.player2) bump(`${m.id}:2`);
    for (const ref of [m.next, m.loserNext]) {
      if (!ref) continue;
      if (!byId.has(ref.matchId)) errors.push(`${m.id} → onbekende ${ref.matchId}`);
      bump(`${ref.matchId}:${ref.slot}`);
    }
  }
  for (const m of b.matches) {
    for (const slot of [1, 2]) {
      const count = incoming.get(`${m.id}:${slot}`) ?? 0;
      if (count !== 1) errors.push(`${m.id} plaats ${slot}: ${count} bronnen`);
    }
  }
  // Lussen: elke match moet in een topologische volgorde passen.
  const indegree = new Map(b.matches.map((m) => [m.id, 0]));
  for (const m of b.matches) for (const ref of [m.next, m.loserNext]) if (ref) indegree.set(ref.matchId, (indegree.get(ref.matchId) ?? 0) + 1);
  const queue = b.matches.filter((m) => indegree.get(m.id) === 0);
  let seen = 0;
  while (queue.length) {
    const m = queue.pop() as Match;
    seen++;
    for (const ref of [m.next, m.loserNext]) {
      if (!ref) continue;
      indegree.set(ref.matchId, (indegree.get(ref.matchId) as number) - 1);
      if (indegree.get(ref.matchId) === 0) queue.push(byId.get(ref.matchId) as Match);
    }
  }
  if (seen !== b.matches.length) errors.push('lus in het schema');
  if (b.matches.filter((m) => isEventFinal(m)).length !== 1) errors.push('niet precies één finale van de avond');
  return errors;
}

/** Speelt alles uit met willekeurige uitslagen; geeft de matchen terug. */
function playOut(b: BuiltElimination, rng: Rng, withdrawn: ReadonlySet<PlayerId> = new Set()): Match[] {
  let matches = autoWalkovers(b.matches, withdrawn, 0);
  for (let t = 1; t < 10_000; t++) {
    const open = matches.filter((m) => !isFinished(m) && m.player1 && m.player2);
    if (open.length === 0) break;
    const m = rng.pick(open);
    matches = applyResult(matches, m.id, { ...walkoverLegs(m.bestOf, rng.next() < 0.5), finishedAt: t });
    matches = autoWalkovers(matches, withdrawn, t);
  }
  return matches;
}

/** Tegenstanders per speler, in volgorde van spelen. */
function opponents(matches: readonly Match[]): Map<PlayerId, Array<{ match: Match; opponent: PlayerId }>> {
  const out = new Map<PlayerId, Array<{ match: Match; opponent: PlayerId }>>();
  for (const m of [...matches].filter((x) => x.finishedAt !== null).sort((a, b) => (a.finishedAt as number) - (b.finishedAt as number))) {
    for (const [p, o] of [
      [m.player1, m.player2],
      [m.player2, m.player1],
    ] as Array<[PlayerId, PlayerId]>) {
      out.set(p, [...(out.get(p) ?? []), { match: m, opponent: o }]);
    }
  }
  return out;
}

function placementErrors(matches: readonly Match[], n: number): string[] {
  const { placements, complete } = eliminationPlacements(matches);
  const errors: string[] = [];
  if (!complete) errors.push('niet afgerond');
  if (placements.length !== n || new Set(placements.map((p) => p.playerId)).size !== n) errors.push(`${placements.length} plaatsen voor ${n} spelers`);
  const ranges = new Map<string, number>();
  for (const p of placements) ranges.set(`${p.from}-${p.to}`, (ranges.get(`${p.from}-${p.to}`) ?? 0) + 1);
  let expected = 1;
  for (const [key, count] of [...ranges].sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]))) {
    const [from, to] = key.split('-').map(Number);
    if (from !== expected || to - from + 1 !== count) errors.push(`plaats ${key} × ${count}, verwacht vanaf ${expected}`);
    expected = to + 1;
  }
  const final = matches.find(isEventFinal) as Match;
  if (placements.find((p) => p.from === 1)?.playerId !== final.winner) errors.push('winnaar van de finale is niet eerste');
  return errors;
}

describe('schema-formats', () => {
  for (const format of FORMATS) {
    describe(format, () => {
      it('structuur en aantal matchen voor 4–64 spelers', () => {
        for (let n = 4; n <= 64; n++) {
          const b = buildElimination(format, seedsFor(n), DEFAULT_LEGS, 0);
          expect(structureErrors(b), `${n} spelers`).toEqual([]);
          if (format === 'double_elim') {
            expect(b.matches.length, `${n} spelers`).toBe(2 * n - 2);
          } else {
            const plate = b.matches.filter((m) => m.stage === 'P').length;
            expect(b.matches.filter((m) => m.stage === 'M').length, `${n} spelers`).toBe(n - 1);
            const expectedPlate = b.byes > 0 ? n - b.size / 4 : b.size / 2;
            expect(plate + 1, `${n} spelers`).toBe(expectedPlate);
            expect(b.plateSize).toBe(expectedPlate);
          }
          // Byes voor de topseeds: zij spelen niet in ronde 1.
          const r1Stage = format === 'double_elim' ? 'W' : 'M';
          const inR1 = new Set(b.matches.filter((m) => m.stage === r1Stage && m.round === 1).flatMap((m) => [m.player1, m.player2]));
          const withBye = b.seeds.filter((p) => !inR1.has(p));
          expect(withBye, `${n} spelers`).toEqual(b.seeds.slice(0, b.byes));
        }
      });

      it('50 willekeurige avonden per aantal spelers: speelbaar, iedereen 2 matchen, plaatsen 1..n', () => {
        for (let n = 4; n <= 64; n++) {
          const b = buildElimination(format, seedsFor(n), DEFAULT_LEGS, 0);
          const rng = createRng(`${format}-${n}`);
          for (let run = 0; run < 50; run++) {
            const matches = playOut(b, rng);
            expect(matches.every(isFinished), `${n} spelers, run ${run}`).toBe(true);
            const played = opponents(matches);
            const fewer = b.seeds.filter((p) => (played.get(p)?.length ?? 0) < 2);
            expect(fewer, `${n} spelers, run ${run}`).toEqual([]);
            expect(placementErrors(matches, n), `${n} spelers, run ${run}`).toEqual([]);
          }
        }
      });
    });
  }

  it('double elimination: geen herkansing in L1 en L2 (vanaf 8 spelers)', () => {
    for (let n = 8; n <= 64; n++) {
      const b = buildElimination('double_elim', seedsFor(n), DEFAULT_LEGS, 0);
      const rng = createRng(`l12-${n}`);
      for (let run = 0; run < 30; run++) {
        const matches = playOut(b, rng);
        const history = opponents(matches);
        for (const m of matches.filter((x) => x.stage === 'L' && x.round <= 2 && !x.walkover)) {
          const before = (history.get(m.player1 as string) ?? []).filter((h) => (h.match.finishedAt as number) < (m.finishedAt as number));
          expect(before.map((h) => h.opponent), `${n} spelers, ${m.id}`).not.toContain(m.player2);
        }
      }
    }
  });

  it('plate: niemand treft in zijn eerste plate-match zijn vorige tegenstander', () => {
    for (let n = 4; n <= 64; n++) {
      // Met 5 spelers is dat onmogelijk: 3 spelers in de plate, één bye.
      if (n === 5) continue;
      const b = buildElimination('single_elim_plate', seedsFor(n), DEFAULT_LEGS, 0);
      const rng = createRng(`plate-${n}`);
      for (let run = 0; run < 30; run++) {
        const matches = playOut(b, rng);
        const history = opponents(matches);
        for (const [player, list] of history) {
          const firstPlate = list.findIndex((h) => h.match.stage === 'P');
          if (firstPlate <= 0) continue;
          const earlier = list.slice(0, firstPlate).map((h) => h.opponent);
          expect(earlier, `${n} spelers, ${player} in ${list[firstPlate].match.id}`).not.toContain(list[firstPlate].opponent);
        }
      }
    }
  });

  it('double elimination met 8 spelers: vaste plaatsen per ronde', () => {
    const b = buildElimination('double_elim', seedsFor(8), DEFAULT_LEGS, 0);
    const matches = playOut(b, createRng('acht'));
    const ranges = eliminationPlacements(matches).placements.map((p) => `${p.from}-${p.to}`);
    // 1, 2, 3, 4, 5–6, 7–8
    expect([...new Set(ranges)]).toEqual(['1-1', '2-2', '3-3', '4-4', '5-6', '7-8']);
    const gf = matches.find((m) => m.stage === 'GF') as Match;
    const lFinal = matches.find((m) => m.stage === 'L' && m.next?.matchId === gf.id) as Match;
    const second = eliminationPlacements(matches).placements.find((p) => p.from === 2)?.playerId;
    const third = eliminationPlacements(matches).placements.find((p) => p.from === 3)?.playerId;
    expect(second).toBe(gf.winner === gf.player1 ? gf.player2 : gf.player1);
    expect(third).toBe(lFinal.winner === lFinal.player1 ? lFinal.player2 : lFinal.player1);
  });

  it('plate met 12 spelers: hoofdschema eerst, dan de plate', () => {
    const b = buildElimination('single_elim_plate', seedsFor(12), DEFAULT_LEGS, 0);
    // 16er-schema, 4 byes: 4 matchen in ronde 1, alle verliezers van ronde 1 en 2 naar de plate (4 + 4 = 8).
    expect(b.byes).toBe(4);
    expect(b.plateSize).toBe(8);
    const matches = playOut(b, createRng('twaalf'));
    const p = eliminationPlacements(matches).placements;
    // Hoofdschema: 1, 2, 3–4; plate: 5, 6, 7–8, 9–12.
    expect([...new Set(p.map((x) => `${x.from}-${x.to}`))]).toEqual(['1-1', '2-2', '3-4', '5-5', '6-6', '7-8', '9-12']);
    expect(p.filter((x) => x.from >= 5).every((x) => x.stage === 'P')).toBe(true);
  });

  it('legs volgen het seizoen', () => {
    const de = buildElimination('double_elim', seedsFor(16), DEFAULT_LEGS, 0).matches;
    expect(de.find((m) => m.id === 'GF-R1-1')?.bestOf).toBe(DEFAULT_LEGS.A.final);
    expect(de.find((m) => m.id === 'W-R1-1')?.bestOf).toBe(DEFAULT_LEGS.A.early);
    expect(de.find((m) => m.id === 'W-R4-1')?.bestOf).toBe(DEFAULT_LEGS.A.semi);
    expect(de.find((m) => m.id === 'L-R6-1')?.bestOf).toBe(DEFAULT_LEGS.B.final);
    expect(de.find((m) => m.id === 'L-R1-1')?.bestOf).toBe(DEFAULT_LEGS.B.early);
    const plate = buildElimination('single_elim_plate', seedsFor(16), DEFAULT_LEGS, 0).matches;
    expect(plate.find((m) => m.id === 'M-R4-1')?.bestOf).toBe(DEFAULT_LEGS.A.final);
    expect(plate.find((m) => m.id === 'P-R3-1')?.bestOf).toBe(DEFAULT_LEGS.B.final);
  });

  it('deterministisch per seed; seeding zoals bij de poules', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, seedRank: i < 6 ? 6 - i : null }));
    const a = startBracket({ format: 'double_elim', players, legs: DEFAULT_LEGS, rng: createRng('x'), createdAt: 0 });
    const b = startBracket({ format: 'double_elim', players, legs: DEFAULT_LEGS, rng: createRng('x'), createdAt: 0 });
    expect(a).toEqual(b);
    expect(a.seeds.slice(0, 6)).toEqual(['p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
    expect(new Set(seedPlayers(players, createRng('y')).slice(6))).toEqual(new Set(['p7', 'p8', 'p9', 'p10']));
  });

  it('een opgave wordt een walk-over, ook in het verliezersschema', () => {
    for (const format of FORMATS) {
      const b = buildElimination(format, seedsFor(11), DEFAULT_LEGS, 0);
      const matches = playOut(b, createRng(`opgave-${format}`), new Set(['s3']));
      expect(matches.every(isFinished)).toBe(true);
      const ofS3 = matches.filter((m) => m.player1 === 's3' || m.player2 === 's3');
      expect(ofS3.every((m) => m.walkover && m.winner !== 's3')).toBe(true);
      expect(placementErrors(matches, 11)).toEqual([]);
    }
  });

  it('resolveBracket: byes schuiven door, lege knopen vallen weg', () => {
    const nodes: BracketNode[] = [
      { id: 'X-1', stage: 'M', round: 1, position: 0, bestOf: 3, sources: [{ kind: 'player', playerId: 'a' }, { kind: 'bye' }] },
      { id: 'X-2', stage: 'M', round: 1, position: 1, bestOf: 3, sources: [{ kind: 'player', playerId: 'b' }, { kind: 'player', playerId: 'c' }] },
      { id: 'X-3', stage: 'M', round: 2, position: 0, bestOf: 3, sources: [{ kind: 'winner', node: 'X-1' }, { kind: 'winner', node: 'X-2' }] },
      { id: 'Y-1', stage: 'P', round: 1, position: 0, bestOf: 3, sources: [{ kind: 'loser', node: 'X-1' }, { kind: 'loser', node: 'X-2' }] },
      { id: 'Y-2', stage: 'P', round: 1, position: 1, bestOf: 3, sources: [{ kind: 'bye' }, { kind: 'bye' }] },
    ];
    const { matches, kinds } = resolveBracket(nodes, 0);
    expect([...kinds]).toEqual([
      ['X-1', 'pass'],
      ['X-2', 'real'],
      ['X-3', 'real'],
      ['Y-1', 'pass'],
      ['Y-2', 'dead'],
    ]);
    expect(matches.map((m) => m.id)).toEqual(['X-2', 'X-3']);
    expect(matches[1].player1).toBe('a');
    expect(matches[0].next).toEqual({ matchId: 'X-3', slot: 2 });
    // De verliezer van X-2 gaat via een doorgeefmatch nergens heen: Y-1 bestaat niet.
    expect(matches[0].loserNext).toBeNull();
    expect(() => resolveBracket([nodes[2]], 0)).toThrow(/bestaat/);
  });

  it('weigert te weinig spelers', () => {
    expect(() => buildElimination('double_elim', seedsFor(3), DEFAULT_LEGS, 0)).toThrow(/Minstens 4/);
  });

  it('rondenamen', () => {
    expect(stageRoundName('W', 4, 4)).toBe('Winnaarsfinale');
    expect(stageRoundName('W', 3, 4)).toBe('Winnaars halve finale');
    expect(stageRoundName('L', 6, 6)).toBe('Verliezersfinale');
    expect(stageRoundName('L', 2, 6)).toBe('Verliezers ronde 2');
    expect(stageRoundName('GF', 1, 1)).toBe('Grote finale');
    expect(stageRoundName('M', 3, 4)).toBe('Halve finale');
    expect(stageRoundName('P', 3, 3)).toBe('Plate-finale');
  });
});
