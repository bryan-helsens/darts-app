import { describe, expect, it } from 'vitest';
import { played } from '../../tests/engine/helpers';
import { seasonRanking, type EventResultRow } from './ranking';

const r = (eventId: string, playerId: string, placeFrom: number, points: number): EventResultRow => ({
  eventId,
  playerId,
  placeFrom,
  placeTo: placeFrom,
  points,
});
const bestOf = { enabled: true, count: 2, of: 3 };

describe('seizoensranking', () => {
  it('telt enkel de beste X avonden (deelnamepunten inbegrepen)', () => {
    const rows = seasonRanking(
      [r('e1', 'a', 1, 27), r('e2', 'a', 9, 8), r('e3', 'a', 17, 5), r('e1', 'b', 2, 22), r('e2', 'b', 2, 22)],
      [],
      bestOf,
      'x',
    );
    expect(rows.map((x) => [x.playerId, x.counted, x.total])).toEqual([
      ['b', 44, 44],
      ['a', 35, 40],
    ]);
    expect(rows[1].countedEventIds).toEqual(['e1', 'e2']);
  });

  it('telt alles mee als beste X uit staat', () => {
    const rows = seasonRanking([r('e1', 'a', 1, 27), r('e2', 'a', 9, 8), r('e3', 'a', 17, 5)], [], { ...bestOf, enabled: false }, 'x');
    expect(rows[0].counted).toBe(40);
  });

  it('beslist gelijke stand op aantal overwinningen, dan beste resultaat', () => {
    const rows = seasonRanking(
      [r('e1', 'a', 1, 27), r('e2', 'a', 9, 8), r('e1', 'b', 3, 17), r('e2', 'b', 3, 17), r('e1', 'c', 2, 22), r('e2', 'c', 5, 12)],
      [],
      bestOf,
      'x',
    );
    // a: 35 met 1 overwinning; b: 34; c: 34 maar beste plaats 2 (b: 3).
    expect(rows.map((x) => x.playerId)).toEqual(['a', 'c', 'b']);
  });

  it('gebruikt daarna het onderling resultaat en de gewonnen legs', () => {
    const results = [r('e1', 'a', 3, 17), r('e1', 'b', 3, 17), r('e1', 'c', 3, 17)];
    const h2h = [played('b', 'a', 2, 0, { stage: 'A' }), played('c', 'x', 2, 0, { stage: 'B' }), played('c', 'y', 2, 1, { stage: 'B' })];
    const rows = seasonRanking(results, h2h, bestOf, 'x');
    // b won onderling van a; c heeft het onderlinge duel niet gespeeld maar meer legs.
    expect(rows.map((x) => x.playerId)).toEqual(['b', 'c', 'a']);
  });

  it('loot als laatste redmiddel, reproduceerbaar', () => {
    const results = [r('e1', 'a', 5, 12), r('e1', 'b', 5, 12)];
    const one = seasonRanking(results, [], bestOf, 'seizoen-2027');
    expect(one.every((x) => x.byLot)).toBe(true);
    expect(seasonRanking(results, [], bestOf, 'seizoen-2027')).toEqual(one);
  });
});
