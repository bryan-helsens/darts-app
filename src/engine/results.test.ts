import { describe, expect, it } from 'vitest';
import { buildKnockout } from './bracket';
import { applyResult, autoWalkovers, legsToWin, ResultError, validateScore } from './results';
import { DEFAULT_LEGS } from './settings';
import type { Match } from './types';

const bracket = () =>
  buildKnockout(
    'A',
    ['a', 'b', 'c', 'd'].map((id, i) => ({ playerId: id, poolId: `P${i}`, poolPosition: 1, withdrawn: false })),
    DEFAULT_LEGS.A,
    0,
  ).matches;
const find = (ms: Match[], id: string) => ms.find((m) => m.id === id) as Match;

describe('score-invoer', () => {
  it('valideert de legs volgens de best-of', () => {
    expect(legsToWin(3)).toBe(2);
    expect(legsToWin(5)).toBe(3);
    expect(validateScore(3, 2, 1)).toBeNull();
    expect(validateScore(3, 0, 2)).toBeNull();
    expect(validateScore(3, 2, 2)).not.toBeNull();
    expect(validateScore(3, 3, 0)).not.toBeNull();
    expect(validateScore(3, 1, 1)).not.toBeNull();
    expect(validateScore(1, 1, 0)).toBeNull();
    expect(validateScore(5, -1, 3)).not.toBeNull();
  });

  it('schuift de winnaar door naar de volgende match', () => {
    let ms = bracket();
    const [sf1, sf2] = ms.filter((m) => m.round === 1);
    ms = applyResult(ms, sf1.id, { legs1: 3, legs2: 1, finishedAt: 10 });
    ms = applyResult(ms, sf2.id, { legs1: 0, legs2: 3, finishedAt: 11 });
    const final = find(ms, 'A-R2-1');
    expect(final.player1).toBe(sf1.player1);
    expect(final.player2).toBe(sf2.player2);
  });

  it('past een correctie door zolang de volgende match niet gespeeld is', () => {
    let ms = bracket();
    const sf1 = ms.filter((m) => m.round === 1)[0];
    ms = applyResult(ms, sf1.id, { legs1: 3, legs2: 1, finishedAt: 10 });
    ms = applyResult(ms, sf1.id, { legs1: 1, legs2: 3, finishedAt: 20 });
    expect(find(ms, 'A-R2-1').player1).toBe(sf1.player2);
    // Het oorspronkelijke tijdstip blijft bewaard.
    expect(find(ms, sf1.id).finishedAt).toBe(10);
  });

  it('weigert een correctie als de volgende match al gespeeld is', () => {
    let ms = bracket();
    const [sf1, sf2] = ms.filter((m) => m.round === 1);
    ms = applyResult(ms, sf1.id, { legs1: 3, legs2: 1, finishedAt: 10 });
    ms = applyResult(ms, sf2.id, { legs1: 3, legs2: 1, finishedAt: 11 });
    ms = applyResult(ms, 'A-R2-1', { legs1: 3, legs2: 2, finishedAt: 12 });
    expect(() => applyResult(ms, sf1.id, { legs1: 0, legs2: 3, finishedAt: 13 })).toThrow(ResultError);
    // Dezelfde winnaar met een andere score mag wel.
    expect(() => applyResult(ms, sf1.id, { legs1: 3, legs2: 0, finishedAt: 13 })).not.toThrow();
  });

  it('weigert een uitslag zonder gekende spelers', () => {
    expect(() => applyResult(bracket(), 'A-R2-1', { legs1: 3, legs2: 0, finishedAt: 1 })).toThrow(ResultError);
  });

  it('verwerkt walk-overs na een opgave, ook verderop in het schema', () => {
    let ms = bracket();
    const [sf1, sf2] = ms.filter((m) => m.round === 1);
    const quitter = sf1.player1 as string;
    ms = autoWalkovers(ms, new Set([quitter]), 50);
    const sf1After = find(ms, sf1.id);
    expect(sf1After.walkover).toBe(true);
    expect(sf1After.winner).toBe(sf1.player2);
    expect(sf1After.legs2).toBe(3);
    // De andere halve finale wordt gewoon gespeeld.
    expect(find(ms, sf2.id).winner).toBeNull();
    // Gaven beide finalisten op, dan wint speler 1 (rest van het schema loopt verder).
    ms = applyResult(ms, sf2.id, { legs1: 3, legs2: 0, finishedAt: 60 });
    ms = autoWalkovers(ms, new Set([quitter, sf1.player2 as string, sf2.player1 as string]), 70);
    expect(find(ms, 'A-R2-1').walkover).toBe(true);
  });
});
