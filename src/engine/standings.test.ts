import { describe, expect, it } from 'vitest';
import { open, played } from '../../tests/engine/helpers';
import { barrageKey, barrageNeeds, createBarrageMatches, poolStandings } from './standings';
import type { Match, Pool } from './types';

const pool: Pool = { id: 'P1', label: 'Poule 1', playerIds: ['a', 'b', 'c', 'd'] };
const order = (matches: Match[], opts: Parameters<typeof poolStandings>[2] = { lotSeed: 'x' }) =>
  poolStandings(pool, matches, opts).rows.map((r) => r.playerId);

describe('poulerangschikking', () => {
  it('rangschikt op gewonnen matchen', () => {
    const m = [played('a', 'b', 2, 0), played('a', 'c', 2, 1), played('a', 'd', 2, 0), played('b', 'c', 2, 1), played('b', 'd', 2, 0), played('c', 'd', 2, 1)];
    expect(order(m)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gebruikt legsaldo bij gelijke winst', () => {
    // a>b 2-0, b>c 2-1, c>a 2-1 en iedereen wint van d: legsaldo a +3, c +2, b +1.
    const m = [played('a', 'b', 2, 0), played('b', 'c', 2, 1), played('c', 'a', 2, 1), played('a', 'd', 2, 0), played('b', 'd', 2, 0), played('c', 'd', 2, 0)];
    expect(order(m)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('gebruikt onderling resultaat bij volledig gelijke cijfers', () => {
    // a en b: 2 winsten, 5–3 in legs; a won het onderlinge duel.
    const m = [played('a', 'b', 2, 1), played('c', 'a', 2, 1), played('a', 'd', 2, 0), played('b', 'c', 2, 0), played('b', 'd', 2, 1), played('c', 'd', 2, 0)];
    const s = poolStandings(pool, m, { lotSeed: 'x' });
    expect(s.rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(s.lotGroups).toEqual([]);
  });

  it('loot bij een volledige cirkel en vraagt dan een barrage op de A/B-grens', () => {
    const m = [played('a', 'b', 2, 1), played('b', 'c', 2, 1), played('c', 'a', 2, 1), played('a', 'd', 2, 0), played('b', 'd', 2, 0), played('c', 'd', 2, 0)];
    const s = poolStandings(pool, m, { lotSeed: 'x' });
    expect(s.lotGroups).toHaveLength(1);
    expect([...s.lotGroups[0]].sort()).toEqual(['a', 'b', 'c']);
    expect(s.rows.slice(0, 3).every((r) => r.byLot)).toBe(true);
    expect(s.rows[3].playerId).toBe('d');
    // Met top 2 naar A loopt de gelijke stand over de grens.
    const needs = barrageNeeds(s, 2, m);
    expect(needs).toHaveLength(1);
    expect(needs[0].positions).toEqual([1, 2, 3]);
    // Met top 3 naar A niet.
    expect(barrageNeeds(s, 3, m)).toEqual([]);
    // Een gekozen loting heft de nood op.
    expect(barrageNeeds(s, 2, m, new Set([barrageKey('P1', ['c', 'a', 'b'])]))).toEqual([]);
  });

  it('beslist met de barrage', () => {
    const m: Match[] = [played('a', 'b', 2, 1), played('b', 'c', 2, 1), played('c', 'a', 2, 1), played('a', 'd', 2, 0), played('b', 'd', 2, 0), played('c', 'd', 2, 0)];
    const s = poolStandings(pool, m, { lotSeed: 'x' });
    const [need] = barrageNeeds(s, 2, m);
    const barrages = createBarrageMatches(need, 1, 100, m);
    expect(barrages).toHaveLength(3);
    expect(barrages.every((b) => b.bestOf === 1 && b.stage === 'barrage')).toBe(true);
    // Zolang de barrage loopt, is er geen nieuwe nood.
    expect(barrageNeeds(s, 2, [...m, ...barrages])).toEqual([]);
    const result = [
      ...m,
      played('c', 'b', 1, 0, { stage: 'barrage' }),
      played('c', 'a', 1, 0, { stage: 'barrage' }),
      played('b', 'a', 1, 0, { stage: 'barrage' }),
    ];
    const after = poolStandings(pool, result, { lotSeed: 'x' });
    expect(after.rows.map((r) => r.playerId)).toEqual(['c', 'b', 'a', 'd']);
    expect(after.lotGroups).toEqual([]);
    // Barragematchen tellen niet mee in het poulesaldo.
    expect(after.rows[0].won).toBe(2);
  });

  it('gebruikt het gemiddelde als dat voor iedereen gekend is', () => {
    const m = [played('a', 'b', 2, 1), played('b', 'c', 2, 1), played('c', 'a', 2, 1), played('a', 'd', 2, 0), played('b', 'd', 2, 0), played('c', 'd', 2, 0)];
    const averages = new Map([
      ['a', 40],
      ['b', 55],
      ['c', 48],
      ['d', 30],
    ]);
    expect(order(m, { lotSeed: 'x', averages })).toEqual(['b', 'c', 'a', 'd']);
  });

  it('zet spelers die opgaven onderaan', () => {
    const m = [played('d', 'a', 2, 0), played('d', 'b', 2, 0), played('a', 'b', 2, 0), played('a', 'c', 2, 0), played('b', 'c', 2, 0), played('c', 'd', 2, 0, { walkover: true })];
    const s = poolStandings(pool, m, { lotSeed: 'x', withdrawn: new Set(['d']) });
    expect(s.rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(s.rows[3].withdrawn).toBe(true);
  });

  it('is pas compleet als alle matchen gespeeld zijn', () => {
    const m = [played('a', 'b', 2, 0), open('o1', 'c', 'd')];
    expect(poolStandings(pool, m, { lotSeed: 'x' }).complete).toBe(false);
    expect(poolStandings(pool, [m[0]], { lotSeed: 'x' }).complete).toBe(true);
  });

  it('loot reproduceerbaar', () => {
    const m = [played('a', 'b', 2, 1), played('b', 'c', 2, 1), played('c', 'a', 2, 1), played('a', 'd', 2, 0), played('b', 'd', 2, 0), played('c', 'd', 2, 0)];
    expect(order(m, { lotSeed: 'avond-7' })).toEqual(order(m, { lotSeed: 'avond-7' }));
  });
});
