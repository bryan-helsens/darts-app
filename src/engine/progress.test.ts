import { describe, expect, it } from 'vitest';
import type { EloPoint } from './elo';
import { averageProgress, eloProgress, rankingProgress } from './progress';
import type { EventResultRow } from './ranking';

const r = (eventId: string, playerId: string, placeFrom: number, points: number): EventResultRow => ({ eventId, playerId, placeFrom, placeTo: placeFrom, points });

describe('verloop voor de grafieken', () => {
  const events = [
    { id: 'e2', date: '2027-02-20' },
    { id: 'e1', date: '2027-01-16' },
    { id: 'e3', date: '2027-03-20' },
    { id: 'e4', date: '2027-04-17' },
  ];
  const results = [r('e1', 'a', 1, 27), r('e1', 'b', 2, 22), r('e2', 'b', 1, 27), r('e2', 'a', 3, 17), r('e3', 'c', 1, 27), r('e3', 'b', 2, 22)];

  it('plaats in de ranking na elke avond, chronologisch', () => {
    const input = { events, results, matches: [], bestOf: { enabled: false, count: 8, of: 11 }, lotSeed: 's' };
    // Na e1: a 27, b 22. Na e2: b 49, a 44. Na e3: b 71, a 44, c 27.
    expect(rankingProgress(input, 'a').map((p) => [p.eventId, p.value])).toEqual([
      ['e1', 1],
      ['e2', 2],
      ['e3', 2],
    ]);
    expect(rankingProgress(input, 'b').map((p) => p.value)).toEqual([2, 1, 1]);
    // c verschijnt pas vanaf de avond met punten.
    expect(rankingProgress(input, 'c').map((p) => [p.eventId, p.value])).toEqual([['e3', 3]]);
    // Een avond zonder uitslagen (nog niet afgesloten) telt niet.
    expect(rankingProgress(input, 'a').some((p) => p.eventId === 'e4')).toBe(false);
    expect(rankingProgress(input, 'nobody')).toEqual([]);
  });

  it('Elo na elke avond (laatste match telt)', () => {
    const history: EloPoint[] = [
      { matchId: 'm1', eventId: 'e1', date: '2027-01-16', before: 1500, after: 1524 },
      { matchId: 'm2', eventId: 'e1', date: '2027-01-16', before: 1524, after: 1510 },
      { matchId: 'm3', eventId: 'e2', date: '2027-02-20', before: 1510, after: 1530 },
    ];
    expect(eloProgress(history)).toEqual([
      { eventId: 'e1', date: '2027-01-16', value: 1510 },
      { eventId: 'e2', date: '2027-02-20', value: 1530 },
    ]);
    expect(eloProgress(undefined)).toEqual([]);
  });

  it('gemiddelde per avond, op datum', () => {
    const points = averageProgress([
      { eventId: 'e2', date: '2026-02-20', darts: 30, points: 600 },
      { eventId: 'e1', date: '2026-01-16', darts: 27, points: 501 },
      { eventId: 'e2', date: '2026-02-20', darts: 30, points: 400 },
      { eventId: 'e3', date: '2026-03-20', darts: 0, points: 0 },
    ]);
    expect(points).toEqual([
      { eventId: 'e1', date: '2026-01-16', value: 55.67 },
      { eventId: 'e2', date: '2026-02-20', value: 50 },
    ]);
  });
});
