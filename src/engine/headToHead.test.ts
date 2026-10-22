import { describe, expect, it } from 'vitest';
import { headToHead, type HeadToHeadMatch } from './headToHead';

const m = (key: string, p1: string, p2: string, l1: number, l2: number, at: number, walkover = false): HeadToHeadMatch => ({
  key,
  player1: p1,
  player2: p2,
  legs1: l1,
  legs2: l2,
  winner: l1 > l2 ? p1 : p2,
  walkover,
  finishedAt: at,
});

describe('onderlinge duels', () => {
  it('per tegenstander: matchen, zeges, legs, recentste eerst', () => {
    const rows = headToHead(
      [
        m('x1', 'a', 'b', 2, 1, 10),
        m('x2', 'b', 'a', 2, 0, 30),
        m('x3', 'a', 'c', 2, 0, 20),
        m('x4', 'a', 'b', 3, 1, 40),
        m('x5', 'b', 'c', 2, 0, 50),
        // Walk-over telt niet.
        m('x6', 'a', 'c', 2, 0, 60, true),
      ],
      'a',
    );
    expect(rows).toEqual([
      { opponent: 'b', played: 3, won: 2, lost: 1, legsFor: 5, legsAgainst: 4, last: 40, matches: ['x4', 'x2', 'x1'] },
      { opponent: 'c', played: 1, won: 1, lost: 0, legsFor: 2, legsAgainst: 0, last: 20, matches: ['x3'] },
    ]);
  });

  it('niets gespeeld: lege lijst', () => {
    expect(headToHead([m('x', 'b', 'c', 2, 0, 1)], 'a')).toEqual([]);
  });
});
