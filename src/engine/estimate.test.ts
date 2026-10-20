import { describe, expect, it } from 'vitest';
import { MIN, played } from '../../tests/engine/helpers';
import { calibrateMinutesPerLeg, estimatePlan, expectedLegs, forecastLive, suggestAdjustments } from './estimate';
import { standardSizes } from './poolLayouts';
import { replaySchedule } from './scheduler';
import { DEFAULT_LEGS, DEFAULT_TIMING } from './settings';

const START = Date.UTC(2026, 10, 21, 18, 0); // 19u00 Brussel
const at = (h: number, m: number) => Date.UTC(2026, 10, 21, h - 1, m);
const plan = (players: number, boards: number) => ({
  sizes: standardSizes(players),
  advance: 2,
  boards,
  legs: DEFAULT_LEGS,
  timing: DEFAULT_TIMING,
  holdFinal: true,
  start: START,
});

describe('tijdsinschatting', () => {
  it('kent het verwachte aantal legs', () => {
    expect(expectedLegs(1)).toBe(1);
    expect(expectedLegs(3)).toBeCloseTo(2.5);
    expect(expectedLegs(5)).toBeCloseTo(4.125);
  });

  it('eindigt niet later met meer borden', () => {
    for (const players of [12, 20, 30]) {
      let previous = Number.POSITIVE_INFINITY;
      for (let boards = 4; boards <= 8; boards++) {
        const e = estimatePlan(plan(players, boards));
        expect(e.end).toBeLessThanOrEqual(previous + MIN);
        expect(e.poolsEnd).toBeLessThan(e.end);
        previous = e.end;
      }
    }
  });

  it('schat een kleine avond vroeg in', () => {
    expect(estimatePlan(plan(12, 6)).end).toBeLessThan(at(22, 0));
  });

  it('stelt aanpassingen voor als 30 spelers op 6 borden te laat eindigen', () => {
    const input = plan(30, 6);
    const limit = at(23, 15);
    const base = estimatePlan(input);
    expect(base.end).toBeGreaterThan(limit);
    expect(base.poolMatches).toBe(50);
    const suggestions = suggestAdjustments(input, limit);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.estimate.end < base.end)).toBe(true);
    const bo1 = suggestions.find((s) => s.id === 'pool-bo1');
    expect(bo1?.meetsLimit).toBe(true);
    expect(suggestions[0].estimate.end).toBeLessThanOrEqual(bo1!.estimate.end);
  });
});

describe('live bijsturen', () => {
  it('meet de werkelijke speelduur per leg', () => {
    const start = 0;
    // Drie matchen van 3 legs die elk 20 minuten duurden op 3 borden → (20-2)/3 = 6 min/leg.
    const ms = ['a', 'b', 'c'].map((p, i) => played(p, `${p}2`, 2, 1, { id: `c${i}`, finishedAt: 20 * MIN, position: i }));
    const replay = replaySchedule(ms, [], { start, boards: [1, 2, 3], mainBoard: 1, holdFinal: true, minRestMs: 0 }, 30 * MIN);
    const slow = calibrateMinutesPerLeg(ms, replay, { ...DEFAULT_TIMING, minutesPerLeg: 6 });
    expect(slow.samples).toBe(3);
    expect(slow.minutesPerLeg).toBeCloseTo(6);
    const fewer = calibrateMinutesPerLeg(ms.slice(0, 2), replay, DEFAULT_TIMING);
    expect(fewer.minutesPerLeg).toBe(DEFAULT_TIMING.minutesPerLeg);
  });

  it('rekent de KO-fase mee zolang die nog niet aangemaakt is', () => {
    const ms = ['a', 'b'].map((p, i) => played(p, `${p}2`, 2, 0, { id: `p${i}`, finishedAt: 10 * MIN, position: i }));
    const cfg = { start: 0, boards: [1, 2], mainBoard: 1, holdFinal: true, minRestMs: 0 };
    const withKo = forecastLive({ matches: ms, log: [], config: cfg, now: 11 * MIN, timing: DEFAULT_TIMING, legs: DEFAULT_LEGS, plannedKnockout: { sizes: [2, 2], advance: 1 } });
    const without = forecastLive({ matches: ms, log: [], config: cfg, now: 11 * MIN, timing: DEFAULT_TIMING, legs: DEFAULT_LEGS, plannedKnockout: null });
    expect(withKo.forecast.end).toBeGreaterThan(without.forecast.end as number);
  });
});
