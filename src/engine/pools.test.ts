import { describe, expect, it } from 'vitest';
import { assignPools, createPoolMatches, roundRobinRounds } from './pools';
import { createRng } from './rng';

describe('slangverdeling', () => {
  it('verdeelt gerankte spelers heen en terug', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}`, seedRank: i + 1 }));
    const pools = assignPools(players, [4, 4], createRng(1));
    expect(pools[0].playerIds).toEqual(['s1', 's4', 's5', 's8']);
    expect(pools[1].playerIds).toEqual(['s2', 's3', 's6', 's7']);
  });

  it('plaatst nieuwe spelers willekeurig maar reproduceerbaar', () => {
    const players = [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `r${i + 1}`, seedRank: i + 1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `n${i + 1}` })),
    ];
    const a = assignPools(players, [4, 4, 5], createRng('avond-1'));
    const b = assignPools(players, [4, 4, 5], createRng('avond-1'));
    expect(a).toEqual(b);
    expect(a.map((p) => p.playerIds[0])).toEqual(['r1', 'r2', 'r3']);
    expect(a.flatMap((p) => p.playerIds).sort()).toEqual(players.map((p) => p.id).sort());
    expect(a.map((p) => p.playerIds.length)).toEqual([4, 4, 5]);
  });

  it('weigert een indeling die niet klopt met het aantal spelers', () => {
    expect(() => assignPools([{ id: 'a' }], [4], createRng(1))).toThrow();
  });
});

describe('round robin', () => {
  it('laat iedereen precies één keer tegen iedereen spelen', () => {
    for (let k = 2; k <= 8; k++) {
      const rounds = roundRobinRounds(k);
      const pairs = rounds.flat().map(([a, b]) => `${a}-${b}`);
      expect(new Set(pairs).size).toBe((k * (k - 1)) / 2);
      for (const round of rounds) {
        const inRound = round.flat();
        expect(new Set(inRound).size).toBe(inRound.length);
      }
    }
  });

  it('maakt poulematchen met unieke id\'s', () => {
    const matches = createPoolMatches(
      [
        { id: 'P1', label: 'Poule 1', playerIds: ['a', 'b', 'c', 'd'] },
        { id: 'P2', label: 'Poule 2', playerIds: ['e', 'f', 'g', 'h', 'i'] },
      ],
      3,
      0,
    );
    expect(matches).toHaveLength(6 + 10);
    expect(new Set(matches.map((m) => m.id)).size).toBe(16);
    expect(matches.every((m) => m.bestOf === 3 && m.stage === 'pool')).toBe(true);
  });
});
