import { describe, expect, it } from 'vitest';
import { played } from '../../tests/engine/helpers';
import { createRng } from './rng';
import {
  applyVisit,
  legStarter,
  legState,
  matchScore,
  matchStats,
  newLeg,
  poolAverages,
  threeDartAverage,
  undoVisit,
  validateLeg,
  type Leg,
  type Slot,
  type VisitInput,
} from './x01';
import { simulateLeg } from './x01Sim';

/** Speelt een reeks beurten; geeft de leg na de laatste geldige beurt. */
function play(starter: Slot, inputs: VisitInput[]): Leg {
  let leg = newLeg(starter);
  for (const input of inputs) {
    const outcome = applyVisit(leg, input);
    if (outcome.kind === 'invalid' || outcome.kind === 'needs-darts') throw new Error(`${JSON.stringify(input)}: ${outcome.kind}`);
    leg = outcome.leg;
  }
  return leg;
}
const s = (score: number, checkoutDarts?: 1 | 2 | 3): VisitInput => ({ score, checkoutDarts });

describe('501 per beurt', () => {
  it('beurten wisselen af en tellen af', () => {
    const leg = play(2, [s(60), s(100), s(140)]);
    const state = legState(leg);
    // Speler 2 begon: 60 en 140 voor speler 2, 100 voor speler 1.
    expect(state.remaining).toEqual([401, 301]);
    expect(state.toThrow).toBe(1);
    expect(state.darts).toEqual([3, 6]);
    expect(state.winner).toBeNull();
  });

  it('busts: te veel, 1 over, 0 zonder geldige uitgooi en manueel', () => {
    let leg = play(1, [s(180), s(0), s(180), s(0), s(81)]); // rest 60 voor speler 1
    expect(legState(leg).remaining[0]).toBe(60);
    leg = play(1, [s(180), s(0), s(180), s(0), s(81), s(0)]);
    const over = applyVisit(leg, s(61));
    expect(over).toMatchObject({ kind: 'bust', reason: 'over' });
    expect(applyVisit(leg, s(59))).toMatchObject({ kind: 'bust', reason: 'one-left' });
    // 170 overhouden en 180 is te veel; 169 uitgooien kan niet (bogey).
    const bogey = play(1, [s(180), s(0), s(152), s(0)]); // rest 169
    expect(legState(bogey).remaining[0]).toBe(169);
    expect(applyVisit(bogey, s(169))).toMatchObject({ kind: 'invalid' }); // 169 kan je niet gooien
    const bust = applyVisit(leg, { bust: true });
    expect(bust).toMatchObject({ kind: 'bust', reason: 'manual' });
    if (bust.kind === 'bust') {
      expect(legState(bust.leg).remaining[0]).toBe(60);
      expect(legState(bust.leg).darts[0]).toBe(12);
    }
    // Manueel bust kan pas vanaf 181 rest.
    expect(applyVisit(newLeg(1), { bust: true })).toMatchObject({ kind: 'invalid' });
  });

  it('onmogelijke scores worden geweigerd', () => {
    for (const n of [179, 163, 181, -1, 2.5]) expect(applyVisit(newLeg(1), s(n)).kind).toBe('invalid');
  });

  it('uitgooien: vraagt het aantal darts als dat niet vastligt', () => {
    const leg = play(1, [s(180), s(0), s(180), s(0), s(101), s(0)]); // rest 40
    expect(applyVisit(leg, s(40))).toEqual({ kind: 'needs-darts', options: [1, 2, 3] });
    const won = applyVisit(leg, s(40, 2));
    expect(won).toMatchObject({ kind: 'won', winner: 1 });
    if (won.kind === 'won') {
      expect(legState(won.leg).darts[0]).toBe(3 + 3 + 3 + 2);
      expect(applyVisit(won.leg, s(10))).toMatchObject({ kind: 'invalid' });
      // Ongedaan maken haalt ook de uitgooi weg.
      const undone = undoVisit(won.leg);
      expect(undone.checkoutDarts).toBeNull();
      expect(legState(undone).winner).toBeNull();
    }
    // 141 kan enkel met drie darts: geen vraag.
    const leg141 = play(1, [s(180), s(0), s(180), s(0)]); // rest 141
    expect(applyVisit(leg141, s(141))).toMatchObject({ kind: 'won' });
    expect(applyVisit(leg141, s(141, 2))).toMatchObject({ kind: 'invalid' });
  });

  it('een 9-darter = 167,00 gemiddeld', () => {
    const leg = play(1, [s(180), s(0), s(180), s(0), s(141)]);
    const [p1, p2] = matchStats([leg]);
    expect(p1).toEqual({ darts: 9, points: 501, count180: 2, highestScore: 180, highestFinish: 141 });
    expect(threeDartAverage(p1)).toBe(167);
    expect(threeDartAverage(p2)).toBe(0);
    expect(threeDartAverage({ darts: 0, points: 0 })).toBeNull();
  });

  it('busts tellen als 3 darts en 0 punten; uitgooi onder 100 telt niet als hoge finish', () => {
    // Speler 2 begint: 140, 140, 140, 41 → rest 40. Speler 1: 140, 140, 100 → rest 121, dan bust.
    let leg = play(2, [s(140), s(140), s(140), s(140), s(140), s(100), s(41), { bust: true }]);
    const outcome = applyVisit(leg, s(40, 1));
    expect(outcome.kind).toBe('won');
    if (outcome.kind === 'won') leg = outcome.leg;
    const [p1, p2] = matchStats([leg]);
    expect(p1).toMatchObject({ darts: 12, points: 380, highestFinish: null });
    expect(p2).toMatchObject({ darts: 13, points: 501, highestScore: 140, highestFinish: null });
  });

  it('wie begint wisselt per leg; legstand per match', () => {
    expect([0, 1, 2, 3].map((i) => legStarter(2, i))).toEqual([2, 1, 2, 1]);
    const rng = createRng('match');
    const legs = [simulateLeg(rng, 1, 1), simulateLeg(rng, 2, 2), simulateLeg(rng, 1, 1)];
    expect(matchScore(legs, 3)).toEqual({ legs: [2, 1], winner: 1, need: 2 });
    expect(matchScore(legs.slice(0, 2), 3)).toEqual({ legs: [1, 1], winner: null, need: 2 });
  });

  it('gegenereerde legs zijn geldig en worden gewonnen door wie moet winnen', () => {
    const rng = createRng('sim');
    for (let i = 0; i < 300; i++) {
      const starter = (1 + (i % 2)) as Slot;
      const winner = (1 + ((i >> 1) % 2)) as Slot;
      const leg = simulateLeg(rng, starter, winner);
      expect(validateLeg(leg)).toBeNull();
      expect(legState(leg).winner).toBe(winner);
    }
  });

  it('validateLeg vindt fouten', () => {
    const good = play(1, [s(180), s(0), s(180), s(0), s(141)]);
    expect(validateLeg(good)).toBeNull();
    expect(validateLeg({ ...good, visits: [...good.visits.slice(0, -1), { score: 179, bust: false }] })).toMatch(/179/);
    expect(validateLeg({ ...good, checkoutDarts: 2 })).toMatch(/141/);
    expect(validateLeg({ ...good, visits: [...good.visits, { score: 0, bust: false }] })).toMatch(/uitgespeeld/);
    expect(validateLeg({ starter: 1, visits: [{ score: 0, bust: true }], checkoutDarts: null })).toMatch(/181/);
    expect(validateLeg({ starter: 1, visits: [{ score: 60, bust: false }], checkoutDarts: 2 })).toMatch(/Uitgooi/);
  });

  it('poulegemiddelde enkel als alle poulematchen per beurt gescoord werden', () => {
    const m1 = played('a', 'b', 2, 1, { id: 'm1' });
    const m2 = played('a', 'c', 2, 0, { id: 'm2' });
    const m3 = played('b', 'c', 2, 0, { id: 'm3' });
    const wo = played('a', 'd', 2, 0, { id: 'm4', walkover: true });
    const ko = played('a', 'b', 2, 0, { id: 'k1', stage: 'A' });
    const totals = new Map([
      ['m1', new Map([['a', { darts: 45, points: 750 }], ['b', { darts: 42, points: 600 }]])],
      ['m2', new Map([['a', { darts: 30, points: 501 }], ['c', { darts: 27, points: 300 }]])],
      ['k1', new Map([['a', { darts: 15, points: 501 }]])],
    ]);
    const avg = poolAverages([m1, m2, m3, wo, ko], totals);
    // a: (750 + 501) / 75 × 3 = 50,04 — walk-over en KO tellen niet.
    expect(avg.get('a')).toBe(50.04);
    // b en c hebben m3 zonder beurten: geen gemiddelde.
    expect(avg.has('b')).toBe(false);
    expect(avg.has('c')).toBe(false);
  });
});
