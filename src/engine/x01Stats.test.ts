import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { legState, matchStats, type Leg } from './x01';
import { simulateLeg } from './x01Sim';
import { x01PlayerStats } from './x01Stats';

const leg = (starter: 1 | 2, scores: Array<number | null>, checkoutDarts: 1 | 2 | 3 | null = null): Leg => ({
  starter,
  visits: scores.map((s) => (s === null ? { score: 0, bust: true } : { score: s, bust: false })),
  checkoutDarts,
});

describe('501-statistieken over meerdere matchen', () => {
  it('9-darter, eerste 9, 100+/140+/180, beste leg en uitgooi', () => {
    const stats = x01PlayerStats([
      // a begint: 180 180 141 (9 darts); b: 100 140.
      { leg: leg(1, [180, 100, 180, 140, 141], 3), players: ['a', 'b'] },
      // b begint (a is speler 2): b 60 bust 45 26; a 100 140 140 121 (uitgooi in 2 darts).
      { leg: leg(1, [60, 100, null, 140, 45, 140, 26, 121], 2), players: ['b', 'a'] },
    ]);
    const a = stats.get('a');
    expect(a).toMatchObject({ legs: 2, legsWon: 2, count180: 2, count140: 3, count100: 2, bestLeg: 9, highestFinish: 141 });
    // a: leg 1 501 in 9 darts; leg 2 501 in 3+3+3+2 = 11 darts.
    expect(a?.darts).toBe(20);
    expect(a?.points).toBe(1002);
    // Eerste 9: 501 in leg 1 + 380 in leg 2, over 18 darts.
    expect(a?.first9Average).toBe(146.83);
    const b = stats.get('b');
    expect(b).toMatchObject({ legs: 2, legsWon: 0, count140: 1, count100: 1, bestLeg: null, highestFinish: null });
    // b: 240 in 6 darts + (60 + bust + 45 + 26) in 12 darts.
    expect(b?.darts).toBe(18);
    expect(b?.points).toBe(371);
  });

  it('komt overeen met de statistieken per match', () => {
    const rng = createRng('season');
    const legs = Array.from({ length: 40 }, (_, i) => simulateLeg(rng, (1 + (i % 2)) as 1 | 2, (1 + ((i >> 1) % 2)) as 1 | 2));
    const stats = x01PlayerStats(legs.map((l) => ({ leg: l, players: ['x', 'y'] as const })));
    const [x, y] = matchStats(legs);
    expect(stats.get('x')).toMatchObject({ darts: x.darts, points: x.points, count180: x.count180, legs: 40 });
    expect(stats.get('y')).toMatchObject({ darts: y.darts, points: y.points, count180: y.count180 });
    expect(stats.get('x')?.legsWon).toBe(legs.filter((l) => legState(l).winner === 1).length);
  });
});
